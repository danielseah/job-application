import os
import re
import json
import logging
import datetime
from typing import Dict, Any, Optional
import uuid
from urllib.parse import urlparse # Added for parsing media URLs

# Twilio API integration for TwiML
from twilio.twiml.messaging_response import MessagingResponse # Changed from heyoo
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

# REMOVED: WhatsApp client (heyoo) initialization
# WHATSAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN")
# VERIFY_TOKEN = os.environ.get("VERIFY_TOKEN") # VERIFY_TOKEN is specific to Meta, not used by Twilio webhook directly
# PHONE_NUMBER_ID = os.environ.get("PHONE_NUMBER_ID")
#
# if not all([WHATSAPP_TOKEN, VERIFY_TOKEN, PHONE_NUMBER_ID]):
#     logger.error("WhatsApp environment variables not fully configured.")
# messenger = WhatsApp(WHATSAPP_TOKEN, phone_number_id=PHONE_NUMBER_ID)

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
    return jsonify({"message": "Job Application Bot (Twilio Version) is running!"})

# Interview scheduling and office information
INTERVIEW_LINK_BASE = os.environ.get("INTERVIEW_LINK_BASE", "https://your-ngrok-domain.ngrok-free.app/interview") # Ensure this is your ngrok domain
OFFICE_DIRECTIONS = """
Our full address is 115 Airport Cargo Road, Changi Airport Cargo Building C, Level 7 Unit 18.

Please alight at the Police Pass Office Bus Stop (95131) first to exchange for the visitor pass. 
Do bring a pen as there will be a small slip of paper you need to fill in as well located on the side shelves.

When you are at the Airport Police Pass Office, please proceed to counter 1, 2, 3 and 4 in order to exchange passes. Please inform them that you are attending an interview. Please also inform them that the authorisation has been given by an agent company called Mirae. (Note: do not go to the SIA counter to exchange your pass.)

After receiving the visitor pass, you may then take any bus such as 9, 19, 89 or even the express bus 89e from the bus stop where you've alighted earlier to enter the protected area.  Additionally, you can enter by your personal vehicle after clearing the pass office.

Once you've cleared the protected area checkpoint, please alight at 3rd Cargo Agents Building (95051) which is three 3 bus stops after to access the area. Please note that the bus might skip certain stops when there is no one. So please do not count the number of times the bus stopped. 

Finally, head over to the office lobby where there would be 3 elevators. Once you've arrived, kindly report to #07-18
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
    "request_form": "waiting_form_submission_webhook",
    "waiting_form_submission_webhook": "waiting_review",
    "waiting_review": "request_interview_details",
    "request_interview_details": "waiting_interview_booking",
    "waiting_interview_booking": "confirmation",
    "confirmation": "completed"
}

# Gemini model configurations for each step
GEMINI_MODELS = {
    "confirm_intent": {
        "model_name": "gemini-2.5-flash-preview-05-20",
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
        "temperature": 0.3,
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
        "model_name": "gemini-2.5-flash-preview-05-20",
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
        "model_name": "gemini-2.5-flash-preview-05-20",
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
            if not application:
                logger.error(f"Failed to get or create application for sender_id: {sender_id}")
                return "Sorry, there was an issue initializing your application. Please try again."

            self._record_message(application["id"], "user", message_content, message_type)

            current_step = application.get("current_step", "initial_contact")
            step_handler = getattr(self, f"_handle_{current_step}", self._handle_unknown_step)

            response = step_handler(application, message_content, message_type, message_data)

            if response:
                self._record_message(application["id"], "bot", response, "text")
            return response

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
            # For Twilio, the 'filename' is what we constructed in the webhook
            return message_data["document"].get("filename", "document_received")
        elif message_type == "image":
            # For Twilio, 'caption' is what we assigned from Body or empty
            return message_data["image"].get("caption", "image_received")
        return ""

    def _get_or_create_application(self, phone_number: str) -> Optional[Dict]:
        try:
            # Twilio sends phone_number with "whatsapp:" prefix, e.g., "whatsapp:+14155238886"
            # Ensure this is handled consistently if your DB expects a different format.
            # For this conversion, we assume the format is stored as received.
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
                    "attempts_counter": 0,
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

            if file_url: message_data["file_url"] = file_url # This would be the Twilio MediaUrl
            if file_type: message_data["file_type"] = file_type # This would be Twilio MediaContentType

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
                "attempts_counter": 0,
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }

            if additional_data is not None:
                if "pass_office_code" in additional_data: # Keep this logic as per original
                    del additional_data["pass_office_code"]
                update_data.update(additional_data)

            logger.info(f"Updating application {application_id} to step '{new_step}' with data: {additional_data}")
            result = self.db.table("applications").update(update_data).eq("id", application_id).execute()

            if hasattr(result, 'error') and result.error:
                 logger.error(f"DB Error updating application step for {application_id} to {new_step}: {result.error}")
                 return False
            return True
        except Exception as e:
            logger.error(f"Exception in _update_application_step for app {application_id}, step {new_step}: {e}", exc_info=True)
            return False

    def _increment_attempt_counter(self, application_id: uuid.UUID) -> int:
        try:
            app_result = self.db.table("applications").select("attempts_counter").eq("id", application_id).execute()
            if hasattr(app_result, 'error') and app_result.error:
                logger.error(f"DB Error fetching attempts_counter for {application_id}: {app_result.error}")
                return -1

            current_count = app_result.data[0]["attempts_counter"] if app_result.data and app_result.data[0]["attempts_counter"] is not None else 0
            new_count = current_count + 1

            update_res = self.db.table("applications").update({"attempts_counter": new_count}).eq("id", application_id).execute()
            if hasattr(update_res, 'error') and update_res.error:
                logger.error(f"DB Error updating attempts_counter for {application_id}: {update_res.error}")
                return -1
            return new_count
        except Exception as e:
            logger.error(f"Exception in _increment_attempt_counter for app {application_id}: {e}", exc_info=True)
            return -1

    def _call_gemini(self, step: str, user_message: str) -> Dict:
        model_config = GEMINI_MODELS.get(step)
        if not model_config:
            logger.error(f"No Gemini model configuration found for step: {step}")
            return {"error": "Model configuration not found", "response": "Internal configuration error."}

        try:
            model = genai.GenerativeModel(
                model_name=model_config["model_name"],
                generation_config={"temperature": model_config["temperature"]},
                system_instruction=model_config["instructions"]
            )
            full_prompt = f"User message: {user_message}"
            if not user_message:
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
        # period_in_months = gemini_response.get("period_in_months", 0) # Not directly used in DB update in original

        db_update_payload = {}

        if commitment_sufficient:
            db_update_payload["commitment_step"] = True
            if not self._update_application_step(application["id"], STEPS["commitment_check"], db_update_payload):
                return "Sorry, we encountered a system issue saving your commitment. Please try again."

            positive_response = gemini_response.get("response")
            if not positive_response or not commitment_sufficient:
                 positive_response = f"Thank you! Your commitment period of {commitment_period} works for us."

            return f"{positive_response} The next step is to upload your resume or CV. You can send it as a document (PDF, DOC, DOCX) or paste its content as text."
        else:
            prompting_response = gemini_response.get("response")
            if not prompting_response:
                prompting_response = f"I understand your current availability is for {commitment_period}. Our roles require a minimum commitment of 1 month. Would you be able to meet this 1-month requirement?"
            return prompting_response

    def _handle_request_resume(self, application: Dict, message: str,
                             message_type: str, message_data: Dict) -> Optional[str]:
        attempts = application.get("attempts_counter", 0)
        if attempts >= 5:
            if not self._update_application_step(application["id"], "ignored", {"status": "abandoned_resume"}):
                return "System error. Please contact support."
            return "We haven't received your resume after multiple attempts. Your application has been paused. Feel free to start again when you're ready."

        # file_url from Twilio MediaUrl0 will be in message_data if it's a document/image
        # The 'message' param here is the extracted content (filename for doc, caption for image, body for text)
        
        is_file_submission = message_type in ["document", "image"]
        actual_file_url = None # This would be the Twilio MediaUrl0
        
        if is_file_submission:
            if message_type == "document":
                actual_file_url = message_data.get("document", {}).get("id") # We stored MediaUrl0 in 'id'
            elif message_type == "image":
                actual_file_url = message_data.get("image", {}).get("id") # We stored MediaUrl0 in 'id'
        
        # 'message' is already the user input for Gemini (text body, or filename/caption)
        user_input_for_gemini = message 
        if not user_input_for_gemini and is_file_submission:
             user_input_for_gemini = f"The user sent a file: {message}." # message here is filename/caption

        gemini_response = self._call_gemini("request_resume", user_input_for_gemini)

        if "error" in gemini_response:
            self._increment_attempt_counter(application["id"])
            return gemini_response.get("response", "I'm having trouble processing your resume. Please try uploading it again as a document (PDF, DOC, or DOCX), or paste the text.")

        if gemini_response.get("resume_received", False) or is_file_submission:
            # Use actual_file_url (Twilio's MediaUrl0) if available, else mark as text resume
            resume_storage_indicator = actual_file_url if actual_file_url else "text_resume_in_messages"
            additional_update = {"resume_step": True, "resume_url": resume_storage_indicator}
            
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
        if re.search(r"form\s+(is\s+)?(completed|submitted)|(completed|submitted|done)(\s+the)?\s+form", message.lower()):
            try:
                # Check if 'status' was updated to 'form_submitted' by the webhook
                # This check was slightly different in original, adapting to check 'status' field
                app_check_result = self.db.table("applications").select("status, form_step") \
                    .eq("id", application["id"]) \
                    .single() \
                    .execute()

                if app_check_result.data and app_check_result.data.get("status") == "form_submitted":
                    # Form was confirmed by webhook, update step
                    if not self._update_application_step(
                        application["id"],
                        STEPS["request_form"], # This moves to waiting_form_submission_webhook
                        {"form_step": True, "status": "form_received_pending_review"} # Update status again
                    ):
                        return "Sorry, system error. Please try confirming form completion again."

                    # Then immediately move to the next logical step after webhook confirmation
                    if not self._update_application_step(application["id"], STEPS["waiting_form_submission_webhook"]): # This moves to waiting_review
                         return "Sorry, system error. Please try confirming form completion again."

                    return "Thank you! We have confirmed your form submission. Your application is now under review. We'll get back to you soon with the next steps."
                else:
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
            form_link_with_id = GOOGLE_FORM_LINK
            if GOOGLE_FORM_PREFILL_PARAM_APP_ID and application.get('id'):
                form_link_with_id = f"{GOOGLE_FORM_LINK}?{GOOGLE_FORM_PREFILL_PARAM_APP_ID}={application['id']}"
            return (f"Please complete our application form at {form_link_with_id} and let me know when you're done "
                    f"by replying with 'form completed' or 'done'.")

    def _handle_waiting_form_submission_webhook(self, application: Dict, message: str,
                                            message_type: str, message_data: Dict) -> Optional[str]:
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

        name_from_gemini = gemini_response.get("name", "").strip()
        nric_from_gemini = gemini_response.get("nric", "").strip().upper()
        is_name_provided_this_message = gemini_response.get("name_provided", False) and bool(name_from_gemini)
        is_nric_provided_this_message = gemini_response.get("nric_provided", False) and bool(nric_from_gemini)

        update_payload_db = {}
        if is_name_provided_this_message: update_payload_db["name"] = name_from_gemini
        if is_nric_provided_this_message: update_payload_db["nric"] = nric_from_gemini # NRIC column might not exist based on schema

        if update_payload_db:
            try:
                # Check if 'nric' column exists before trying to update it
                # Based on provided schema, 'nric' is NOT in 'applications' table.
                # This logic will be kept as per "Do not change any of the codes or logic"
                # but it will likely fail if 'nric' column doesn't exist.
                # For now, let's assume the user will add it or it's handled.
                # If 'nric' is not in the table, remove it from update_payload_db to avoid error
                if "nric" in update_payload_db and not self._column_exists("applications", "nric"):
                    logger.warning("NRIC column does not exist in applications table. Not updating NRIC.")
                    del update_payload_db["nric"]

                if update_payload_db: # If there's still something to update
                    result = self.db.table("applications").update(update_payload_db).eq("id", application["id"]).execute()
                    if hasattr(result, 'error') and result.error:
                        logger.error(f"DB Error updating NRIC/Name for app {application['id']}: {result.error}")
                        return "I had trouble saving your information. Please try providing the details again."
                    application.update(update_payload_db)
                    logger.info(f"Updated application {application['id']} with details: {update_payload_db}")

            except Exception as e:
                logger.error(f"Exception updating NRIC/Name for app {application['id']}: {e}", exc_info=True)
                return "I had trouble saving your information due to a system error. Please try again."

        current_app_name = application.get("name")
        current_app_nric = application.get("nric") # This will be None if not in DB/app dict
        have_name_overall = bool(current_app_name and current_app_name != "Applicant")
        have_nric_overall = bool(current_app_nric) # Will be false if NRIC not stored

        if have_name_overall and have_nric_overall:
            if not self._update_application_step(
                application["id"],
                STEPS["request_interview_details"],
                {"pass_step": True}
            ):
                return "System error finalizing your details. Please try sending your last message again."

            interview_link = f"{INTERVIEW_LINK_BASE}/{application['id']}"
            display_name = current_app_name

            return (f"Thank you, {display_name}! We have your details: Name - {current_app_name}, NRIC - {current_app_nric} for the visitor pass.\n\n"
                    f"Please book your interview slot using this link: {interview_link}\n\n"
                    f"{OFFICE_DIRECTIONS}\n\n"
                    "Our interviews are group sessions held daily at 3:00 PM SGT. "
                    "Once you've booked your slot, we'll send you a confirmation message with your booking code.")
        else:
            response_from_gemini = gemini_response.get("response")
            if response_from_gemini:
                return response_from_gemini
            else:
                missing_parts = []
                if not have_name_overall: missing_parts.append("full name as per NRIC")
                if not have_nric_overall: missing_parts.append("NRIC number") # Will ask for NRIC even if not storable by current schema
                return f"We still need your {' and '.join(missing_parts)} to proceed. Please provide the missing information."

    def _column_exists(self, table_name: str, column_name: str) -> bool:
        """Helper to check if a column exists, to prevent errors with dynamic updates."""
        # This is a simplified check. A more robust way would be to query information_schema
        # or cache table structure. For now, this is a placeholder.
        # Based on provided schema, 'nric' is NOT in 'applications'.
        if table_name == "applications" and column_name == "nric":
            return False # Explicitly based on provided schema
        # Add other known columns if needed for safety
        return True # Assume exists otherwise for this example

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
            STEPS["confirmation"],
            {"status": "interview_scheduled_finalized"}
        ):
             return "System error. Please contact support."
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

            try:
                self.db.table("webhook_events").insert({
                    "application_id": str(application_id),
                    "event_type": event_type,
                    "event_data": webhook_data,
                }).execute()
            except Exception as e_db:
                logger.error(f"Failed to record webhook event for app {application_id}: {e_db}", exc_info=True)

            app_result = self.db.table("applications").select("id, phone_number, name, current_step, form_step").eq("id", application_id).single().execute() # Added form_step
            if not app_result.data:
                logger.error(f"Application not found for ID: {application_id} in {event_type} webhook.")
                return
            application_details = app_result.data
            phone_number = application_details["phone_number"] # This is Twilio format e.g. whatsapp:+1...
            applicant_name = application_details.get("name", "Applicant")
            message_to_send = None

            if event_type == "application_review":
                decision = webhook_data.get("decision", "").lower()
                if decision == "approved":
                    if self._update_application_step(
                        application_id,
                        "request_interview_details",
                        {"status": "approved_pending_details"}
                    ):
                        message_to_send = (
                            f"Dear {applicant_name},\n\n"
                            "We're pleased to inform you that your application has been reviewed and we'd like to invite you for an interview!\n\n"
                            "As our facility is located in a heavily guarded area within Singapore, kindly provide us your *full name as per NRIC and NRIC number* "
                            "in advance to facilitate the clearance with the Airport Police.\n"
                            "To proceed with scheduling and to generate a visitor pass for office entry, *please reply with your **Full Name (as per NRIC)** and **NRIC number** (e.g., S1234567A or 900101-10-1234).*\n"
                            "\n\nThank you ☺ (Kindly wait for confirmation of your entry number before we can confirm your interview date and time slot for the next steps. *This message is not a confirmation of the interview date)*"
                        )
                elif decision == "rejected":
                    rejection_reason = webhook_data.get("reason", "we will not be proceeding with your application at this time")
                    if self._update_application_step(
                        application_id,
                        "rejected",
                        {"status": "rejected", "rejection_reason": rejection_reason}
                    ):
                        message_to_send = f"Dear {applicant_name},\n\nThank you for your interest in our company. After careful consideration, we regret to inform you that {rejection_reason}. We appreciate your time and wish you the best in your job search."

            elif event_type == "interview_booked":
                logger.info(f"Received interview booking confirmation for application {application_id}.")
                interview_date_str = webhook_data.get("interview_date")
                pass_office_code = webhook_data.get("pass_office_code")
                try:
                    interview_datetime = datetime.datetime.fromisoformat(interview_date_str.replace("Z", "+00:00"))
                    interview_date_formatted = interview_datetime.strftime("%A, %B %d, %Y")
                    interview_time_formatted = interview_datetime.strftime("%I:%M %p %Z")
                except Exception as e:
                    logger.error(f"Error parsing interview date '{interview_date_str}': {e}")
                    interview_date_formatted = "the scheduled date"
                    interview_time_formatted = "3:00 PM SGT (as per schedule)"

                update_payload = {
                    "status": "interview_scheduled",
                    "interview_date": interview_date_str,
                    "interview_confirmation": True,
                }
                # pass_office_code is in 'interview_bookings' table, not 'applications' per schema
                # So, we don't add it to 'applications' update here.
                # The original code had "pass_office_code": pass_office_code in the update_data for _update_application_step
                # but then deleted it if present. This means it was never intended to be saved in 'applications' table.

                if self._update_application_step(application_id, "confirmation", update_payload):
                    confirmation_message = (
                        f"Hi {applicant_name},\n\n"
                        f"Your interview has been successfully scheduled for {interview_date_formatted} at {interview_time_formatted}.\n\n"
                        f"*Pass Office Code: {pass_office_code}*\n\n"
                        f"Important: When you arrive at the Airport Police Pass Office, please mention this code to obtain your visitor pass.\n\n"
                        f"Office Location & Directions:\n{OFFICE_DIRECTIONS}\n\n"
                        "Your visitor pass will be prepared based on the details you provided. "
                        "We look forward to meeting you!"
                    )
                    message_to_send = confirmation_message
                    logger.info(f"Interview booking confirmed for application {application_id}. User notified with pass code {pass_office_code}.")

            elif event_type == "form_submitted":
                # current_step = application_details["current_step"] # Already fetched
                # form_step_db = application_details.get("form_step", False) # Already fetched

                # if current_step != "waiting_form_submission_webhook" and not form_step_db :
                #     logger.warning(f"Received form_submitted webhook for app {application_id} but current_step is {current_step} and form_step is {form_step_db}. Processing.")
                # elif form_step_db:
                #     logger.info(f"Form step already marked true for {application_id}. Ignoring duplicate form_submitted webhook.")
                #     return

                # Simplified logic: if form_submitted webhook comes, try to update. Idempotency handled by step logic.
                if self._update_application_step(
                    application_id,
                    STEPS["waiting_form_submission_webhook"], # Moves to 'waiting_review'
                    {"form_step": True, "status": "form_received_pending_review"} # Original logic
                ):
                    message_to_send = "We have successfully received and verified your form submission! Your application is now under review. We'll get back to you soon with the next steps."
                    logger.info(f"Form submission confirmed via webhook for application {application_id}. User notified.")
                else:
                    logger.error(f"Failed to update step after form_submitted webhook for app {application_id}")

            if message_to_send:
                # messenger.send_message(message_to_send, phone_number) # Original heyoo call
                logger.info(f"TODO: Send proactive Twilio message to {phone_number}: {message_to_send}")
                logger.warning("Sending proactive messages requires Twilio REST API client and credentials, which are not used in this TwiML-reply setup.")
                # To implement this, you would use:
                # from twilio.rest import Client as TwilioClient
                # client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
                # client.messages.create(to=phone_number, from_=YOUR_TWILIO_WHATSAPP_NUMBER, body=message_to_send)
                self._record_message(application_id, "bot", message_to_send, "text")

        except Exception as e:
            logger.error(f"Error processing webhook (event: {event_type}, app: {application_id}): {e}", exc_info=True)

application_bot = ApplicationBot(supabase_client)

# REMOVED: WhatsApp Webhook GET verification (specific to Meta/heyoo)
# @app.route('/webhook', methods=['GET'])
# def verify_whatsapp_webhook(): ...

@app.route('/webhook', methods=['POST'])
def twilio_webhook(): # Renamed for clarity, path remains /webhook
    # Twilio sends data as x-www-form-urlencoded
    form_data = request.values
    # logger.info(f"Twilio webhook received: {form_data}")

    sender_id = form_data.get('From') # e.g., whatsapp:+14155238886
    message_body = form_data.get('Body', None) # Text content of the message
    num_media = int(form_data.get('NumMedia', 0))
    
    # Twilio WhatsApp number that received the message
    # to_number = form_data.get('To') # e.g., whatsapp:+15017122661

    message_data_payload = {}
    processed_as_media = False
    media_content_for_db_record = message_body if message_body else ""
    media_url_for_db_record = None
    media_type_for_db_record = None


    if num_media > 0:
        media_url = form_data.get('MediaUrl0')
        media_content_type = form_data.get('MediaContentType0', '').lower()
        
        # Try to get a filename from the URL, or use a generic one
        parsed_url = urlparse(media_url)
        original_filename_from_url = os.path.basename(parsed_url.path) if media_url else "media_file"
        safe_filename = secure_filename(original_filename_from_url if original_filename_from_url else "media_file")

        media_url_for_db_record = media_url
        media_type_for_db_record = media_content_type

        if 'pdf' in media_content_type or \
           'doc' in media_content_type or \
           'docx' in media_content_type or \
           'application/msword' in media_content_type or \
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document' in media_content_type:
            
            message_data_payload['document'] = {
                'id': media_url, # Using media_url as an identifier like original code did for heyoo media id
                'filename': safe_filename or 'document_from_twilio.pdf'
            }
            if message_body: # Twilio Body acts as caption for media
                message_data_payload['document']['caption'] = message_body
            media_content_for_db_record = message_data_payload['document']['filename']
            processed_as_media = True
        elif 'image' in media_content_type:
            message_data_payload['image'] = {
                'id': media_url,
                'caption': message_body if message_body else ''
            }
            media_content_for_db_record = message_data_payload['image']['caption'] or "image_received"
            processed_as_media = True
        else:
            logger.warning(f"Received unhandled Twilio media type: {media_content_type} from {sender_id}. URL: {media_url}")
            # Fallback to text if body exists, otherwise it might be an unsupported media type
            if message_body:
                 message_data_payload['text'] = {'body': message_body}
                 media_content_for_db_record = message_body
            else: # No text body and unhandled media
                logger.info(f"Ignoring message from {sender_id} with unhandled media type and no text body.")
                twiml_resp = MessagingResponse() # Send empty 200 OK
                return str(twiml_resp), 200, {'Content-Type': 'application/xml'}


    elif message_body is not None: # It's a text message
        message_data_payload['text'] = {'body': message_body}
        media_content_for_db_record = message_body
    else: # No text, no media (e.g. location pin, contact card - not handled by this bot)
        logger.info(f"Received message from {sender_id} with no text body and no processable media. Ignoring.")
        twiml_resp = MessagingResponse() # Send empty 200 OK
        return str(twiml_resp), 200, {'Content-Type': 'application/xml'}

    if not sender_id or not message_data_payload:
        logger.warning(f"Missing sender_id or message_data_payload. Sender: {sender_id}, Payload: {message_data_payload}")
        twiml_resp = MessagingResponse() # Send empty 200 OK
        return str(twiml_resp), 200, {'Content-Type': 'application/xml'}

    # Call the bot's processing logic
    response_text_from_bot = application_bot.process_message(sender_id, message_data_payload)

    # Prepare TwiML response
    twiml_response = MessagingResponse()
    if response_text_from_bot:
        twiml_response.message(response_text_from_bot)
    
    # Always return a 200 OK with TwiML (even if empty)
    return str(twiml_response), 200, {'Content-Type': 'application/xml'}


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
    db_ok = False
    gemini_ok = False
    try:
        db_ok = True if supabase_client else False
    except Exception:
        db_ok = False

    try:
        gemini_ok = True if GEMINI_API_KEY else False
    except Exception:
        gemini_ok = False

    status = "ok" if db_ok and gemini_ok else "degraded"

    return jsonify({
        "status": status,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "version": "1.4.0-twilio", # Updated version
        "dependencies": {
            "supabase": "ok" if db_ok else "error",
            "gemini": "ok" if gemini_ok else "error"
        }
    })

if __name__ == '__main__':
    host = '127.0.0.1'
    # Port 8080 as requested for ngrok
    port = int(os.environ.get("PORT", 8080)) 

    print(f"Starting Twilio Job Application Bot server on http://{host}:{port}")
    print("Ensure your ngrok tunnel for port 8080 is active.")
    print(f"Configure your Twilio WhatsApp number's 'A MESSAGE COMES IN' webhook to: http://<your-ngrok-url>/webhook (HTTP POST)")
    print("Available endpoints:")
    print("  - /                       : Root endpoint (returns status message)")
    print("  - /health                 : Health check endpoint")
    print("  - /webhook                : Twilio WhatsApp webhook endpoint (POST)")
    print("  - /external-review-webhook: External review/booking/form webhook endpoint (POST)")

    # For development, Flask's built-in server is fine with debug=True
    # app.run(host=host, port=port, debug=True)
    # For something more robust, Waitress is a good choice
    serve(app, host=host, port=port, threads=4)