"""
src/app_windows.py - Windows-compatible version of the WhatsApp application bot
"""
import os
import re
import json
import logging
import datetime
from typing import Dict, Any, Optional, List
import uuid
import hashlib # For Calendly webhook signature verification
import hmac    # For Calendly webhook signature verification

# WhatsApp API integration
from heyoo import WhatsApp
from flask import Flask, request, Response, jsonify

# Database integration
import supabase
from supabase import create_client, Client

# File handling
import tempfile
from werkzeug.utils import secure_filename

# For Gemini API
import google.generativeai as genai

# For Calendly API
from calendly import Calendly

# For Windows compatibility
from waitress import serve
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Initialize Flask app
app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO,
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize WhatsApp client
WHATSAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN")
VERIFY_TOKEN = os.environ.get("VERIFY_TOKEN")
PHONE_NUMBER_ID = os.environ.get("PHONE_NUMBER_ID")

messenger = WhatsApp(WHATSAPP_TOKEN, phone_number_id=PHONE_NUMBER_ID)

# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Initialize Gemini API
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_API_KEY)

# Initialize Calendly client
CALENDLY_PERSONAL_ACCESS_TOKEN = os.environ.get("CALENDLY_PERSONAL_ACCESS_TOKEN")
CALENDLY_WEBHOOK_SIGNING_KEY = os.environ.get("CALENDLY_WEBHOOK_SIGNING_KEY") # You'll get this when you create a webhook
calendly_client = Calendly(CALENDLY_PERSONAL_ACCESS_TOKEN)
CALENDLY_WEBHOOK_URL = os.environ.get("CALENDLY_WEBHOOK_URL") # e.g., https://your-app-url.com/calendly-webhook

# Add a root endpoint to check if server is running
@app.route("/", methods=["GET"])
def root():
    """Root endpoint to check if the server is running"""
    return jsonify({"message": "Job Application Bot is running!"})

# Calendly and office information
CALENDLY_LINK = os.environ.get("CALENDLY_LINK", "https://calendly.com/your-company/job-interview")
OFFICE_DIRECTIONS = """
Our office is located at:
123 Business Street
Suite 456
Business City, BC 12345

Nearest transit:
- Bus: Routes 10, 15 (stop at Business Square)
- Train: Central Station (5-minute walk)

Please arrive 15 minutes before your scheduled time.
"""

# Google Form link
GOOGLE_FORM_LINK = os.environ.get("GOOGLE_FORM_LINK", "https://forms.gle/yourFormLink")

# Application steps
STEPS = {
    "initial_contact": "confirm_intent",
    "confirm_intent": "commitment_check",
    "commitment_check": "request_resume",
    "request_resume": "request_form",
    "request_form": "waiting_review",
    "waiting_review": "request_interview_details",  # Ask for Name/NRIC after approval
    "request_interview_details": "waiting_calendly_booking", # Name/NRIC collected, Calendly link sent
    "waiting_calendly_booking": "confirmation", # Calendly webhook received, booking confirmed
    "confirmation": "completed"
}

