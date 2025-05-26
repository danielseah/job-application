import os
import re
import json
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any
import logging

from telegram import Update, Bot
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
import google.generativeai as genai
from supabase import create_client, Client
import aiohttp

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from dotenv import load_dotenv
load_dotenv()
# Configuration
TELEGRAM_BOT_TOKEN = "7618552877:AAENVNLLzNJ0y2ajgOwmnmO3PB1UE-xUTw4"
SUPABASE_URL = "https://hdsagbwckuasyusktpxo.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhkc2FnYndja3Vhc3l1c2t0cHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MDE1NzAsImV4cCI6MjA2MzQ3NzU3MH0.PlCqT93jRkmC5PJkfHVevnxeKJM-TeYq-vAz74M5rJc"
GEMINI_API_KEY = "AIzaSyB8-_6TBv9Aeg0HeDP2xUWw1lBkRXW_CVk"
GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeEttFBcOsTwRNrycwvit7CxtUt2xVSJToilxXyE0uaX9hVgA/viewform?usp=dialog"
CALENDLY_URL = "https://calendly.com/mabel-choi/30min"

# Initialize clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
genai.configure(api_key=GEMINI_API_KEY)

# Gemini model configurations for each step
GEMINI_CONFIGS = {
    1: {  # Intent confirmation
        "model": genai.GenerativeModel('gemini-1.5-flash'),
        "generation_config": {
            "temperature": 0.3,
            "response_mime_type": "application/json"
        }
    },
    2: {  # Resume upload
        "model": genai.GenerativeModel('gemini-1.5-flash'),
        "generation_config": {
            "temperature": 0.3,
            "response_mime_type": "application/json"
        }
    },
    3: {  # Form confirmation
        "model": genai.GenerativeModel('gemini-1.5-flash'),
        "generation_config": {
            "temperature": 0.3,
            "response_mime_type": "application/json"
        }
    },
    5: {  # Interview scheduling
        "model": genai.GenerativeModel('gemini-1.5-flash'),
        "generation_config": {
            "temperature": 0.3,
            "response_mime_type": "application/json"
        }
    }
}

