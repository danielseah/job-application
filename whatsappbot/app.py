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
import os
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
    "confirm_intent": "request_resume",
    "request_resume": "commitment_check", 
    "commitment_check": "request_form",  
    "request_form": "waiting_review",
    "waiting_review": "schedule_interview",
    "schedule_interview": "confirmation",
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
    "schedule_interview": {
        "model_name": "gemini-2.5-flash-preview-05-20", 
        "temperature": 0.1,
        "instructions": """
        You are an HR assistant handling interview scheduling. Your role is to verify if the user has provided their full name and NRIC correctly.
        
        You must ONLY respond in JSON format with the following structure:
        {
            "name_provided": true/false,
            "nric_provided": true/false,
            "calendly_confirmed": true/false,
            "name": "extracted name",
            "nric": "extracted NRIC",
            "response": "your response message here"
        }
        
        For NRIC validation:
        - Singapore NRIC typically follows the pattern: S/T/F/G/M followed by 7 digits, then a checksum letter
        - Malaysian NRIC typically has 12 digits, often written with hyphens like XXXXXX-XX-XXXX
        
        When extracting NRIC, make sure to identify and extract the complete NRIC number.
        
        If the user mentions booking a calendly slot, set calendly_confirmed to true.
        
        Keep your responses professional and helpful.
        """
    }
}

