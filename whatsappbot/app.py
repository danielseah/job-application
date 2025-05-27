"""
src/app.py - Windows-compatible version of the WhatsApp application bot
"""
import os
import re
import json
import logging
import datetime
from typing import Dict, Any, Optional, List
import uuid

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

if not all([WHATSAPP_TOKEN, VERIFY_TOKEN, PHONE_NUMBER_ID]):
    logger.error("WhatsApp environment variables not fully configured.")
    # Potentially exit or raise an error
messenger = WhatsApp(WHATSAPP_TOKEN, phone_number_id=PHONE_NUMBER_ID)

# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
if not all([SUPABASE_URL, SUPABASE_KEY]):
    logger.error("Supabase environment variables not configured.")
    # Potentially exit or raise an error
supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Initialize Gemini API
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logger.error("GEMINI_API_KEY environment variable not configured.")
    # Potentially exit or raise an error
genai.configure(api_key=GEMINI_API_KEY)

# Add a root endpoint to check if server is running
@app.route("/", methods=["GET"])
def root():
    """Root endpoint to check if the server is running"""
    return jsonify({"message": "Job Application Bot is running!"})

# Interview scheduling and office information
INTERVIEW_LINK_BASE = os.environ.get("INTERVIEW_LINK_BASE", "https://2b00-151-192-105-138.ngrok-free.app/interview")
OFFICE_DIRECTIONS = """
As our facility is located in a heavily guarded area within Singapore, kindly provide us your *full name as per NRIC and NRIC number* in advance to facilitate the clearance with the Airport Police.

Our full address is 115 Airport Cargo Road, Changi Airport Cargo Building C, Level 7 Unit 18.

Please alight at the Police Pass Office Bus Stop (95131) first to exchange for the visitor pass. 
Do bring a pen as there will be a small slip of paper you need to fill in as well located on the side shelves.

When you are at the Airport Police Pass Office, please proceed to counter 1, 2, 3 and 4 in order to exchange passes. Please inform them that you are attending an interview. Please also inform them that the authorisation has been given by an agent company called Mirae. (Note: do not go to the SIA counter to exchange your pass.)

After receiving the visitor pass, you may then take any bus such as 9, 19, 89 or even the express bus 89e from the bus stop where you've alighted earlier to enter the protected area.  Additionally, you can enter by your personal vehicle after clearing the pass office.

Once you've cleared the protected area checkpoint, please alight at 3rd Cargo Agents Building (95051) which is three 3 bus stops after to access the area. Please note that the bus might skip certain stops when there is no one. So please do not count the number of times the bus stopped. 

Finally, head over to the office lobby where there would be 3 elevators. Once you've arrived, kindly report to #07-18

Thank you ☺ (Kindly wait for confirmation of your entry number before we can confirm your interview date and time slot for the next steps. This message is not a confirmation of the interview date)
"""

# Google Form link
GOOGLE_FORM_LINK = os.environ.get("GOOGLE_FORM_LINK", "https://forms.gle/yourFormLink")
GOOGLE_FORM_PREFILL_PARAM_APP_ID = os.environ.get("GOOGLE_FORM_PREFILL_PARAM_APP_ID") # e.g., "entry.123456789"

# Application steps
STEPS = {
    "initial_contact": "confirm_intent",
    "confirm_intent": "commitment_check",
    "commitment_check": "request_resume",
    "request_resume": "request_form",
    "request_form": "waiting_form_submission_webhook", # Move to waiting for webhook confirmation
    "waiting_form_submission_webhook": "waiting_review", # After webhook confirms form, move to review
    "waiting_review": "request_interview_details",
    "request_interview_details": "waiting_interview_booking",
    "waiting_interview_booking": "confirmation",
    "confirmation": "completed"
}