class JobApplicationBot:
    def __init__(self):
        self.application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
        
    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /start command"""
        user_id = update.effective_user.id
        chat_id = update.effective_chat.id
        username = update.effective_user.username
        
        # Check if user already has an application
        existing_app = supabase.table("applications").select("*").eq("telegram_user_id", user_id).execute()
        
        if existing_app.data:
            await update.message.reply_text(
                "Welcome back! You already have an application in progress. "
                "Type anything to continue where you left off."
            )
        else:
            # Create new application
            new_app = supabase.table("applications").insert({
                "telegram_user_id": user_id,
                "telegram_chat_id": chat_id,
                "telegram_username": username,
                "current_step": 1,
                "status": "intent_checking"
            }).execute()
            
            await update.message.reply_text(
                "Welcome to our job application process! 👋\n\n"
                "I'm here to help you apply for a position with us. "
                "Are you interested in applying for a job?"
            )
            
    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Main message handler that routes to appropriate step handler"""
        user_id = update.effective_user.id
        message = update.message
        
        # Get user's application
        app_result = supabase.table("applications").select("*").eq("telegram_user_id", user_id).execute()
        
        if not app_result.data:
            await message.reply_text(
                "Please start the application process by typing /start"
            )
            return
            
        application = app_result.data[0]
        current_step = application["current_step"]
        
        # Log incoming message
        await self.log_message(application["id"], user_id, message, "inbound")
        
        # Route to appropriate handler
        if current_step == 1:
            await self.handle_step1_intent(update, context, application)
        elif current_step == 2:
            await self.handle_step2_resume(update, context, application)
        elif current_step == 3:
            await self.handle_step3_form(update, context, application)
        elif current_step == 4:
            await self.handle_step4_review(update, context, application)
        elif current_step == 5:
            await self.handle_step5_interview(update, context, application)
        elif current_step == 6:
            await self.handle_step6_complete(update, context, application)
            
    async def handle_step1_intent(self, update: Update, context: ContextTypes.DEFAULT_TYPE, application: Dict):
        """Step 1: Confirm user intent to apply for job"""
        message = update.message
        user_input = message.text
        
        # Get Gemini configuration
        gemini_config = await self.get_gemini_config(1)
        model = GEMINI_CONFIGS[1]["model"]
        
        # Create prompt for Gemini
        prompt = f"""
        {gemini_config['system_prompt']}
        
        User message: "{user_input}"
        
        Analyze if the user wants to apply for a job. Look for keywords like:
        - apply, application, job, position, work, interested, yes, want to
        - Or negative keywords like: no, not interested, maybe later, bye
        
        Response format: {json.dumps(gemini_config['response_schema'])}
        """
        
        try:
            # Get Gemini response
            response = model.generate_content(
                prompt,
                generation_config=GEMINI_CONFIGS[1]["generation_config"]
            )
            
            gemini_response = json.loads(response.text)
            
            # Log Gemini interaction
            await self.log_gemini_interaction(
                application["id"], 1, prompt, gemini_response, message.message_id
            )
            
            # Process based on intent
            if gemini_response["intent"] == "apply_job":
                # Update application
                supabase.table("applications").update({
                    "intent_confirmed": True,
                    "current_step": 2,
                    "status": "resume_upload"
                }).eq("id", application["id"]).execute()
                
                # Send response
                await message.reply_text(
                    "Great! I'm excited to help you with your application. 🎯\n\n"
                    "The next step is to upload your resume. Please send me your resume as a PDF, "
                    "Word document, or image file."
                )
                
            elif gemini_response["intent"] == "not_interested":
                # Mark as abandoned
                supabase.table("applications").update({
                    "status": "abandoned"
                }).eq("id", application["id"]).execute()
                
                await message.reply_text(gemini_response["response_message"])
                
            else:  # unclear
                await message.reply_text(
                    "I'm not sure if you want to apply for a job. "
                    "Could you please clarify? Just say 'yes' if you'd like to apply, "
                    "or 'no' if you're not interested right now."
                )
                
        except Exception as e:
            logger.error(f"Error in step 1: {e}")
            await message.reply_text(
                "I'm having trouble understanding. Are you interested in applying for a job? "
                "Please reply with 'yes' or 'no'."
            )
            
    async def handle_step2_resume(self, update: Update, context: ContextTypes.DEFAULT_TYPE, application: Dict):
        """Step 2: Handle resume upload"""
        message = update.message
        retry_count = application.get("retry_count", 0)
        
        # Check if it's a document
        has_document = message.document is not None
        has_photo = message.photo is not None
        has_file = has_document or has_photo
        
        # Get Gemini configuration
        gemini_config = await self.get_gemini_config(2)
        model = GEMINI_CONFIGS[2]["model"]
        
        # Create prompt
        user_input = message.text if message.text else "[User sent a file]"
        prompt = f"""
        {gemini_config['system_prompt']}
        
        User input: "{user_input}"
        Has file attached: {has_file}
        File type: {"document" if has_document else "photo" if has_photo else "none"}
        Retry count: {retry_count}/5
        
        Determine the appropriate action:
        - If file is attached, action should be "resume_received"
        - If user says they don't have a resume or asks what it is, action should be "no_resume_help"
        - If user is off-topic or refusing after multiple tries, action should be "off_topic"
        - Otherwise, action should be "request_resume"
        
        Response format: {json.dumps(gemini_config['response_schema'])}
        """
        
        try:
            response = model.generate_content(
                prompt,
                generation_config=GEMINI_CONFIGS[2]["generation_config"]
            )
            
            gemini_response = json.loads(response.text)
            
            if has_file and gemini_response["action"] == "resume_received":
                # Process the file
                file_id = None
                file_name = None
                
                if has_document:
                    file_id = message.document.file_id
                    file_name = message.document.file_name
                elif has_photo:
                    file_id = message.photo[-1].file_id  # Get highest resolution
                    file_name = f"resume_photo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
                
                # Update application
                supabase.table("applications").update({
                    "resume_file_id": file_id,
                    "resume_file_name": file_name,
                    "resume_uploaded_at": datetime.now().isoformat(),
                    "resume_step": True,
                    "current_step": 3,
                    "status": "form_filling",
                    "retry_count": 0
                }).eq("id", application["id"]).execute()
                
                # Send next step
                await message.reply_text(
                    "Perfect! I've received your resume. ✅\n\n"
                    "Now, please fill out this Google Form with additional information:\n"
                    f"{GOOGLE_FORM_URL}\n\n"
                    "Once you've completed the form, just send me a message saying 'done' or 'completed'."
                )
                
            elif gemini_response["action"] == "no_resume_help":
                await message.reply_text(
                    "No worries! A resume (or CV) is a document that summarizes your:\n"
                    "• Work experience\n"
                    "• Education\n"
                    "• Skills\n"
                    "• Contact information\n\n"
                    "If you don't have one ready, you can:\n"
                    "1. Create a simple one using Google Docs or Microsoft Word\n"
                    "2. Take a clear photo of a printed resume\n"
                    "3. Send me a message with your work history and I'll help guide you\n\n"
                    "What would you like to do?"
                )
                
            elif retry_count >= 5:
                # Too many retries
                supabase.table("applications").update({
                    "status": "abandoned",
                    "red_flags": application.get("red_flags", 0) + 1,
                    "red_flag_reasons": application.get("red_flag_reasons", []) + ["refused_resume_upload"]
                }).eq("id", application["id"]).execute()
                
                await message.reply_text(
                    "I understand you might not be ready to share your resume at this time. "
                    "Feel free to come back when you're ready to continue the application process. "
                    "Have a great day!"
                )
                
            else:
                # Increment retry count
                supabase.table("applications").update({
                    "retry_count": retry_count + 1
                }).eq("id", application["id"]).execute()
                
                await message.reply_text(gemini_response["response_message"])
                
        except Exception as e:
            logger.error(f"Error in step 2: {e}")
            await message.reply_text(
                "Please upload your resume as a PDF, Word document, or image file."
            )
            
    async def handle_step3_form(self, update: Update, context: ContextTypes.DEFAULT_TYPE, application: Dict):
        """Step 3: Confirm form completion"""
        message = update.message
        user_input = message.text.lower()
        
        # Get Gemini configuration
        gemini_config = await self.get_gemini_config(3)
        model = GEMINI_CONFIGS[3]["model"]
        
        prompt = f"""
        {gemini_config['system_prompt']}
        
        User message: "{user_input}"
        
        Check if the user is confirming they completed the Google Form.
        Look for words like: done, completed, finished, submitted, yes, filled
        
        Response format: {json.dumps(gemini_config['response_schema'])}
        """
        
        try:
            response = model.generate_content(
                prompt,
                generation_config=GEMINI_CONFIGS[3]["generation_config"]
            )
            
            gemini_response = json.loads(response.text)
            
            if gemini_response["form_completed"]:
                # Update application
                supabase.table("applications").update({
                    "form_step": True,
                    "current_step": 4,
                    "status": "review"
                }).eq("id", application["id"]).execute()
                
                await message.reply_text(
                    "Thank you for completing the form! 📋\n\n"
                    "Your application is now under review. We'll get back to you soon with the results. "
                    "This usually takes 1-2 business days.\n\n"
                    "I'll notify you here once we have an update!"
                )
                
            else:
                await message.reply_text(
                    f"Please complete the Google Form first:\n{GOOGLE_FORM_URL}\n\n"
                    "Once you're done, just let me know by saying 'done' or 'completed'."
                )
                
        except Exception as e:
            logger.error(f"Error in step 3: {e}")
            await message.reply_text(
                "Are you done filling out the form? Please reply with 'yes' or 'done' when completed."
            )
            
    async def handle_step4_review(self, update: Update, context: ContextTypes.DEFAULT_TYPE, application: Dict):
        """Step 4: Waiting for review - no user interaction needed"""
        message = update.message
        
        await message.reply_text(
            "Your application is currently under review. 🔍\n\n"
            "I'll notify you as soon as we have an update. "
            "Thank you for your patience!"
        )
        
    async def handle_step5_interview(self, update: Update, context: ContextTypes.DEFAULT_TYPE, application: Dict):
        """Step 5: Schedule interview and collect details"""
        message = update.message
        user_input = message.text
        
        # Get Gemini configuration
        gemini_config = await self.get_gemini_config(5)
        model = GEMINI_CONFIGS[5]["model"]
        
        # Check what we still need
        has_name = application.get("full_name") is not None
        has_nric = application.get("nric_last_4") is not None
        has_calendly = application.get("interview_scheduled", False)
        
        prompt = f"""
        {gemini_config['system_prompt']}
        
        User message: "{user_input}"
        Current status:
        - Has provided full name: {has_name}
        - Has provided NRIC: {has_nric}
        - Has confirmed Calendly booking: {has_calendly}
        
        Extract:
        1. Full name (if mentioned)
        2. NRIC (look for Singapore NRIC pattern: letter + 7 digits + letter, we only need last 4 chars)
        3. Confirmation of Calendly booking (words like: booked, scheduled, done, confirmed)
        
        NRIC validation: Singapore NRIC should match pattern [STFG]\\d{{7}}[A-Z]
        
        Response format: {json.dumps(gemini_config['response_schema'])}
        """
        
        try:
            response = model.generate_content(
                prompt,
                generation_config=GEMINI_CONFIGS[5]["generation_config"]
            )
            
            gemini_response = json.loads(response.text)
            
            # Update what we received
            updates = {}
            
            if gemini_response.get("full_name") and not has_name:
                updates["full_name"] = gemini_response["full_name"]
                
            if gemini_response.get("has_nric") and gemini_response.get("nric_valid") and not has_nric:
                # Extract last 4 digits of NRIC using regex
                nric_pattern = r'[STFG]\d{7}[A-Z]'
                nric_match = re.search(nric_pattern, user_input.upper())
                if nric_match:
                    nric_last_4 = nric_match.group()[-4:]
                    updates["nric_last_4"] = nric_last_4
                    
            if gemini_response.get("calendly_confirmed") and not has_calendly:
                updates["interview_scheduled"] = True
                
            # Update database if we have new info
            if updates:
                supabase.table("applications").update(updates).eq("id", application["id"]).execute()
                
            # Check what's still missing
            updated_app = supabase.table("applications").select("*").eq("id", application["id"]).execute()
            app_data = updated_app.data[0]
            
            still_needs = []
            if not app_data.get("full_name"):
                still_needs.append("full name")
            if not app_data.get("nric_last_4"):
                still_needs.append("NRIC")
            if not app_data.get("interview_scheduled"):
                still_needs.append("Calendly booking confirmation")
                
            if still_needs:
                # Still missing information
                missing_text = ", ".join(still_needs)
                await message.reply_text(
                    f"Thank you! I still need the following information:\n\n"
                    f"• {missing_text}\n\n"
                    "Please provide the missing details."
                )
            else:
                # All information collected
                supabase.table("applications").update({
                    "pass_details_received": True,
                    "current_step": 6,
                    "status": "completed"
                }).eq("id", application["id"]).execute()
                
                await message.reply_text(
                    "Perfect! I have all the information I need. ✅\n\n"
                    f"Your interview is scheduled, and a visitor pass will be generated for {app_data['full_name']}.\n\n"
                    "We'll send you a reminder 1 day before your interview. "
                    "Thank you for completing the application process, and we look forward to meeting you!\n\n"
                    "If you have any questions, feel free to ask. Good luck! 🍀"
                )
                
        except Exception as e:
            logger.error(f"Error in step 5: {e}")
            
            # Send initial message if first time
            if not has_name and not has_nric and not has_calendly:
                # Get office info
                office_info = supabase.table("office_info").select("*").limit(1).execute()
                office = office_info.data[0] if office_info.data else {}
                
                await message.reply_text(
                    "Great news! Your application has been approved! 🎉\n\n"
                    "To schedule your interview, please:\n\n"
                    f"1. Book a time slot here: {CALENDLY_URL}\n\n"
                    "2. Provide your full name (as per NRIC/passport)\n\n"
                    "3. Provide your NRIC number (for visitor pass generation)\n\n"
                    f"📍 **Office Location:**\n{office.get('address', 'Address will be provided')}\n\n"
                    f"🚇 **Directions:**\n{office.get('directions', 'Directions will be provided')}\n\n"
                    "Please send me all this information in your next message."
                )
            else:
                await message.reply_text(
                    "I couldn't process that. Please make sure to include:\n"
                    "• Your full name\n"
                    "• Your NRIC\n"
                    "• Confirmation that you've booked a Calendly slot"
                )
                
    async def handle_step6_complete(self, update: Update, context: ContextTypes.DEFAULT_TYPE, application: Dict):
        """Step 6: Application complete"""
        message = update.message
        
        await message.reply_text(
            "Your application is complete! 🎊\n\n"
            "You should receive an email confirmation shortly. "
            "We'll see you at your scheduled interview.\n\n"
            "If you need to reschedule or have any questions, please contact our HR team directly."
        )
        
    async def handle_webhook(self, request_data: Dict[str, Any]):
        """Handle webhook from external review system"""
        try:
            # Validate webhook data
            application_id = request_data.get("application_id")
            action = request_data.get("action")  # "accepted" or "rejected"
            reason = request_data.get("reason", "")
            
            if not application_id or action not in ["accepted", "rejected"]:
                logger.error(f"Invalid webhook data: {request_data}")
                return {"status": "error", "message": "Invalid data"}
                
            # Log webhook
            supabase.table("webhook_logs").insert({
                "application_id": application_id,
                "webhook_type": f"application_{action}",
                "payload": request_data,
                "processed": False
            }).execute()
            
            # Get application
            app_result = supabase.table("applications").select("*").eq("id", application_id).execute()
            if not app_result.data:
                return {"status": "error", "message": "Application not found"}
                
            application = app_result.data[0]
            
            # Process based on action
            if action == "accepted":
                # Update to interview scheduling step
                supabase.table("applications").update({
                    "webhook_received": True,
                    "current_step": 5,
                    "status": "interview_scheduling"
                }).eq("id", application_id).execute()
                
                # Get office info
                office_info = supabase.table("office_info").select("*").limit(1).execute()
                office = office_info.data[0] if office_info.data else {}
                
                # Send message to user
                bot = Bot(token=TELEGRAM_BOT_TOKEN)
                await bot.send_message(
                    chat_id=application["telegram_chat_id"],
                    text=(
                        "Great news! Your application has been approved! 🎉\n\n"
                        "To schedule your interview, please:\n\n"
                        f"1. Book a time slot here: {CALENDLY_URL}\n\n"
                        "2. Provide your full name (as per NRIC/passport)\n\n"
                        "3. Provide your NRIC number (for visitor pass generation)\n\n"
                        f"📍 **Office Location:**\n{office.get('address', 'Address will be provided')}\n\n"
                        f"🚇 **Directions:**\n{office.get('directions', 'Directions will be provided')}\n\n"
                        "Please send me all this information in your next message."
                    ),
                    parse_mode="Markdown"
                )
                
            else:  # rejected
                # Update application status
                supabase.table("applications").update({
                    "webhook_received": True,
                    "status": "rejected",
                    "rejection_reason": reason
                }).eq("id", application_id).execute()
                
                # Send message to user
                bot = Bot(token=TELEGRAM_BOT_TOKEN)
                await bot.send_message(
                    chat_id=application["telegram_chat_id"],
                    text=(
                        "Thank you for your interest in joining our team.\n\n"
                        "After careful review, we've decided not to move forward with your application at this time. "
                        "We encourage you to apply again in the future as new positions become available.\n\n"
                        "We wish you the best in your job search! 🙏"
                    )
                )
                
            # Mark webhook as processed
            supabase.table("webhook_logs").update({
                "processed": True,
                "processed_at": datetime.now().isoformat()
            }).eq("application_id", application_id).eq("processed", False).execute()
            
            return {"status": "success", "message": "Webhook processed"}
            
        except Exception as e:
            logger.error(f"Webhook processing error: {e}")
            return {"status": "error", "message": str(e)}
            
    async def log_message(self, application_id: str, user_id: int, message, direction: str):
        """Log message to database"""
        try:
            message_data = {
                "application_id": application_id,
                "telegram_user_id": user_id,
                "telegram_message_id": message.message_id if hasattr(message, 'message_id') else None,
                "direction": direction,
                "message_type": "text",
                "message_text": None,
                "file_id": None,
                "file_name": None,
                "file_size": None
            }
            
            if hasattr(message, 'text') and message.text:
                message_data["message_text"] = message.text
                message_data["message_type"] = "text"
            elif hasattr(message, 'document') and message.document:
                message_data["message_type"] = "document"
                message_data["file_id"] = message.document.file_id
                message_data["file_name"] = message.document.file_name
                message_data["file_size"] = message.document.file_size
            elif hasattr(message, 'photo') and message.photo:
                message_data["message_type"] = "photo"
                message_data["file_id"] = message.photo[-1].file_id
                
            supabase.table("messages").insert(message_data).execute()
            
        except Exception as e:
            logger.error(f"Error logging message: {e}")
            
    async def log_gemini_interaction(self, application_id: str, step: int, prompt: str, response: Dict, message_id: int):
        """Log Gemini model interaction"""
        try:
            supabase.table("messages").update({
                "gemini_model": f"gemini-1.5-flash-step{step}",
                "gemini_prompt": prompt,
                "gemini_response": response,
                "step_number": step,
                "is_valid_response": True
            }).eq("application_id", application_id).eq("telegram_message_id", message_id).execute()
            
        except Exception as e:
            logger.error(f"Error logging Gemini interaction: {e}")
            
    async def get_gemini_config(self, step: int) -> Dict:
        """Get Gemini configuration for a specific step"""
        result = supabase.table("gemini_configs").select("*").eq("step_number", step).execute()
        return result.data[0] if result.data else {}
        
    def setup_handlers(self):
        """Setup command and message handlers"""
        self.application.add_handler(CommandHandler("start", self.start))
        self.application.add_handler(MessageHandler(
            filters.TEXT | filters.Document.ALL | filters.PHOTO, 
            self.handle_message
        ))
        
    def run(self):
        """Run the bot"""
        self.setup_handlers()
        self.application.run_polling()
        

# FastAPI webhook endpoint (separate file)
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse

app = FastAPI()

@app.post("/webhook/application-review")
async def handle_review_webhook(request: Request):
    """Handle webhook from external review system"""
    try:
        data = await request.json()
        bot = JobApplicationBot()
        result = await bot.handle_webhook(data)
        return JSONResponse(content=result)
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/")
async def root():
    """Root endpoint to check if the server is running"""
    return {"message": "Job Application Bot is running!"}

# Main execution
if __name__ == "__main__":
    bot = JobApplicationBot()
    bot.run()