class ApplicationBot:
    def __init__(self, supabase_client: Client):
        self.db = supabase_client
        
    def process_message(self, sender_id: str, message_data: Dict[Any, Any]) -> str:
        """Process incoming messages and route to appropriate handler"""
        try:
            # Extract message content
            message_type = self._determine_message_type(message_data)
            message_content = self._extract_message_content(message_data, message_type)
            
            # Get or create application record
            application = self._get_or_create_application(sender_id)
            
            # Record the message
            self._record_message(application["id"], "user", message_content, message_type)
            
            # Process based on current step
            current_step = application.get("current_step", "initial_contact")
            step_handler = getattr(self, f"_handle_{current_step}", self._handle_unknown_step)
            
            response = step_handler(application, message_content, message_type, message_data)
            
            # Record bot response
            self._record_message(application["id"], "bot", response, "text")
            
            return response
            
        except Exception as e:
            logger.error(f"Error processing message: {e}")
            return "Sorry, we encountered an error. Please try again later."
    
    def _determine_message_type(self, message_data: Dict) -> str:
        """Determine the type of message received"""
        if "text" in message_data:
            return "text"
        elif "document" in message_data:
            return "document"
        elif "image" in message_data:
            return "image"
        else:
            return "unknown"
    
    def _extract_message_content(self, message_data: Dict, message_type: str) -> str:
        """Extract content from the message based on type"""
        if message_type == "text":
            return message_data["text"].get("body", "")
        elif message_type == "document":
            return message_data["document"].get("filename", "")
        elif message_type == "image":
            return message_data["image"].get("caption", "")
        return ""
    
    def _get_or_create_application(self, phone_number: str) -> Dict:
        """Get existing application or create a new one"""
        result = self.db.table("applications").select("*").eq("phone_number", phone_number).execute()
        
        if result.data and len(result.data) > 0:
            # Update last interaction time
            application = result.data[0]
            self.db.table("applications").update({
                "last_interaction": datetime.datetime.now().isoformat()
            }).eq("id", application["id"]).execute()
            return application
        else:
            # Create new application
            new_application = {
                "name": "Applicant",  # Will be updated later
                "phone_number": phone_number,
                "current_step": "initial_contact",
                "status": "pending"
            }
            result = self.db.table("applications").insert(new_application).execute()
            return result.data[0]
    
    def _record_message(self, application_id: uuid.UUID, sender: str, content: str, 
                       message_type: str, file_url: str = None, file_type: str = None) -> None:
        """Record a message in the database"""
        # Get the step name from the application
        app_result = self.db.table("applications").select("current_step").eq("id", application_id).execute()
        step_name = app_result.data[0]["current_step"] if app_result.data else "unknown"
        
        message_data = {
            "application_id": application_id,
            "sender": sender,
            "message_content": content,
            "message_type": message_type,
            "step_name": step_name
        }
        
        if file_url:
            message_data["file_url"] = file_url
            message_data["file_type"] = file_type
            
        self.db.table("applicant_messages").insert(message_data).execute()
    
    def _update_application_step(self, application_id: uuid.UUID, new_step: str, 
                               additional_data: Dict = None) -> None:
        """Update the application's current step and any additional data"""
        update_data = {"current_step": new_step, "attempts_counter": 0}
        
        if additional_data:
            update_data.update(additional_data)
            
        self.db.table("applications").update(update_data).eq("id", application_id).execute()
    
    def _increment_attempt_counter(self, application_id: uuid.UUID) -> int:
        """Increment and return the attempt counter for an application"""
        app_result = self.db.table("applications").select("attempts_counter").eq("id", application_id).execute()
        current_count = app_result.data[0]["attempts_counter"] if app_result.data else 0
        new_count = current_count + 1
        
        self.db.table("applications").update({"attempts_counter": new_count}).eq("id", application_id).execute()
        return new_count
    
    def _call_gemini(self, step: str, user_message: str) -> Dict:
        """Call the appropriate Gemini model for the current step"""
        model_config = GEMINI_MODELS.get(step)
        if not model_config:
            logger.error(f"No Gemini model configuration found for step: {step}")
            return {"error": "Model configuration not found"}
            
        try:
            model = genai.GenerativeModel(
                model_name=model_config["model_name"],
                generation_config={"temperature": model_config["temperature"]}
            )
            
            prompt = f"{model_config['instructions']}\n\nUser message: {user_message}"
            response = model.generate_content(prompt)
            response_text = response.text
        
            # Clean up the response text to remove code block markers
            if response_text.startswith("```json"):
                response_text = response_text.replace("```json", "", 1)
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()
            
            # Parse JSON response
            try:
                return json.loads(response_text)
            except json.JSONDecodeError:
                logger.error(f"Failed to parse Gemini response as JSON: {response_text}")
                return {"error": "Invalid JSON response from model"}
                
        except Exception as e:
            logger.error(f"Error calling Gemini API: {e}")
            return {"error": f"API error: {str(e)}"}
    
    def _handle_initial_contact(self, application: Dict, message: str, 
                              message_type: str, message_data: Dict) -> str:
        """Handle initial contact from user"""
        # Advance to next step and handle it immediately
        self._update_application_step(application["id"], STEPS["initial_contact"])
        return self._handle_confirm_intent(application, message, message_type, message_data)
    
    def _handle_confirm_intent(self, application: Dict, message: str, 
                             message_type: str, message_data: Dict) -> str:
        """Confirm if the user intends to apply for a job"""
        gemini_response = self._call_gemini("confirm_intent", message)
        
        if "error" in gemini_response:
            return "I'm having trouble understanding. Could you please clarify if you're interested in applying for a job with us?"
        
        if gemini_response.get("intent_confirmed", False):
            # Update application status and proceed to next step
            self._update_application_step(application["id"], STEPS["confirm_intent"])
            return "Great! To proceed with your job application, please upload your resume or CV. You can send it as a document or paste it as text."
        else:
            # User doesn't intend to apply, stay in the same step
            return gemini_response.get("response", "I'm not sure if you're looking to apply for a job. Please let me know if you'd like to start the application process.")
    
    def _handle_commitment_check(self, application: Dict, message: str, 
                          message_type: str, message_data: Dict) -> str:
        """Handle commitment period check step"""
        gemini_response = self._call_gemini("commitment_check", message)
        
        if "error" in gemini_response:
            return "I'm having trouble understanding your commitment period. Could you clearly state how long you can commit to this position? We require a minimum of 1 month."
        
        commitment_sufficient = gemini_response.get("commitment_sufficient", False)
        
        if commitment_sufficient:
            # Update application and proceed to next step
            self._update_application_step(
                application["id"], 
                STEPS["commitment_check"],
                {"commitment_step": True}
            )
            return f"Thank you! Your commitment period works for us. The next step is to complete our application form. Please fill out this form: {GOOGLE_FORM_LINK}\n\nOnce you've completed the form, please send a message here saying 'form completed'."
        else:
            # Reject application due to insufficient commitment
            self._update_application_step(
                application["id"],
                "rejected",
                {"status": "rejected", "red_flags": 1, "red_flag_reasons": json.dumps(["Insufficient commitment period"])}
            )
            return "Thank you for your interest. Unfortunately, we require a minimum commitment period of 1 month for this position. If your availability changes in the future, you're welcome to apply again."
    
    def _handle_request_resume(self, application: Dict, message: str, 
                             message_type: str, message_data: Dict) -> str:
        """Handle resume upload step"""
        # Check for maximum attempts
        attempts = application.get("attempts_counter", 0)
        
        if attempts >= 5:
            self._update_application_step(application["id"], "ignored", {"status": "abandoned"})
            return "We haven't received your resume after multiple attempts. Your application has been paused. Feel free to start again when you're ready."
        
        # Process uploaded file or text
        file_url = None
        if message_type in ["document", "image"]:
            # Get media ID and download file
            media_id = message_data.get(message_type, {}).get("id")
            if media_id:
                # In a real implementation, download and save the file to storage
                file_url = f"https://example.com/files/{media_id}"  # Placeholder
        
        # Call Gemini to evaluate the resume submission
        gemini_response = self._call_gemini("request_resume", message)
        
        if "error" in gemini_response:
            self._increment_attempt_counter(application["id"])
            return "I'm having trouble processing your resume. Please try uploading it again as a document (PDF, DOC, or DOCX)."
        
        if gemini_response.get("resume_received", False):
            # Update application and proceed to next step
            self._update_application_step(
                application["id"], 
                STEPS["request_resume"],
                {"resume_step": True, "resume_url": file_url}
            )
            # Changed response to ask for commitment period
            return "Thank you for submitting your resume! Before proceeding, could you please let us know your commitment period for this position? We require a minimum of 1 month."
                
        elif gemini_response.get("needs_guidance", False):
            # User doesn't have a resume
            return "I understand you might not have a resume ready. That's okay! Instead, please provide a brief summary of your work experience, education, and skills in a message, and we'll use that information for your application."
            
        else:
            # Increment attempts and ask again
            new_count = self._increment_attempt_counter(application["id"])
            remaining = 5 - new_count
            
            return f"I don't see a resume attached. Please upload your resume as a document (PDF, DOC, or DOCX) or paste it as text. {remaining} attempts remaining."
    
    def _handle_request_form(self, application: Dict, message: str, 
                           message_type: str, message_data: Dict) -> str:
        """Handle Google Form completion step"""
        # Simple check for form completion message
        form_completed = False
        if re.search(r"form\s+(is\s+)?completed|completed(\s+the)?\s+form", message.lower()):
            form_completed = True
        
        if form_completed:
            # Update application status and proceed to next step
            self._update_application_step(
                application["id"],
                STEPS["request_form"],
                {"form_step": True}
            )
            return "Thank you for completing the form! Your application is now under review. We'll get back to you soon with next steps."
        else:
            # Remind about the form
            return f"Please complete our application form at {GOOGLE_FORM_LINK} and let me know when you're done by replying with 'form completed'."
    
    def _handle_waiting_review(self, application: Dict, message: str, 
                             message_type: str, message_data: Dict) -> str:
        """Handle waiting for external review"""
        # This step is managed by webhook, but we should respond to user inquiries
        return "Your application is currently under review. We'll notify you as soon as a decision is made. Thank you for your patience!"
    
    def _handle_schedule_interview(self, application: Dict, message: str, 
                                 message_type: str, message_data: Dict) -> str:
        """Handle interview scheduling step"""
        gemini_response = self._call_gemini("schedule_interview", message)
        
        if "error" in gemini_response:
            return "I'm having trouble processing your information. Could you please provide your full name and NRIC number clearly? This is required for office access."
        
        name_provided = gemini_response.get("name_provided", False)
        nric_provided = gemini_response.get("nric_provided", False)
        calendly_confirmed = gemini_response.get("calendly_confirmed", False)
        
        # Extract name and NRIC if provided
        extracted_name = gemini_response.get("name", "")
        extracted_nric = gemini_response.get("nric", "")
        
        # Mask NRIC for security (keep only first and last characters)
        masked_nric = ""
        if extracted_nric and len(extracted_nric) > 2:
            masked_nric = extracted_nric[0] + "*" * (len(extracted_nric) - 2) + extracted_nric[-1]
        
        # Update application with name and NRIC if provided
        update_data = {}
        if name_provided and extracted_name:
            update_data["name"] = extracted_name
        
        if nric_provided and extracted_nric:
            update_data["nric"] = extracted_nric
        
        if calendly_confirmed:
            update_data["interview_confirmation"] = True
        
        if update_data:
            self.db.table("applications").update(update_data).eq("id", application["id"]).execute()
        
        # Check if all information is provided
        if name_provided and nric_provided and calendly_confirmed:
            # All information received, move to next step
            self._update_application_step(
                application["id"],
                STEPS["schedule_interview"],
                {"calendar_step": True, "pass_step": True}
            )
            return "Thank you! We've received your full name, NRIC, and interview booking confirmation. Your visitor pass will be ready when you arrive. We look forward to meeting you for the interview!"
        
        # Determine what information is still needed
        missing_info = []
        if not name_provided:
            missing_info.append("full name")
        if not nric_provided:
            missing_info.append("NRIC number")
        if not calendly_confirmed:
            missing_info.append("calendar booking confirmation")
        
        missing_text = " and ".join(missing_info)
        
        # Construct appropriate response
        if not name_provided and not nric_provided and not calendly_confirmed:
            # First message in this step
            return f"We're pleased to inform you that your application has been reviewed and we'd like to invite you for an interview!\n\nPlease:\n\n1) Book your interview slot using this link: {CALENDLY_LINK}\n\n2) Provide your full name and NRIC number for visitor access\n\n{OFFICE_DIRECTIONS}"
        else:
            return f"Thank you! We still need your {missing_text}. This information is required to prepare for your interview."
    
    def _handle_confirmation(self, application: Dict, message: str, 
                           message_type: str, message_data: Dict) -> str:
        """Handle final confirmation step"""
        # This is the final step, update application status
        self._update_application_step(
            application["id"],
            STEPS["confirmation"],
            {"status": "interview_scheduled"}
        )
        return "Thank you! We have all the information we need for now. We look forward to meeting you for your interview. If you have any questions before then, feel free to ask."
    
    def _handle_unknown_step(self, application: Dict, message: str, 
                           message_type: str, message_data: Dict) -> str:
        """Handle unknown application step"""
        logger.error(f"Unknown application step: {application.get('current_step')}")
        return "I'm sorry, there seems to be an issue with your application status. Our team will contact you shortly to resolve this."
    
    def handle_webhook(self, webhook_data: Dict) -> None:
        """Process incoming webhook from external review system"""
        try:
            application_id = webhook_data.get("application_id")
            if not application_id:
                logger.error("Webhook missing application_id")
                return
            
            # Record the webhook event
            self.db.table("webhook_events").insert({
                "application_id": application_id,
                "event_type": webhook_data.get("event_type", "unknown"),
                "event_data": webhook_data,
            }).execute()
            
            # Process based on event type
            event_type = webhook_data.get("event_type")
            
            if event_type == "application_review":
                decision = webhook_data.get("decision", "").lower()
                
                if decision == "approved":
                    # Move to interview scheduling
                    app_result = self.db.table("applications").select("phone_number").eq("id", application_id).execute()
                    if app_result.data:
                        phone_number = app_result.data[0]["phone_number"]
                        
                        # Update application status
                        self._update_application_step(
                            application_id,
                            "schedule_interview",
                            {"status": "interview_pending"}
                        )
                        
                        # Send message to user
                        message = f"We're pleased to inform you that your application has been reviewed and we'd like to invite you for an interview!\n\nPlease:\n\n1) Book your interview slot using this link: {CALENDLY_LINK}\n\n2) Provide your full name and NRIC number for visitor access\n\n{OFFICE_DIRECTIONS}"
                        messenger.send_message(message, phone_number)
                        
                elif decision == "rejected":
                    # Send rejection message
                    app_result = self.db.table("applications").select("phone_number").eq("id", application_id).execute()
                    if app_result.data:
                        phone_number = app_result.data[0]["phone_number"]
                        
                        # Update application status
                        self.db.table("applications").update({
                            "status": "rejected"
                        }).eq("id", application_id).execute()
                        
                        # Send message to user
                        message = "Thank you for your interest in our company. After careful consideration, we regret to inform you that we will not be proceeding with your application at this time. We appreciate your time and wish you the best in your job search."
                        messenger.send_message(message, phone_number)
            
        except Exception as e:
            logger.error(f"Error processing webhook: {e}")


