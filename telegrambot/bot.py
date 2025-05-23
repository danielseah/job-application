import logging
import os
import re
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, ConversationHandler

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Get bot token from environment variable or replace with your actual token
BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '7618552877:AAENVNLLzNJ0y2ajgOwmnmO3PB1UE-xUTw4')

# Form link - replace with your actual form URL
FORM_LINK = "https://docs.google.com/forms/d/e/1FAIpQLSeEttFBcOsTwRNrycwvit7CxtUt2xVSJToilxXyE0uaX9hVgA/viewform?usp=dialog"

# Conversation states
WAITING_FOR_RESUME, WAITING_FOR_COMMITMENT = range(2)

# Keywords that trigger the application process
TRIGGER_KEYWORDS = ["airline house", "apply", "application", "job", "hiring", "career"]

def contains_trigger_keywords(text):
    """Check if message contains any trigger keywords"""
    text_lower = text.lower()
    return any(keyword in text_lower for keyword in TRIGGER_KEYWORDS)

def parse_commitment_period(text):
    """Parse commitment period from text and return duration in months"""
    text_lower = text.lower()
    
    # Look for patterns like "1 month", "2 months", "3 years", etc.
    month_patterns = [
        r'(\d+)\s*months?',
        r'(\d+)\s*mths?',
        r'(\d+)\s*mo\b'
    ]
    
    year_patterns = [
        r'(\d+)\s*years?',
        r'(\d+)\s*yrs?'
    ]
    
    # Check for month patterns
    for pattern in month_patterns:
        match = re.search(pattern, text_lower)
        if match:
            months = int(match.group(1))
            return months
    
    # Check for year patterns
    for pattern in year_patterns:
        match = re.search(pattern, text_lower)
        if match:
            years = int(match.group(1))
            return years * 12  # Convert to months
    
    # Check for specific phrases
    if "no commitment" in text_lower or "flexible" in text_lower:
        return 0
    
    return None

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /start is issued."""
    await update.message.reply_text(
        "Hello! I'm the CPO Pte. Ltd. job application bot. "
        "Send me a message with keywords like 'AIRLINE HOUSE' or 'apply' to start your application process."
    )

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle incoming messages and check for trigger keywords"""
    text = update.message.text
    
    if contains_trigger_keywords(text):
        await update.message.reply_text(
            "Thank you for contacting CPO Pte. Ltd! Please share with us your resume. "
            "We accept PDF, JPG, JPEG, or PNG files. If you don't have a resume, please type 'no resume'."
        )
        return WAITING_FOR_RESUME
    else:
        await update.message.reply_text(
            "Hello! To start your job application, please include keywords like 'AIRLINE HOUSE' or 'apply' in your message."
        )
        return ConversationHandler.END

async def handle_resume(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle resume submission"""
    
    # Check if user says they don't have a resume
    if update.message.text and "no resume" in update.message.text.lower():
        await update.message.reply_text(
            "Thank you for letting us know. Now, please tell us your commitment period. "
            "How long are you willing to commit to this position? (minimum 1 month required)"
        )
        return WAITING_FOR_COMMITMENT
    
    # Check if a document was sent
    if update.message.document:
        file_name = update.message.document.file_name
        if file_name:
            file_extension = file_name.lower().split('.')[-1]
            
            if file_extension in ['pdf', 'jpg', 'jpeg', 'png']:
                await update.message.reply_text(
                    f"Great! I've received your resume ({file_name}). "
                    "Now, please tell us your commitment period. "
                    "How long are you willing to commit to this position? (minimum 1 month required)"
                )
                return WAITING_FOR_COMMITMENT
            else:
                await update.message.reply_text(
                    f"Sorry, the file format '.{file_extension}' is not accepted. "
                    "Please send your resume as a PDF, JPG, JPEG, or PNG file, or type 'no resume' if you don't have one."
                )
                return WAITING_FOR_RESUME
    
    # Check if a photo was sent
    elif update.message.photo:
        await update.message.reply_text(
            "Great! I've received your resume image. "
            "Now, please tell us your commitment period. "
            "How long are you willing to commit to this position? (minimum 1 month required)"
        )
        return WAITING_FOR_COMMITMENT
    
    # If neither document nor photo nor "no resume" text
    else:
        await update.message.reply_text(
            "Please send your resume as a file (PDF, JPG, JPEG, PNG) or type 'no resume' if you don't have one."
        )
        return WAITING_FOR_RESUME

async def handle_commitment(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle commitment period submission"""
    text = update.message.text
    
    if not text:
        await update.message.reply_text(
            "Please tell us your commitment period in text. How long are you willing to commit to this position?"
        )
        return WAITING_FOR_COMMITMENT
    
    commitment_months = parse_commitment_period(text)
    
    if commitment_months is None:
        await update.message.reply_text(
            "I couldn't understand your commitment period. Please specify clearly, for example: "
            "'1 month', '6 months', '1 year', '2 years', etc."
        )
        return WAITING_FOR_COMMITMENT
    
    if commitment_months < 1:
        await update.message.reply_text(
            "Sorry, we require a minimum commitment of 1 month. "
            "Please reconsider your commitment period or contact us directly if you have special circumstances."
        )
        return WAITING_FOR_COMMITMENT
    
    # Success! Send the form link
    commitment_text = f"{commitment_months} month{'s' if commitment_months != 1 else ''}"
    if commitment_months >= 12:
        years = commitment_months // 12
        remaining_months = commitment_months % 12
        if remaining_months == 0:
            commitment_text = f"{years} year{'s' if years != 1 else ''}"
        else:
            commitment_text = f"{years} year{'s' if years != 1 else ''} and {remaining_months} month{'s' if remaining_months != 1 else ''}"
    
    await update.message.reply_text(
        f"Excellent! Thank you for your interest in CPO Pte. Ltd. "
        f"Your commitment period of {commitment_text} meets our requirements.\n\n"
        f"Please fill out our application form to complete your application:\n"
        f"{FORM_LINK}\n\n"
        f"We will review your application and get back to you soon. Good luck!"
    )
    
    return ConversationHandler.END

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Cancel the conversation"""
    await update.message.reply_text(
        "Application process cancelled. Feel free to start again anytime by sending a message with 'apply' or 'AIRLINE HOUSE'."
    )
    return ConversationHandler.END

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Log the error and send a telegram message to notify the developer."""
    logger.warning(f'Update {update} caused error {context.error}')

def main() -> None:
    """Start the bot."""
    # Create the Application
    application = Application.builder().token(BOT_TOKEN).build()

    # Create conversation handler
    conv_handler = ConversationHandler(
        entry_points=[
            MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message)
        ],
        states={
            WAITING_FOR_RESUME: [
                MessageHandler(
                    (filters.Document.ALL | filters.PHOTO | filters.TEXT) & ~filters.COMMAND, 
                    handle_resume
                )
            ],
            WAITING_FOR_COMMITMENT: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_commitment)
            ],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
        allow_reentry=True
    )

    # Register handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(conv_handler)
    
    # Error handler
    application.add_error_handler(error_handler)

    # Run the bot until the user presses Ctrl-C
    print("Job Application Bot is starting...")
    print("Trigger keywords:", ", ".join(TRIGGER_KEYWORDS))
    print("Minimum commitment: 1 month")
    print("Accepted file formats: PDF, JPG, JPEG, PNG")
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main()