# Gemini model configurations for each step
GEMINI_MODELS = {
    "confirm_intent": {
        "model_name": "gemini-1.5-flash-latest", # Updated model
        "temperature": 0.2,
        "instructions": """
        You are an HR assistant for job applications. Your job is to determine if the user intends to apply for a job.
        You must ONLY respond in JSON format with the following structure:
        {
            "intent_confirmed": true/false,
            "confidence": 0.0-1.0,
            "response": "your response message here"
        }
        If the user clearly expresses interest in applying for a job, set intent_confirmed to true.
        If the user is just asking questions or not clearly applying, set intent_confirmed to false.
        Keep your responses professional, brief and straightforward.
        """
    },
    "commitment_check": {
        "model_name": "gemini-2.5-flash-preview-05-20",
        "temperature": 0.1,
        "instructions": """
        You are an HR assistant checking a job applicant's commitment period. Your role is to determine if the applicant can commit to at least 1 month.
        You must ONLY respond in JSON format with the following structure:
        {
            "commitment_sufficient": true/false,
            "commitment_period": "extracted period",
            "period_in_months": number,
            "response": "your response message here"
        }
        Examples:
        User: "I can commit for 2 weeks"
        Your response:
        {
            "commitment_sufficient": false,
            "commitment_period": "2 weeks",
            "period_in_months": 0.5,
            "response": "I'm sorry, we require a minimum commitment of 1 month. Thank you for your interest."
        }
        User: "I'm available for 3 months starting July"
        Your response:
        {
            "commitment_sufficient": true,
            "commitment_period": "3 months",
            "period_in_months": 3,
            "response": "Great! 3 months is a suitable commitment period for this position."
        }
        User: "I'm not sure how long I can commit"
        Your response:
        {
            "commitment_sufficient": false,
            "commitment_period": "undefined",
            "period_in_months": 0,
            "response": "We require a minimum commitment of 1 month for this position. Could you please let us know if you can commit to at least 1 month?"
        }
        Analyze the text to extract the commitment period and determine if it's at least 1 month.
        Be flexible with how people express time periods (weeks, months, years).
        1 month = 4 weeks = 30 days
        """
    },
    "request_resume": {
        "model_name": "gemini-1.5-flash-latest", # Updated model
        "temperature": 0.1,
        "instructions": """
        You are an HR assistant handling job applications. Your role is to help users upload their resume.
        You must ONLY respond in JSON format with the following structure:
        {
            "resume_received": true/false,
            "file_type_valid": true/false,
            "needs_guidance": true/false,
            "response": "your response message here"
        }
        If the user has sent a file (doc, docx, pdf) or pasted text that looks like a resume, set resume_received to true.
        If the user says they don't have a resume or don't know what it is, set needs_guidance to true.
        For any other response (questions, irrelevant messages), keep both values as false.
        Keep your responses professional and helpful.
        """
    },
    "request_interview_details": { # Renamed from schedule_interview, focused on Name/NRIC
        "model_name": "gemini-1.5-flash-latest", # Updated model
        "temperature": 0.1,
        "instructions": """
        You are an HR assistant. The applicant has been approved for an interview.
        Your role is to verify if the user has provided their FULL NAME and NRIC (National Registration Identity Card) correctly.
        This information is required to generate a visitor pass for them to enter the office.

        You must ONLY respond in JSON format with the following structure:
        {
            "name_provided": true/false,
            "nric_provided": true/false,
            "name": "extracted full name",
            "nric": "extracted NRIC",
            "response": "your response message here"
        }

        For NRIC validation:
        - Singapore NRIC typically follows the pattern: S/T/F/G/M followed by 7 digits, then a checksum letter (e.g., S1234567A, T0123456Z).
        - Malaysian NRIC typically has 12 digits, often written with hyphens like XXXXXX-XX-XXXX (e.g., 900101-10-1234).

        When extracting NRIC, make sure to identify and extract the complete NRIC number.
        If name is provided, extract the full name.
        If both are provided and seem valid, set respective flags to true.
        If information is missing or invalid, provide a helpful response asking for the specific information.
        Example if NRIC is missing: "Thanks for your name. Could you also provide your NRIC number? We need this for your visitor pass."
        Example if both are missing: "Please provide your full name and NRIC number so we can prepare your visitor pass."
        Example if both are provided: "Thank you for providing your details."
        Keep your responses professional and helpful.
        """
    }
}