# Initialize the bot
application_bot = ApplicationBot(supabase_client)

@app.route('/webhook', methods=['GET'])
def verify_webhook():
    print(request.args)
    """Verify webhook for WhatsApp API setup"""
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    
    if mode and token:
        if mode == 'subscribe' and token == VERIFY_TOKEN:
            return challenge
        else:
            return Response(status=403)
    return Response(status=404)

@app.route('/webhook', methods=['POST'])
def webhook():
    """Handle incoming webhook events from WhatsApp"""
    data = request.get_json()
    
    try:
        # Check if this is a message notification
        if data.get('object') == 'whatsapp_business_account':
            entries = data.get('entry', [])
            for entry in entries:
                for change in entry.get('changes', []):
                    if change.get('field') == 'messages':
                        value = change.get('value', {})
                        messages = value.get('messages', [])
                        
                        for message in messages:
                            # Get sender ID (phone number)
                            sender_id = message.get('from')
                            
                            # Get message data
                            message_data = {}
                            if 'text' in message:
                                message_data['text'] = message.get('text', {})
                            elif 'document' in message:
                                message_data['document'] = message.get('document', {})
                            elif 'image' in message:
                                message_data['image'] = message.get('image', {})
                            
                            # Process message and send response
                            if sender_id and message_data:
                                response = application_bot.process_message(sender_id, message_data)
                                messenger.send_message(response, sender_id)
        
        return Response(status=200)
    except Exception as e:
        logger.error(f"Error in webhook: {e}")
        return Response(status=500)

@app.route('/external-webhook', methods=['POST'])
def external_webhook():
    """Handle incoming webhook events from the external review system"""
    data = request.get_json()
    
    try:
        application_bot.handle_webhook(data)
        return Response(status=200)
    except Exception as e:
        logger.error(f"Error in external webhook: {e}")
        return Response(status=500)

# Add a health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "timestamp": datetime.datetime.now().isoformat(),
        "version": "1.0.0"
    })

if __name__ == '__main__':
    # Use Waitress for Windows compatibility instead of Gunicorn
    print("Starting server on http://127.0.0.1:5000")
    print("Available endpoints:")
    print("  - /           : Root endpoint (returns status message)")
    print("  - /health     : Health check endpoint")
    print("  - /webhook    : WhatsApp webhook endpoint")
    print("  - /external-webhook : External review system webhook endpoint")
    serve(app, host='127.0.0.1', port=5000, threads=4)