# Gemini model configurations for each step
GEMINI_MODELS = {
    "confirm_intent": {
        "model_name": "gemini-2.5-flash-preview-05-20", # Updated model name
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
        "model_name": "gemini-2.5-flash-preview-05-20", # Updated model name
        "temperature": 0.3, # Slightly higher for more nuanced response
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
            "response": "I understand your current availability is for 2 weeks. For this role, we require a minimum commitment of 1 month. Would you be able to meet this 1-month requirement?"
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
        If commitment is insufficient, your 'response' should acknowledge their stated period, reiterate the 1-month requirement, and gently ask if they can meet this requirement or adjust their availability. Do not make it sound like a final rejection yet.
        Be flexible with how people express time periods (weeks, months, years). 1 month = 4 weeks = 30 days.
        """
    },
    "request_resume": {
        "model_name": "gemini-2.5-flash-preview-05-20", # Updated model name
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
    "request_interview_details": {
        "model_name": "gemini-2.5-flash-preview-05-20", # Updated model name
        "temperature": 0.1,
        "instructions": """
        You are an HR assistant. The applicant has been approved for an interview.
        Your role is to verify if the user has provided their FULL NAME and NRIC (National Registration Identity Card) correctly.
        This information is required to generate a visitor pass for them to enter the office.

        You must ONLY respond in JSON format with the following structure:
        {
            "name_provided": true/false,
            "nric_provided": true/false,
            "name": "extracted full name or empty string",
            "nric": "extracted NRIC or empty string",
            "response": "your response message here"
        }

        For NRIC validation:
        - Singapore NRIC typically follows the pattern: S/T/F/G/M followed by 7 digits, then a checksum letter (e.g., S1234567A, T0123456Z).
        - Malaysian NRIC typically has 12 digits, often written with hyphens like XXXXXX-XX-XXXX (e.g., 900101-10-1234).

        When extracting NRIC, make sure to identify and extract the complete NRIC number.
        If name is provided, extract the full name.
        If both are provided and seem valid, set respective flags to true. The 'response' field can be a confirmation.
        If information is missing (e.g., only name provided, or only NRIC), set the respective flag to true for what IS provided.
        Your 'response' message should then politely ask for the MISSING information.
        Example if NRIC is missing: "Thanks for your name. Could you also provide your NRIC number? We need this for your visitor pass."
        Example if only NRIC is provided: "Thanks for your NRIC. Could you also provide your full name as per NRIC?"
        Example if both are missing: "Please provide your full name and NRIC number so we can prepare your visitor pass."
        Example if both are provided in this message: "Thank you for providing your details."
        Keep your responses professional and helpful.
        """
    }
}

class ApplicationBot:
    def __init__(self, supabase_client: Client):
        self.db = supabase_client

    def process_message(self, sender_id: str, message_data: Dict[Any, Any]) -> Optional[str]:
        """Process incoming messages and route to appropriate handler"""
        try:
            message_type = self._determine_message_type(message_data)
            message_content = self._extract_message_content(message_data, message_type)

            application = self._get_or_create_application(sender_id)
            if not application: # Should not happen if _get_or_create_application is robust
                logger.error(f"Failed to get or create application for sender_id: {sender_id}")
                return "Sorry, there was an issue initializing your application. Please try again."

            self._record_message(application["id"], "user", message_content, message_type)

            current_step = application.get("current_step", "initial_contact")
            step_handler = getattr(self, f"_handle_{current_step}", self._handle_unknown_step)

            response = step_handler(application, message_content, message_type, message_data)

            if response:
                self._record_message(application["id"], "bot", response, "text")
            return response # Can be None if step handler decides not to send a message

        except Exception as e:
            logger.error(f"Error processing message for sender {sender_id}: {e}", exc_info=True)
            return "Sorry, we encountered an error. Please try again later."

    def _determine_message_type(self, message_data: Dict) -> str:
        if "text" in message_data:
            return "text"
        elif "document" in message_data:
            return "document"
        elif "image" in message_data:
            return "image"
        else:
            logger.warning(f"Unknown message type in data: {message_data}")
            return "unknown"

    def _extract_message_content(self, message_data: Dict, message_type: str) -> str:
        if message_type == "text":
            return message_data["text"].get("body", "")
        elif message_type == "document":
            return message_data["document"].get("filename", "document_received")
        elif message_type == "image":
            return message_data["image"].get("caption", "image_received")
        return ""

    def _get_or_create_application(self, phone_number: str) -> Optional[Dict]:
        try:
            result = self.db.table("applications").select("*").eq("phone_number", phone_number).order("created_at", desc=True).limit(1).execute()

            if result.data:
                application = result.data[0]
                update_res = self.db.table("applications").update({
                    "last_interaction": datetime.datetime.now(datetime.timezone.utc).isoformat()
                }).eq("id", application["id"]).execute()
                if hasattr(update_res, 'error') and update_res.error:
                    logger.error(f"Error updating last_interaction for app {application['id']}: {update_res.error}")
                return application
            else:
                new_application_data = {
                    "name": "Applicant",
                    "phone_number": phone_number,
                    "current_step": "initial_contact",
                    "status": "pending",
                    "last_interaction": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "attempts_counter": 0, # Ensure attempts_counter is initialized
                }
                insert_result = self.db.table("applications").insert(new_application_data).execute()
                if hasattr(insert_result, 'error') and insert_result.error:
                    logger.error(f"Error creating new application for {phone_number}: {insert_result.error}")
                    return None
                if not insert_result.data:
                    logger.error(f"No data returned after inserting new application for {phone_number}")
                    return None
                return insert_result.data[0]
        except Exception as e:
            logger.error(f"Exception in _get_or_create_application for {phone_number}: {e}", exc_info=True)
            return None

    def _record_message(self, application_id: uuid.UUID, sender: str, content: str,
                       message_type: str, file_url: str = None, file_type: str = None) -> None:
        try:
            app_result = self.db.table("applications").select("current_step").eq("id", application_id).execute()
            step_name = app_result.data[0]["current_step"] if app_result.data else "unknown"

            message_data = {
                "application_id": str(application_id),
                "sender": sender,
                "message_content": content,
                "message_type": message_type,
                "step_name": step_name
            }

            if file_url: message_data["file_url"] = file_url
            if file_type: message_data["file_type"] = file_type

            res = self.db.table("applicant_messages").insert(message_data).execute()
            if hasattr(res, 'error') and res.error:
                logger.error(f"Error recording message for app {application_id}: {res.error}")
        except Exception as e:
            logger.error(f"Exception recording message for app {application_id}: {e}", exc_info=True)

    def _update_application_step(self, application_id: uuid.UUID, new_step: str,
                               additional_data: Optional[Dict] = None) -> bool:
        try:
            update_data = {
                "current_step": new_step,
                "attempts_counter": 0, # Reset attempts when moving to a new step
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            if additional_data:
                update_data.update(additional_data)

            logger.info(f"Updating application {application_id} to step '{new_step}' with data: {additional_data}")
            result = self.db.table("applications").update(update_data).eq("id", application_id).execute()
            
            if hasattr(result, 'error') and result.error:
                 logger.error(f"DB Error updating application step for {application_id} to {new_step}: {result.error}")
                 return False
            # Optionally check result.data or row count if applicable for your Supabase client version
            return True
        except Exception as e:
            logger.error(f"Exception in _update_application_step for app {application_id}, step {new_step}: {e}", exc_info=True)
            return False

    def _increment_attempt_counter(self, application_id: uuid.UUID) -> int:
        try:
            app_result = self.db.table("applications").select("attempts_counter").eq("id", application_id).execute()
            if hasattr(app_result, 'error') and app_result.error:
                logger.error(f"DB Error fetching attempts_counter for {application_id}: {app_result.error}")
                return -1 # Indicate error
            
            current_count = app_result.data[0]["attempts_counter"] if app_result.data and app_result.data[0]["attempts_counter"] is not None else 0
            new_count = current_count + 1

            update_res = self.db.table("applications").update({"attempts_counter": new_count}).eq("id", application_id).execute()
            if hasattr(update_res, 'error') and update_res.error:
                logger.error(f"DB Error updating attempts_counter for {application_id}: {update_res.error}")
                return -1 # Indicate error
            return new_count
        except Exception as e:
            logger.error(f"Exception in _increment_attempt_counter for app {application_id}: {e}", exc_info=True)
            return -1 # Indicate error

    def _call_gemini(self, step: str, user_message: str) -> Dict:
        model_config = GEMINI_MODELS.get(step)
        if not model_config:
            logger.error(f"No Gemini model configuration found for step: {step}")
            return {"error": "Model configuration not found", "response": "Internal configuration error."}

        try:
            model = genai.GenerativeModel(
                model_name=model_config["model_name"],
                generation_config={"temperature": model_config["temperature"]},
                system_instruction=model_config["instructions"] # system_instructions for newer models
            )
            full_prompt = f"User message: {user_message}" # Ensure user_message is always a string
            if not user_message: # Handle cases where user sends e.g. only an image with no caption
                full_prompt = "User sent a message without text content (e.g., an image or document only)."

            response = model.generate_content(full_prompt)
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
                return {"error": "Invalid JSON response from model", "response": "I had trouble processing that. Could you try phrasing it differently?"}

        except Exception as e:
            logger.error(f"Error calling Gemini API for step {step}: {e}", exc_info=True)
            return {"error": f"API error: {str(e)}", "response": "There was an issue contacting our AI service. Please try again shortly."}

    def _handle_initial_contact(self, application: Dict, message: str,
                              message_type: str, message_data: Dict) -> Optional[str]:
        if not self._update_application_step(application["id"], STEPS["initial_contact"]):
            return "Sorry, we encountered a system issue. Please try again."
        # Refresh application data after step update
        application["current_step"] = STEPS["initial_contact"]
        return self._handle_confirm_intent(application, message, message_type, message_data)

    def _handle_confirm_intent(self, application: Dict, message: str,
                             message_type: str, message_data: Dict) -> Optional[str]:
        gemini_response = self._call_gemini("confirm_intent", message)

        if "error" in gemini_response:
            return gemini_response.get("response", "I'm having trouble understanding. Could you please clarify if you're interested in applying for a job with us?")

        if gemini_response.get("intent_confirmed", False):
            if not self._update_application_step(application["id"], STEPS["confirm_intent"]):
                return "Sorry, we encountered a system issue saving your progress. Please try again."
            return "Great! Before proceeding with your job application, could you please let us know your commitment period for this position? We require a minimum of 1 month."
        else:
            return gemini_response.get("response", "I'm not sure if you're looking to apply for a job. Please let me know if you'd like to start the application process.")

    def _handle_commitment_check(self, application: Dict, message: str,
                          message_type: str, message_data: Dict) -> Optional[str]:
        gemini_response = self._call_gemini("commitment_check", message)

        if "error" in gemini_response:
            return gemini_response.get("response", "I'm having trouble understanding your commitment period. Could you clearly state how long you can commit to this position? We require a minimum of 1 month.")

        commitment_sufficient = gemini_response.get("commitment_sufficient", False)
        commitment_period = gemini_response.get("commitment_period", "undefined")
        period_in_months = gemini_response.get("period_in_months", 0)

        db_update_payload = {

        }

        if commitment_sufficient:
            db_update_payload["commitment_step"] = True # Mark as successfully passed this sub-step
            if not self._update_application_step(application["id"], STEPS["commitment_check"], db_update_payload):
                return "Sorry, we encountered a system issue saving your commitment. Please try again."
            
            # Use Gemini's response if it's a positive confirmation, otherwise craft one
            positive_response = gemini_response.get("response")
            if not positive_response or not commitment_sufficient: # Fallback, should not be needed if prompt is good
                 positive_response = f"Thank you! Your commitment period of {commitment_period} works for us."

            return f"{positive_response} The next step is to upload your resume or CV. You can send it as a document (PDF, DOC, DOCX) or paste its content as text."
        else:
            # Gemini's response should now be the "can you reconsider?" type due to updated prompt
            prompting_response = gemini_response.get("response")
            if not prompting_response: # Fallback
                prompting_response = f"I understand your current availability is for {commitment_period}. Our roles require a minimum commitment of 1 month. Would you be able to meet this 1-month requirement?"
            
            return prompting_response

    def _handle_request_resume(self, application: Dict, message: str,
                             message_type: str, message_data: Dict) -> Optional[str]:
        attempts = application.get("attempts_counter", 0)
        if attempts >= 5:
            if not self._update_application_step(application["id"], "ignored", {"status": "abandoned_resume"}):
                return "System error. Please contact support."
            return "We haven't received your resume after multiple attempts. Your application has been paused. Feel free to start again when you're ready."

        file_url = None
        user_input_for_gemini = message

        if message_type == "document":
            media_id = message_data.get("document", {}).get("id")
            filename = message_data.get("document", {}).get("filename", "document")
            logger.info(f"Document received: {filename} with media_id: {media_id} for app {application['id']}")
            # Actual file download and upload to S3/Supabase storage would happen here
            # file_url = self.upload_file_to_storage(media_id, filename, application['id'])
            file_url = f"simulated_s3_url/resumes/{application['id']}/{secure_filename(filename)}" # Placeholder
            user_input_for_gemini = f"User uploaded a document named: {filename}"
        elif message_type == "image":
            media_id = message_data.get("image", {}).get("id")
            caption = message_data.get("image", {}).get("caption", "")
            logger.info(f"Image resume received with media_id: {media_id} for app {application['id']}")
            file_url = f"simulated_s3_url/resumes/{application['id']}/image_resume.jpg" # Placeholder
            user_input_for_gemini = f"User sent an image as resume. Caption: {caption if caption else '[no caption]'}"
        
        if not user_input_for_gemini and file_url: # File sent with no text body
            user_input_for_gemini = f"The user sent a file: {os.path.basename(file_url)}."

        gemini_response = self._call_gemini("request_resume", user_input_for_gemini)

        if "error" in gemini_response:
            self._increment_attempt_counter(application["id"])
            return gemini_response.get("response", "I'm having trouble processing your resume. Please try uploading it again as a document (PDF, DOC, or DOCX), or paste the text.")

        if gemini_response.get("resume_received", False) or file_url:
            additional_update = {"resume_step": True, "resume_url": file_url if file_url else "text_resume_in_messages"}
            if not self._update_application_step(application["id"], STEPS["request_resume"], additional_update):
                 return "Sorry, system error saving resume details. Please try again."

            form_link_with_id = GOOGLE_FORM_LINK
            if GOOGLE_FORM_PREFILL_PARAM_APP_ID and application.get('id'):
                form_link_with_id = f"{GOOGLE_FORM_LINK}?{GOOGLE_FORM_PREFILL_PARAM_APP_ID}={application['id']}"
            else:
                logger.warning(f"App ID: {application.get('id')}. GOOGLE_FORM_PREFILL_PARAM_APP_ID not configured or app ID missing. Cannot prefill application_id for form link.")
            
            return (f"Thank you for submitting your resume! The next step is to complete our application form. "
                    f"Please fill out this form: {form_link_with_id}\n\n"
                    f"Once you've completed and submitted the form, please send a message here saying 'form completed' or 'done'.")

        elif gemini_response.get("needs_guidance", False):
            return gemini_response.get("response", "I understand you might not have a resume ready. That's okay! Instead, please provide a brief summary of your work experience, education, and skills in a message, and we'll use that information for your application.")
        else:
            new_count = self._increment_attempt_counter(application["id"])
            remaining_attempts = 5 - new_count
            return gemini_response.get("response", f"I don't see a resume attached or pasted. Please upload your resume as a document (PDF, DOC, or DOCX) or paste it as text. {remaining_attempts} attempts remaining.")

    def _handle_request_form(self, application: Dict, message: str,
                           message_type: str, message_data: Dict) -> Optional[str]:
        # Check if user is claiming they completed the form
        if re.search(r"form\s+(is\s+)?(completed|submitted)|(completed|submitted|done)(\s+the)?\s+form", message.lower()):
            # Check if the form was actually submitted via webhook
            try:
                # Look for form_submission event in webhook_events table
                webhook_result = self.db.table("webhook_events").select("*") \
                    .eq("application_id", application["id"]) \
                    .eq("event_type", "form_submitted") \
                    .execute()
                
                # If we found a form_submitted webhook event, the form was truly submitted
                if webhook_result.data and len(webhook_result.data) > 0:
                    # Form was actually submitted, update application step
                    if not self._update_application_step(
                        application["id"], 
                        STEPS["request_form"], 
                        {"form_step": True, "status": "form_received_pending_review"}
                    ):
                        return "Sorry, system error. Please try confirming form completion again."
                    
                    # Move to next step (waiting_review)
                    if not self._update_application_step(application["id"], STEPS["waiting_form_submission_webhook"]):
                        return "Sorry, system error. Please try confirming form completion again."
                    
                    return "Thank you! We have confirmed your form submission. Your application is now under review. We'll get back to you soon with the next steps."
                else:
                    # No form submission confirmed yet
                    form_link_with_id = GOOGLE_FORM_LINK
                    if GOOGLE_FORM_PREFILL_PARAM_APP_ID and application.get('id'):
                        form_link_with_id = f"{GOOGLE_FORM_LINK}?{GOOGLE_FORM_PREFILL_PARAM_APP_ID}={application['id']}"
                    
                    return (f"I don't see your form submission in our system yet. Please make sure you've submitted the form at: "
                            f"{form_link_with_id}\n\n"
                            f"After submitting, please wait a few moments for our system to process it, then send 'form completed' again.")
            except Exception as e:
                logger.error(f"Error checking form submission for app {application['id']}: {e}", exc_info=True)
                return "We're having trouble verifying your form submission. Please ensure you've submitted the form and try again in a few moments."
        else:
            # If user didn't claim to complete the form, remind them to do so
            form_link_with_id = GOOGLE_FORM_LINK
            if GOOGLE_FORM_PREFILL_PARAM_APP_ID and application.get('id'):
                form_link_with_id = f"{GOOGLE_FORM_LINK}?{GOOGLE_FORM_PREFILL_PARAM_APP_ID}={application['id']}"

            return (f"Please complete our application form at {form_link_with_id} and let me know when you're done "
                    f"by replying with 'form completed' or 'done'.")
        
        def _handle_waiting_form_submission_webhook(self, application: Dict, message: str,
                                                message_type: str, message_data: Dict) -> Optional[str]:
        # User messages while bot is waiting for form submission webhook.
        form_link_with_id = GOOGLE_FORM_LINK
        if GOOGLE_FORM_PREFILL_PARAM_APP_ID and application.get('id'):
            form_link_with_id = f"{GOOGLE_FORM_LINK}?{GOOGLE_FORM_PREFILL_PARAM_APP_ID}={application['id']}"
            
        return (f"We are currently waiting for confirmation of your form submission from our system. "
                f"If you haven't submitted it yet, please do so here: {form_link_with_id}\n\n"
                f"If you have already submitted it, please wait a bit for processing. "
                f"No further action is needed from your side on this message right now unless you want to re-confirm submission by typing 'form completed'.")

    def _handle_waiting_review(self, application: Dict, message: str,
                             message_type: str, message_data: Dict) -> Optional[str]:
        return "Your application is currently under review. We'll notify you as soon as a decision is made. Thank you for your patience!"

    def _handle_request_interview_details(self, application: Dict, message: str,
                                     message_type: str, message_data: Dict) -> Optional[str]:
        gemini_response = self._call_gemini("request_interview_details", message)

        if "error" in gemini_response:
            return gemini_response.get("response", "I'm having trouble processing your information. Could you please provide your full name and NRIC number clearly? This is required for office access.")

        # Get what Gemini extracted from this message
        name_from_gemini = gemini_response.get("name", "").strip()
        nric_from_gemini = gemini_response.get("nric", "").strip().upper()
        
        is_name_provided_this_message = gemini_response.get("name_provided", False) and bool(name_from_gemini)
        is_nric_provided_this_message = gemini_response.get("nric_provided", False) and bool(nric_from_gemini)

        update_payload_db = {}
        if is_name_provided_this_message:
            update_payload_db["name"] = name_from_gemini
        if is_nric_provided_this_message:
            update_payload_db["nric"] = nric_from_gemini

        if update_payload_db:
            try:
                result = self.db.table("applications").update(update_payload_db).eq("id", application["id"]).execute()
                if hasattr(result, 'error') and result.error:
                    logger.error(f"DB Error updating NRIC/Name for app {application['id']}: {result.error}")
                    return "I had trouble saving your information. Please try providing the details again."
                # Update local application dict with successfully saved data
                application.update(update_payload_db)
                logger.info(f"Updated application {application['id']} with NRIC/Name details: {update_payload_db}")
            except Exception as e:
                logger.error(f"Exception updating NRIC/Name for app {application['id']}: {e}", exc_info=True)
                return "I had trouble saving your information due to a system error. Please try again."
        
        # Check if we have both name and NRIC now (from DB-backed application dict)
        # Name is considered provided if it's not the default "Applicant" or empty
        current_app_name = application.get("name")
        current_app_nric = application.get("nric")
        
        have_name_overall = bool(current_app_name and current_app_name != "Applicant")
        have_nric_overall = bool(current_app_nric)
        
        if have_name_overall and have_nric_overall:
            if not self._update_application_step(
                application["id"],
                STEPS["request_interview_details"], # Moves to waiting_interview_booking
                {"pass_step": True}  # Indicates NRIC/Name collected
            ):
                return "System error finalizing your details. Please try sending your last message again."

            interview_link = f"{INTERVIEW_LINK_BASE}/{application['id']}"
            display_name = current_app_name # Should be the full name now
            
            return (f"Thank you, {display_name}! We have your details: Name - {current_app_name}, NRIC - {current_app_nric} for the visitor pass.\n\n"
                    f"Please book your interview slot using this link: {interview_link}\n\n"
                    f"{OFFICE_DIRECTIONS}\n\n"
                    "Our interviews are group sessions held daily at 3:00 PM SGT. "
                    "Once you've booked your slot, we'll send you a confirmation message with your booking code.")
        else:
            # Information is still missing, use Gemini's response which should be asking for the missing part.
            response_from_gemini = gemini_response.get("response")
            if response_from_gemini:
                return response_from_gemini
            else: # Fallback if Gemini provides no specific response (shouldn't happen with good prompt)
                missing_parts = []
                if not have_name_overall: missing_parts.append("full name as per NRIC")
                if not have_nric_overall: missing_parts.append("NRIC number")
                return f"We still need your {' and '.join(missing_parts)} to proceed. Please provide the missing information."

    def _handle_waiting_interview_booking(self, application: Dict, message: str,
                                 message_type: str, message_data: Dict) -> Optional[str]:
        interview_link = f"{INTERVIEW_LINK_BASE}/{application['id']}"
        return (f"Thanks for your message. Please ensure you have booked your interview slot via the link we provided: "
                f"{interview_link}\n\n"
                f"Our system will send you a confirmation message automatically once your booking is complete. "
                f"All interviews are group sessions held at 3:00 PM SGT.")

    def _handle_confirmation(self, application: Dict, message: str,
                           message_type: str, message_data: Dict) -> Optional[str]:
        if not self._update_application_step(
            application["id"],
            STEPS["confirmation"], # Moves to 'completed'
            {"status": "interview_scheduled_finalized"}
        ):
             return "System error. Please contact support." # Should ideally not happen at this stage
        return "We're all set for your interview! We look forward to meeting you. If you have any questions before then, or if you need to reschedule, please let us know."

    def _handle_unknown_step(self, application: Dict, message: str,
                           message_type: str, message_data: Dict) -> Optional[str]:
        logger.error(f"Unknown application step: {application.get('current_step')} for app ID {application['id']}")
        return "I'm sorry, there seems to be an issue with your application's current state. Our team will look into this and contact you if necessary."

    def handle_external_review_webhook(self, webhook_data: Dict) -> None:
        try:
            application_id = webhook_data.get("application_id")
            event_type = webhook_data.get("event_type")

            if not application_id:
                logger.error("Webhook missing application_id")
                return
            if not event_type:
                logger.error(f"Webhook for app {application_id} missing event_type")
                return

            # Record all incoming webhooks
            try:
                self.db.table("webhook_events").insert({
                    "application_id": str(application_id),
                    "event_type": event_type,
                    "event_data": webhook_data, # event_data should be JSON serializable
                }).execute()
            except Exception as e_db:
                logger.error(f"Failed to record webhook event for app {application_id}: {e_db}", exc_info=True)


            app_result = self.db.table("applications").select("id, phone_number, name, current_step").eq("id", application_id).execute()
            if not app_result.data:
                logger.error(f"Application not found for ID: {application_id} in {event_type} webhook.")
                return
            application_details = app_result.data[0]
            phone_number = application_details["phone_number"]
            applicant_name = application_details.get("name", "Applicant")


            if event_type == "application_review":
                decision = webhook_data.get("decision", "").lower()
                message_to_send = None

                if decision == "approved":
                    if self._update_application_step(
                        application_id,
                        "request_interview_details",
                        {"status": "approved_pending_details"}
                    ):
                        message_to_send = (
                            f"Dear {applicant_name},\n\n"
                            "We're pleased to inform you that your application has been reviewed and we'd like to invite you for an interview!\n\n"
                            "To proceed with scheduling and to generate a visitor pass for office entry, please reply with your **Full Name (as per NRIC)** and **NRIC number** (e.g., S1234567A or 900101-10-1234)."
                        )
                elif decision == "rejected":
                    rejection_reason = webhook_data.get("reason", "we will not be proceeding with your application at this time")
                    if self._update_application_step(
                        application_id,
                        "rejected",
                        {"status": "rejected", "rejection_reason": rejection_reason}
                    ):
                        message_to_send = f"Dear {applicant_name},\n\nThank you for your interest in our company. After careful consideration, we regret to inform you that {rejection_reason}. We appreciate your time and wish you the best in your job search."
                
                if message_to_send:
                    messenger.send_message(message_to_send, phone_number)
                    self._record_message(application_id, "bot", message_to_send, "text")

            elif event_type == "interview_booked":
                interview_date_str = webhook_data.get("interview_date")
                booking_code = webhook_data.get("booking_code")
                
                try:
                    # Ensure interview_date_str is parsed correctly, assuming ISO format
                    interview_datetime = datetime.datetime.fromisoformat(interview_date_str.replace("Z", "+00:00"))
                    interview_date_formatted = interview_datetime.strftime("%A, %B %d, %Y")
                    interview_time_formatted = interview_datetime.strftime("%I:%M %p %Z") # Make sure TZ is correct
                except Exception as e:
                    logger.error(f"Error parsing interview date '{interview_date_str}': {e}")
                    interview_date_formatted = "the scheduled date"
                    interview_time_formatted = "3:00 PM SGT (as per schedule)"
                
                if self._update_application_step(
                    application_id,
                    "confirmation",
                    {
                        "status": "interview_scheduled",
                        "interview_date": interview_date_str, # Store ISO string
                        "interview_confirmation": True,
                        "booking_code": booking_code
                    }
                ):
                    confirmation_message = (
                        f"Hi {applicant_name},\n\n"
                        f"Your interview has been successfully scheduled for {interview_date_formatted} at {interview_time_formatted}.\n\n"
                        f"Booking Code: {booking_code}\n\n"
                        f"Office Location & Directions:\n{OFFICE_DIRECTIONS}\n\n"
                        "Your visitor pass will be prepared based on the details you provided. "
                        "We look forward to meeting you!"
                    )
                    messenger.send_message(confirmation_message, phone_number)
                    self._record_message(application_id, "bot", confirmation_message, "text")
                    logger.info(f"Interview booking confirmed for application {application_id}. User notified.")

            elif event_type == "form_submitted":
                # This event confirms the Google Form was submitted by the applicant.
                # application_id should be in webhook_data, sent by your Google Apps Script.
                
                # Ensure we are in the correct state to process this
                if application_details["current_step"] != "waiting_form_submission_webhook":
                    logger.warning(f"Received form_submitted webhook for app {application_id} but current_step is {application_details['current_step']}. Processing anyway if form_step is not true.")
                    # If form_step is already true, maybe it's a duplicate webhook.
                    if application_details.get("form_step"):
                        logger.info(f"Form step already marked true for {application_id}. Ignoring duplicate form_submitted webhook.")
                        return
                
                if self._update_application_step(
                    application_id,
                    STEPS["waiting_form_submission_webhook"], # Moves to 'waiting_review'
                    {"form_step": True, "status": "form_received_pending_review"}
                ):
                    message = "We have successfully received and verified your form submission! Your application is now under review. We'll get back to you soon with the next steps."
                    messenger.send_message(message, phone_number)
                    self._record_message(application_id, "bot", message, "text")
                    logger.info(f"Form submission confirmed via webhook for application {application_id}. User notified.")
                else:
                    logger.error(f"Failed to update step after form_submitted webhook for app {application_id}")


        except Exception as e:
            logger.error(f"Error processing webhook (event: {event_type}, app: {application_id}): {e}", exc_info=True)


# Initialize the bot
application_bot = ApplicationBot(supabase_client)

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
    return Response(status=400)

@app.route('/webhook', methods=['POST'])
def whatsapp_webhook():
    data = request.get_json()
    if not data:
        logger.error("Received empty JSON payload for WhatsApp webhook")
        return Response(status=400)

    # logger.info(f"WhatsApp webhook received: {json.dumps(data, indent=2)}")

    try:
        if data.get('object') == 'whatsapp_business_account':
            for entry in data.get('entry', []):
                for change in entry.get('changes', []):
                    if change.get('field') == 'messages':
                        value = change.get('value', {})
                        messages = value.get('messages', [])
                        # metadata = value.get('metadata', {})

                        for message_obj in messages:
                            sender_id = message_obj.get('from')
                            msg_type = message_obj.get('type')
                            message_data_payload = {}

                            if msg_type == 'text':
                                message_data_payload['text'] = message_obj.get('text', {})
                            elif msg_type == 'document':
                                message_data_payload['document'] = message_obj.get('document', {})
                            elif msg_type == 'image':
                                message_data_payload['image'] = message_obj.get('image', {})
                            # Add other supported types if necessary
                            else:
                                logger.info(f"Received unhandled message type: {msg_type} from {sender_id}. Ignoring.")
                                # Optionally, send a message to user about unsupported type
                                # messenger.send_message("I can only process text, images, and documents currently.", sender_id)
                                continue 

                            if sender_id and message_data_payload:
                                response_text = application_bot.process_message(sender_id, message_data_payload)
                                if response_text: # Only send if there's something to send
                                    messenger.send_message(response_text, sender_id)
                            else:
                                logger.warning(f"Missing sender_id or message_data_payload for message: {message_obj}")
        return Response(status=200)
    except Exception as e:
        logger.error(f"Error in WhatsApp webhook processing: {e}", exc_info=True)
        return Response(status=500)


@app.route('/external-review-webhook', methods=['POST'])
def external_review_webhook():
    data = request.get_json()
    if not data:
        logger.error("Received empty JSON payload for external review webhook")
        return Response(status=400)
    
    logger.info(f"External review webhook received: {json.dumps(data, indent=2)}")
    try:
        application_bot.handle_external_review_webhook(data)
        return Response(status=200)
    except Exception as e:
        logger.error(f"Error in external_review_webhook handling: {e}", exc_info=True)
        return Response(status=500)


@app.route('/health', methods=['GET'])
def health_check():
    # Basic health check
    db_ok = False
    gemini_ok = False
    try:
        # Simple Supabase check: e.g., select a non-existent table or a small public one
        # For simplicity, we'll assume client initialization implies basic connectivity.
        # A more robust check would be like: supabase_client.table("applications").select("id", count="exact").limit(0).execute()
        # if create_client didn't raise error, then URL/Key are syntactically fine.
        db_ok = True if supabase_client else False
    except Exception:
        db_ok = False

    try:
        # Simple Gemini check: list models (lightweight call)
        # genai.list_models() # This makes an API call, can be slow or rate-limited for health check.
        # For simplicity, check if API key is configured.
        gemini_ok = True if GEMINI_API_KEY else False
    except Exception:
        gemini_ok = False
        
    status = "ok" if db_ok and gemini_ok else "degraded"

    return jsonify({
        "status": status,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "version": "1.3.0", # Incremented version
        "dependencies": {
            "supabase": "ok" if db_ok else "error",
            "gemini": "ok" if gemini_ok else "error"
        }
    })

if __name__ == '__main__':
    host = '127.0.0.1'
    port = int(os.environ.get("PORT", 5000)) # Allow port to be set by Heroku or similar
    
    print(f"Starting server on http://{host}:{port}")
    print("Available endpoints:")
    print("  - /                       : Root endpoint (returns status message)")
    print("  - /health                 : Health check endpoint")
    print("  - /webhook                : WhatsApp webhook endpoint")
    print("  - /external-review-webhook: External review/booking/form webhook endpoint")
    
    # app.run(host=host, port=port, debug=True) # For easier debugging
    serve(app, host=host, port=port, threads=4)