class ApplicationBot:
    def __init__(self, supabase_client: Client, calendly_client_instance: Calendly):
        self.db = supabase_client
        self.calendly = calendly_client_instance

    def _create_calendly_webhook(self):
        """Creates a Calendly webhook subscription if it doesn't already exist."""
        if not CALENDLY_WEBHOOK_URL or not CALENDLY_WEBHOOK_SIGNING_KEY:
            logger.warning("Calendly webhook URL or signing key not configured. Skipping webhook creation.")
            return

        try:
            user = self.calendly.get_current_user()
            user_uri = user["resource"]["uri"]
            organization_uri = user["resource"]["current_organization"]

            subscriptions = self.calendly.list_webhook_subscriptions(organization=organization_uri, scope="organization")
            
            webhook_exists = False
            for sub in subscriptions.get("collection", []):
                if sub["callback_url"] == CALENDLY_WEBHOOK_URL and "invitee.created" in sub["events"]:
                    logger.info(f"Calendly webhook for invitee.created already exists for {CALENDLY_WEBHOOK_URL}")
                    webhook_exists = True
                    # Optionally, update the signing key if it's different, though Calendly API might not allow direct update of signing key.
                    # Usually, you set the signing key once during creation or get it from Calendly.
                    break
            
            if not webhook_exists:
                logger.info(f"Creating Calendly webhook for invitee.created to {CALENDLY_WEBHOOK_URL}")
                self.calendly.create_webhook_subscription(
                    url=CALENDLY_WEBHOOK_URL,
                    events=["invitee.created"], # You can add "invitee.canceled" if needed
                    organization=organization_uri,
                    scope="organization",
                    signing_key=CALENDLY_WEBHOOK_SIGNING_KEY # This key is provided BY YOU to Calendly
                )
                logger.info("Calendly webhook created successfully.")
            
        except Exception as e:
            logger.error(f"Failed to create or verify Calendly webhook: {e}")


    def process_message(self, sender_id: str, message_data: Dict[Any, Any]) -> str:
        """Process incoming messages and route to appropriate handler"""
        try:
            message_type = self._determine_message_type(message_data)
            message_content = self._extract_message_content(message_data, message_type)

            application = self._get_or_create_application(sender_id)
            self._record_message(application["id"], "user", message_content, message_type)

            current_step = application.get("current_step", "initial_contact")
            step_handler = getattr(self, f"_handle_{current_step}", self._handle_unknown_step)

            response = step_handler(application, message_content, message_type, message_data)

            if response: # Only record and send if there's a response string
                self._record_message(application["id"], "bot", response, "text")
            return response

        except Exception as e:
            logger.error(f"Error processing message: {e}", exc_info=True)
            return "Sorry, we encountered an error. Please try again later."

    def _determine_message_type(self, message_data: Dict) -> str:
        """Determine the type of message received"""
        if "text" in message_data:
            return "text"
        elif "document" in message_data:
            return "document"
        elif "image" in message_data: # Assuming resume can be an image, though less common
            return "image"
        # Add other types if needed, e.g., 'audio', 'video', 'sticker'
        else:
            logger.warning(f"Unknown message type in data: {message_data}")
            return "unknown"

    def _extract_message_content(self, message_data: Dict, message_type: str) -> str:
        """Extract content from the message based on type"""
        if message_type == "text":
            return message_data["text"].get("body", "")
        elif message_type == "document":
            # For documents, the content could be filename or a placeholder if we don't store names
            return message_data["document"].get("filename", "document_received")
        elif message_type == "image":
            return message_data["image"].get("caption", "image_received")
        return ""

    def _get_or_create_application(self, phone_number: str) -> Dict:
        """Get existing application or create a new one"""
        # Normalize phone number if necessary (e.g., remove '+' or country codes if inconsistent)
        result = self.db.table("applications").select("*").eq("phone_number", phone_number).order("created_at", desc=True).limit(1).execute()

        if result.data:
            application = result.data[0]
            self.db.table("applications").update({
                "last_interaction": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }).eq("id", application["id"]).execute()
            return application
        else:
            new_application_data = {
                "name": "Applicant", # Default name
                "phone_number": phone_number,
                "current_step": "initial_contact",
                "status": "pending",
                "last_interaction": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
            insert_result = self.db.table("applications").insert(new_application_data).execute()
            return insert_result.data[0]

    def _record_message(self, application_id: uuid.UUID, sender: str, content: str,
                       message_type: str, file_url: str = None, file_type: str = None) -> None:
        """Record a message in the database"""
        try:
            app_result = self.db.table("applications").select("current_step").eq("id", application_id).execute()
            step_name = app_result.data[0]["current_step"] if app_result.data else "unknown"

            message_data = {
                "application_id": str(application_id), # Ensure UUID is string for JSON
                "sender": sender,
                "message_content": content,
                "message_type": message_type,
                "step_name": step_name
            }

            if file_url:
                message_data["file_url"] = file_url
            if file_type:
                message_data["file_type"] = file_type

            self.db.table("applicant_messages").insert(message_data).execute()
        except Exception as e:
            logger.error(f"Error recording message for app {application_id}: {e}", exc_info=True)


    def _update_application_step(self, application_id: uuid.UUID, new_step: str,
                               additional_data: Dict = None) -> None:
        """Update the application's current step and any additional data"""
        update_data = {"current_step": new_step, "attempts_counter": 0, "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}

        if additional_data:
            update_data.update(additional_data)

        self.db.table("applications").update(update_data).eq("id", application_id).execute()

    def _increment_attempt_counter(self, application_id: uuid.UUID) -> int:
        """Increment and return the attempt counter for an application"""
        # This should ideally be an atomic increment in the DB if possible, or handle potential race conditions.
        # For now, a select then update:
        app_result = self.db.table("applications").select("attempts_counter").eq("id", application_id).execute()
        current_count = app_result.data[0]["attempts_counter"] if app_result.data and app_result.data[0]["attempts_counter"] is not None else 0
        new_count = current_count + 1

        self.db.table("applications").update({"attempts_counter": new_count}).eq("id", application_id).execute()
        return new_count

    def _call_gemini(self, step: str, user_message: str) -> Dict:
        """Call the appropriate Gemini model for the current step"""
        model_config = GEMINI_MODELS.get(step)
        if not model_config:
            logger.error(f"No Gemini model configuration found for step: {step}")
            return {"error": "Model configuration not found", "response": "Internal configuration error."}

        try:
            model = genai.GenerativeModel(
                model_name=model_config["model_name"],
                generation_config={"temperature": model_config["temperature"]},
                system_instruction=model_config["instructions"] # Use system_instruction
            )

            # Prompt is now just the user message, as instructions are system-level
            response = model.generate_content(f"User message: {user_message}")
            response_text = response.text

            if response_text.startswith("```json"):
                response_text = response_text[len("```json"):]
            if response_text.endswith("```"):
                response_text = response_text[:-len("```")]
            response_text = response_text.strip()

            try:
                return json.loads(response_text)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse Gemini response as JSON for step {step}: {response_text}. Error: {e}")
                # Fallback or error response
                return {"error": "Invalid JSON response from model", "response": "I had trouble processing that. Could you try phrasing it differently?"}

        except Exception as e:
            logger.error(f"Error calling Gemini API for step {step}: {e}", exc_info=True)
            return {"error": f"API error: {str(e)}", "response": "There was an issue contacting our AI service. Please try again shortly."}

    def _handle_initial_contact(self, application: Dict, message: str,
                              message_type: str, message_data: Dict) -> str:
        self._update_application_step(application["id"], STEPS["initial_contact"])
        # Directly call the next handler since no user input is needed to transition from initial_contact
        return self._handle_confirm_intent(application, message, message_type, message_data)

    def _handle_confirm_intent(self, application: Dict, message: str,
                             message_type: str, message_data: Dict) -> str:
        gemini_response = self._call_gemini("confirm_intent", message)

        if "error" in gemini_response:
            return gemini_response.get("response", "I'm having trouble understanding. Could you please clarify if you're interested in applying for a job with us?")

        if gemini_response.get("intent_confirmed", False):
            self._update_application_step(application["id"], STEPS["confirm_intent"])
            return "Great! Before proceeding with your job application, could you please let us know your commitment period for this position? We require a minimum of 1 month."
        else:
            # User doesn't intend to apply, stay in the same step, but provide Gemini's response
            return gemini_response.get("response", "I'm not sure if you're looking to apply for a job. Please let me know if you'd like to start the application process.")

    def _handle_commitment_check(self, application: Dict, message: str,
                          message_type: str, message_data: Dict) -> str:
        gemini_response = self._call_gemini("commitment_check", message)

        if "error" in gemini_response:
            return gemini_response.get("response", "I'm having trouble understanding your commitment period. Could you clearly state how long you can commit to this position? We require a minimum of 1 month.")

        commitment_sufficient = gemini_response.get("commitment_sufficient", False)

        if commitment_sufficient:
            self._update_application_step(
                application["id"],
                STEPS["commitment_check"],
                {"commitment_step": True, "commitment_period_months": gemini_response.get("period_in_months")}
            )
            return f"Thank you! Your commitment period works for us. The next step is to upload your resume or CV. You can send it as a document (PDF, DOC, DOCX) or paste its content as text."
        else:
            # Check if a specific response for insufficient commitment is provided by Gemini
            rejection_response = gemini_response.get("response")
            if not rejection_response or commitment_sufficient: # Fallback if Gemini doesn't give a rejection message
                 rejection_response = "Thank you for your interest. Unfortunately, we require a minimum commitment period of 1 month for this position. If your availability changes in the future, you're welcome to apply again."

            self._update_application_step(
                application["id"],
                "rejected", # A terminal step
                {"status": "rejected", "red_flags": (application.get("red_flags",0) or 0) + 1,
                 "red_flag_reasons": json.dumps( (json.loads(application.get("red_flag_reasons", "[]") or "[]")) + ["Insufficient commitment period"])}
            )
            return rejection_response

    def _handle_request_resume(self, application: Dict, message: str,
                             message_type: str, message_data: Dict) -> str:
        attempts = application.get("attempts_counter", 0)
        if attempts >= 5:
            self._update_application_step(application["id"], "ignored", {"status": "abandoned"})
            return "We haven't received your resume after multiple attempts. Your application has been paused. Feel free to start again when you're ready."

        file_url = None
        actual_message_for_gemini = message # Default to text message

        if message_type == "document":
            media_id = message_data.get("document", {}).get("id")
            filename = message_data.get("document", {}).get("filename", "document")
            # In a real scenario, you'd download the file from 'media_id' via WhatsApp API,
            # upload it to your storage (e.g., Supabase Storage), and get a public/signed URL.
            # For now, placeholder:
            # file_url = f"https://your-storage-service.com/resumes/{application['id']}/{filename}"
            # messenger.download_media(media_id) # This would give you file content
            # For Gemini, if it's a document, we might just pass the filename or a confirmation.
            actual_message_for_gemini = f"User uploaded a document: {filename}"
            # Or, if you extract text from PDF/DOCX, pass that. For now, simpler.
            logger.info(f"Document received: {filename} with media_id: {media_id}")
            # Simulate file upload and URL generation
            file_url = f"s3://user-resumes/{application['id']}/{secure_filename(filename)}"


        elif message_type == "image": # If resume can be an image
            media_id = message_data.get("image", {}).get("id")
            caption = message_data.get("image", {}).get("caption", "image_resume")
            actual_message_for_gemini = f"User sent an image as resume. Caption: {caption}"
            logger.info(f"Image resume received with media_id: {media_id}")
            file_url = f"s3://user-resumes/{application['id']}/image_resume.jpg"


        # Even if a file is sent, the 'message' variable might be empty if there's no caption/text body.
        # We need to ensure Gemini gets relevant info.
        if not message and file_url: # If only a file was sent with no text
             user_input_for_gemini = f"The user sent a file named '{os.path.basename(file_url)}'."
        else:
             user_input_for_gemini = message

        gemini_response = self._call_gemini("request_resume", user_input_for_gemini)

        if "error" in gemini_response:
            self._increment_attempt_counter(application["id"])
            return gemini_response.get("response", "I'm having trouble processing your resume. Please try uploading it again as a document (PDF, DOC, or DOCX), or paste the text.")

        if gemini_response.get("resume_received", False) or file_url: # Consider file upload as resume received
            self._update_application_step(
                application["id"],
                STEPS["request_resume"],
                {"resume_step": True, "resume_url": file_url if file_url else "text_resume_in_messages"}
            )
            return f"Thank you for submitting your resume! The next step is to complete our application form. Please fill out this form: {GOOGLE_FORM_LINK}\n\nOnce you've completed the form, please send a message here saying 'form completed'."

        elif gemini_response.get("needs_guidance", False):
            return gemini_response.get("response", "I understand you might not have a resume ready. That's okay! Instead, please provide a brief summary of your work experience, education, and skills in a message, and we'll use that information for your application.")

        else:
            new_count = self._increment_attempt_counter(application["id"])
            remaining = 5 - new_count
            return gemini_response.get("response", f"I don't see a resume attached or pasted. Please upload your resume as a document (PDF, DOC, or DOCX) or paste it as text. {remaining} attempts remaining.")


    def _handle_request_form(self, application: Dict, message: str,
                           message_type: str, message_data: Dict) -> str:
        form_completed = False
        if re.search(r"form\s+(is\s+)?completed|completed(\s+the)?\s+form|done", message.lower()):
            form_completed = True

        if form_completed:
            self._update_application_step(
                application["id"],
                STEPS["request_form"], # Moves to waiting_review
                {"form_step": True}
            )
            # This message implies an automated review process will now happen.
            return "Thank you for completing the form! Your application is now under review. We'll get back to you soon with next steps. This might take a little while."
        else:
            return f"Please complete our application form at {GOOGLE_FORM_LINK} and let me know when you're done by replying with 'form completed' or 'done'."

    def _handle_waiting_review(self, application: Dict, message: str,
                             message_type: str, message_data: Dict) -> str:
        # User messages while their application (form/resume) is under external review.
        return "Your application is currently under review. We'll notify you as soon as a decision is made. Thank you for your patience!"

    def _handle_request_interview_details(self, application: Dict, message: str,
                                 message_type: str, message_data: Dict) -> str:
        """Handles collecting Full Name and NRIC for the interview pass."""
        gemini_response = self._call_gemini("request_interview_details", message)

        if "error" in gemini_response:
            return gemini_response.get("response", "I'm having trouble processing your information. Could you please provide your full name and NRIC number clearly? This is required for office access.")

        name_provided = gemini_response.get("name_provided", False)
        nric_provided = gemini_response.get("nric_provided", False)
        extracted_name = gemini_response.get("name", "").strip()
        extracted_nric = gemini_response.get("nric", "").strip().upper()

        update_data = {}
        if name_provided and extracted_name:
            update_data["name"] = extracted_name
        if nric_provided and extracted_nric:
            # Basic NRIC validation (can be enhanced with regex from Gemini model if needed here too)
            # For now, rely on Gemini's extraction.
            update_data["nric"] = extracted_nric # Store the NRIC

        if update_data: # If Gemini extracted anything, update the DB
             self.db.table("applications").update(update_data).eq("id", application["id"]).execute()
             # Refresh application data to reflect these changes for the current function scope
             application.update(update_data)


        # Check if we NOW have both name and NRIC (either from this message or previous ones)
        # This requires fetching the latest application record or ensuring 'application' dict is up-to-date
        current_name = application.get("name", "")
        current_nric = application.get("nric", "")
        
        # A more robust check by re-fetching or ensuring application dict is the single source of truth
        # For simplicity, we assume 'application' dict is updated if Gemini extracted something.
        # However, the initial message for this step won't have name/nric in 'message'.
        # The Gemini prompt for request_interview_details is designed to extract from the user's message.

        if name_provided and nric_provided and extracted_name and extracted_nric:
            # Both provided in this specific message and extracted by Gemini
            self._update_application_step(
                application["id"],
                STEPS["request_interview_details"], # Moves to waiting_calendly_booking
                {"pass_step": True} # Indicates NRIC/Name collected for pass
            )
            return f"Thank you, {extracted_name}! We have your details for the visitor pass.\n\nPlease book your interview slot using this link: {CALENDLY_LINK}\n\n{OFFICE_DIRECTIONS}\n\nOnce booked, our system will automatically confirm."
        else:
            # If Gemini couldn't extract both, or if it's the first time in this step (message might be from bot)
            # Rely on Gemini's response to ask for missing info.
            # If the message is from the bot (e.g. the initial message to enter this step), Gemini might not find name/nric.
            # The initial message to enter this step is sent by the `handle_webhook` (external_review)
            # or if the user just says "hi" in this step.
            response_from_gemini = gemini_response.get("response")
            if response_from_gemini:
                return response_from_gemini
            else: # Fallback if Gemini provides no specific response
                missing_parts = []
                if not name_provided: missing_parts.append("full name")
                if not nric_provided: missing_parts.append("NRIC")
                return f"We still need your { ' and '.join(missing_parts) } to proceed with interview scheduling and your visitor pass."


    def _handle_waiting_calendly_booking(self, application: Dict, message: str,
                                 message_type: str, message_data: Dict) -> str:
        """User messages while bot is waiting for Calendly webhook."""
        # User might say "I booked it" or ask for status.
        # The actual confirmation comes from the webhook.
        return "Thanks for letting me know. Please ensure you have booked your slot via the Calendly link we provided. Our system will send you a confirmation message automatically once the booking is detected. If you've already booked, please wait for that system confirmation."

    def _handle_confirmation(self, application: Dict, message: str,
                           message_type: str, message_data: Dict) -> str:
        """Final confirmation step after Calendly booking is confirmed by webhook."""
        # This step is reached after the Calendly webhook has processed and updated the status.
        # The primary confirmation message is sent by the Calendly webhook handler.
        # This handler is for any follow-up messages from the user.
        self._update_application_step(
            application["id"],
            STEPS["confirmation"], # Moves to 'completed'
            {"status": "interview_scheduled_finalized"} # Or a more final status
        )
        return "We're all set for your interview! We look forward to meeting you. If you have any questions before then, or if you need to reschedule, please let us know."

    def _handle_unknown_step(self, application: Dict, message: str,
                           message_type: str, message_data: Dict) -> str:
        logger.error(f"Unknown application step: {application.get('current_step')} for app ID {application['id']}")
        return "I'm sorry, there seems to be an issue with your application's current state. Our team will look into this and contact you if necessary."

    def handle_external_review_webhook(self, webhook_data: Dict) -> None:
        """Process incoming webhook from external review system"""
        try:
            application_id = webhook_data.get("application_id")
            if not application_id:
                logger.error("External review webhook missing application_id")
                return

            self.db.table("webhook_events").insert({
                "application_id": str(application_id),
                "event_type": webhook_data.get("event_type", "external_review_unknown"),
                "event_data": webhook_data,
            }).execute()

            event_type = webhook_data.get("event_type")
            if event_type == "application_review":
                decision = webhook_data.get("decision", "").lower()
                app_result = self.db.table("applications").select("id, phone_number, name").eq("id", application_id).execute()

                if not app_result.data:
                    logger.error(f"Application not found for ID: {application_id} in external review webhook.")
                    return
                
                application_details = app_result.data[0]
                phone_number = application_details["phone_number"]
                applicant_name = application_details.get("name", "Applicant")


                if decision == "approved":
                    # Transition to the new step: request_interview_details
                    self._update_application_step(
                        application_id,
                        "request_interview_details", # New step to ask for Name/NRIC
                        {"status": "approved_pending_details"}
                    )
                    message = (
                        f"Dear {applicant_name},\n\n"
                        "We're pleased to inform you that your application has been reviewed and we'd like to invite you for an interview!\n\n"
                        "To proceed with scheduling and to generate a visitor pass for office entry, please reply with your **Full Name** and **NRIC number** (e.g., S1234567A or 900101-10-1234)."
                    )
                    messenger.send_message(message, phone_number)
                    self._record_message(application_id, "bot", message, "text")


                elif decision == "rejected":
                    self.db.table("applications").update({
                        "status": "rejected",
                        "current_step": "rejected", # Terminal step
                        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
                    }).eq("id", application_id).execute()

                    rejection_reason = webhook_data.get("reason", "we will not be proceeding with your application at this time")
                    message = f"Dear {applicant_name},\n\nThank you for your interest in our company. After careful consideration, we regret to inform you that {rejection_reason}. We appreciate your time and wish you the best in your job search."
                    messenger.send_message(message, phone_number)
                    self._record_message(application_id, "bot", message, "text")

        except Exception as e:
            logger.error(f"Error processing external review webhook: {e}", exc_info=True)

    def handle_calendly_webhook(self, webhook_payload: Dict) -> None:
        """Handles invitee.created event from Calendly."""
        try:
            event_type = webhook_payload.get("event")
            payload_data = webhook_payload.get("payload")

            if not payload_data or event_type != "invitee.created":
                logger.info(f"Ignoring Calendly event: {event_type}")
                return

            invitee_uri = payload_data.get("uri")
            # Fetch invitee details to get questions and answers (for phone number)
            # invitee_details = self.calendly.get_invitee(uuid=invitee_uri.split('/')[-1]) # If you need more details
            
            # Extract phone number from questions_and_answers
            # This assumes you have a question in your Calendly event type that asks for "Phone Number"
            # And the user's WhatsApp number is E.164 format.
            phone_number_from_calendly = None
            for qa in payload_data.get("questions_and_answers", []):
                if "phone" in qa.get("question", "").lower() or "number" in qa.get("question", "").lower() : # Adjust to match your question
                    phone_number_from_calendly = qa.get("answer", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
                    if not phone_number_from_calendly.startswith("+"):
                        # Attempt to normalize if it's a local number; this is highly country-dependent
                        # For simplicity, assume it might be missing the '+' for an international number
                        # Or you might need more sophisticated normalization based on your user base
                        pass # Add normalization if needed, e.g., add default country code if missing
                    break
            
            if not phone_number_from_calendly:
                logger.error(f"Could not extract phone number from Calendly webhook: {payload_data.get('questions_and_answers')}")
                return

            # Find application by phone number (normalize if necessary)
            # Supabase stores phone_number as 'from' which includes country code but no '+'
            # Calendly might provide it with '+'. Adjust for matching.
            normalized_phone_for_db = phone_number_from_calendly.lstrip('+')

            app_result = self.db.table("applications").select("*").eq("phone_number", normalized_phone_for_db).order("created_at", desc=True).limit(1).execute()

            if not app_result.data:
                logger.error(f"No application found for phone number {normalized_phone_for_db} from Calendly webhook.")
                return

            application = app_result.data[0]
            application_id = application["id"]
            applicant_name = application.get("name", "Applicant")

            # Record this webhook event
            self.db.table("webhook_events").insert({
                "application_id": str(application_id),
                "event_type": "calendly_invitee_created",
                "event_data": webhook_payload, # Store the raw payload
                "processed": True
            }).execute()

            interview_start_time_str = payload_data.get("event", {}).get("start_time") # This path might be incorrect, check Calendly payload
            # Correct path for start_time from typical Calendly invitee.created payload:
            scheduled_event_details = payload_data.get("scheduled_event", {})
            interview_start_time_str = scheduled_event_details.get("start_time")
            
            interview_datetime = None
            if interview_start_time_str:
                try:
                    interview_datetime = datetime.datetime.fromisoformat(interview_start_time_str.replace("Z", "+00:00"))
                except ValueError:
                    logger.error(f"Could not parse interview start time: {interview_start_time_str}")


            # Update application: interview details, status, and step
            update_payload = {
                "interview_date": interview_datetime.isoformat() if interview_datetime else None,
                "interview_confirmation": True,
                "calendly_event_uuid": payload_data.get("uri", "").split('/')[-1], # Store Calendly invitee UUID
                "status": "interview_scheduled",
                "current_step": STEPS["waiting_calendly_booking"], # Move to 'confirmation' step
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            self.db.table("applications").update(update_payload).eq("id", application_id).execute()

            # Send confirmation message to user
            confirmation_message = (
                f"Hi {applicant_name},\n\n"
                f"Your interview has been successfully scheduled! "
            )
            if interview_datetime:
                # Format datetime object to a user-friendly string, e.g., "Monday, May 27, 2024 at 2:00 PM"
                # Consider user's timezone if possible, or state timezone explicitly (e.g., UTC)
                user_friendly_time = interview_datetime.strftime("%A, %B %d, %Y at %I:%M %p %Z")
                confirmation_message += f"It is set for {user_friendly_time}.\n\n"
            else:
                confirmation_message += "Please check your email for the exact time and details.\n\n"

            confirmation_message += (
                f"Office Location & Directions:\n{OFFICE_DIRECTIONS}\n\n"
                "Your visitor pass will be prepared based on the details you provided. "
                "We look forward to meeting you!"
            )

            messenger.send_message(confirmation_message, application["phone_number"])
            self._record_message(application_id, "bot", confirmation_message, "text")
            logger.info(f"Calendly booking confirmed for application {application_id}. User notified.")

        except Exception as e:
            logger.error(f"Error processing Calendly webhook: {e}", exc_info=True)


# Initialize the bot
application_bot = ApplicationBot(supabase_client, calendly_client)

@app.before_first_request
def initialize_calendly_webhook():
    if CALENDLY_PERSONAL_ACCESS_TOKEN and CALENDLY_WEBHOOK_URL and CALENDLY_WEBHOOK_SIGNING_KEY:
        logger.info("Attempting to create/verify Calendly webhook on startup...")
        application_bot._create_calendly_webhook()
    else:
        logger.warning("Calendly PAT, Webhook URL, or Signing Key not set. Skipping Calendly webhook creation.")


@app.route('/webhook', methods=['GET'])
def verify_whatsapp_webhook():
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')

    if mode and token:
        if mode == 'subscribe' and token == VERIFY_TOKEN:
            logger.info("WhatsApp Webhook verified successfully")
            return challenge, 200
        else:
            logger.warning("WhatsApp Webhook verification failed: Incorrect mode or token")
            return Response(status=403)
    logger.warning("WhatsApp Webhook verification failed: Missing mode or token")
    return Response(status=400) # Bad Request is more appropriate

@app.route('/webhook', methods=['POST'])
def whatsapp_webhook():
    data = request.get_json()
    if not data:
        logger.error("Received empty JSON payload for WhatsApp webhook")
        return Response(status=400) # Bad Request

    # logger.info(f"WhatsApp webhook received: {json.dumps(data, indent=2)}") # Log incoming data

    try:
        if data.get('object') == 'whatsapp_business_account':
            for entry in data.get('entry', []):
                for change in entry.get('changes', []):
                    if change.get('field') == 'messages':
                        value = change.get('value', {})
                        messages = value.get('messages', [])
                        metadata = value.get('metadata', {}) # Contains phone_number_id

                        for message_obj in messages:
                            sender_id = message_obj.get('from') # User's phone number

                            # Construct message_data based on message type
                            message_data_payload = {}
                            msg_type = message_obj.get('type')

                            if msg_type == 'text':
                                message_data_payload['text'] = message_obj.get('text', {})
                            elif msg_type == 'document':
                                message_data_payload['document'] = message_obj.get('document', {})
                            elif msg_type == 'image':
                                message_data_payload['image'] = message_obj.get('image', {})
                            # Add other types: 'audio', 'video', 'interactive', 'button', 'reaction', etc.
                            else:
                                logger.info(f"Received unhandled message type: {msg_type} from {sender_id}")
                                # Optionally send a message like "I can only process text and documents."
                                # messenger.send_message("I can only process text, images, and documents at the moment.", sender_id)
                                continue # Skip processing this message

                            if sender_id and message_data_payload:
                                response_text = application_bot.process_message(sender_id, message_data_payload)
                                if response_text: # Only send if there's something to send
                                    messenger.send_message(response_text, sender_id)
                            else:
                                logger.warning(f"Missing sender_id or message_data_payload for message: {message_obj}")
        return Response(status=200)
    except Exception as e:
        logger.error(f"Error in WhatsApp webhook: {e}", exc_info=True)
        return Response(status=500)


@app.route('/external-review-webhook', methods=['POST']) # Renamed for clarity
def external_review_webhook():
    data = request.get_json()
    if not data:
        logger.error("Received empty JSON payload for external review webhook")
        return Response(status=400)
    
    # logger.info(f"External review webhook received: {json.dumps(data, indent=2)}")
    try:
        application_bot.handle_external_review_webhook(data)
        return Response(status=200)
    except Exception as e:
        logger.error(f"Error in external_review_webhook: {e}", exc_info=True)
        return Response(status=500)

@app.route('/calendly-webhook', methods=['POST'])
def calendly_webhook_receiver():
    # Verify signature (important for security)
    if CALENDLY_WEBHOOK_SIGNING_KEY:
        signature_header = request.headers.get('Calendly-Webhook-Signature')
        if not signature_header:
            logger.warning("Calendly webhook: Missing signature header.")
            return Response("Signature missing", status=401)

        try:
            t_value, sig_value = signature_header.split(',')
            t = t_value.split('=')[1]
            signature = sig_value.split('=')[1]
            
            signed_payload = t + "." + request.get_data(as_text=True)
            expected_signature = hmac.new(
                CALENDLY_WEBHOOK_SIGNING_KEY.encode(),
                msg=signed_payload.encode(),
                digestmod=hashlib.sha256
            ).hexdigest()

            if not hmac.compare_digest(expected_signature, signature):
                logger.warning("Calendly webhook: Invalid signature.")
                return Response("Invalid signature", status=401)
        except Exception as e:
            logger.error(f"Calendly webhook: Signature verification error: {e}")
            return Response("Signature verification failed", status=401)
    else:
        logger.warning("CALENDLY_WEBHOOK_SIGNING_KEY not set. Skipping signature verification. THIS IS INSECURE.")


    data = request.get_json()
    if not data:
        logger.error("Received empty JSON payload for Calendly webhook")
        return Response(status=400)

    # logger.info(f"Calendly webhook received: {json.dumps(data, indent=2)}")
    try:
        application_bot.handle_calendly_webhook(data)
        return Response(status=200)
    except Exception as e:
        logger.error(f"Error in calendly_webhook_receiver: {e}", exc_info=True)
        return Response(status=500)


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "ok",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "version": "1.1.0" # Incremented version
    })

if __name__ == '__main__':
    print("Starting server on http://127.0.0.1:5000")
    print("Available endpoints:")
    print("  - /                       : Root endpoint (returns status message)")
    print("  - /health                 : Health check endpoint")
    print("  - /webhook                : WhatsApp webhook endpoint")
    print("  - /external-review-webhook: External review system webhook endpoint")
    print("  - /calendly-webhook       : Calendly webhook endpoint")
    
    # For development, Flask's built-in server is fine.
    # For production on Windows, Waitress is a good choice.
    # app.run(host='127.0.0.1', port=5000, debug=True) # Use this for easier debugging
    serve(app, host='127.0.0.1', port=5000, threads=4)