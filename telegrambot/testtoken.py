import asyncio
import sys
from telegram import Bot

async def test_token(token):
    """Test if a Telegram bot token is valid"""
    print(f"Testing token: {token[:10]}...{token[-10:]}")
    
    try:
        bot = Bot(token)
        me = await bot.get_me()
        print("✅ SUCCESS! Token is valid!")
        print(f"Bot ID: {me.id}")
        print(f"Bot Name: {me.first_name}")
        print(f"Bot Username: @{me.username}")
        print(f"Bot Can Join Groups: {me.can_join_groups}")
        print(f"Bot Can Read All Group Messages: {me.can_read_all_group_messages}")
        return True
        
    except Exception as e:
        print("❌ FAILED! Token is invalid!")
        print(f"Error: {e}")
        return False

def main():
    # Replace this with your actual token from BotFather
    token = input("Enter your bot token: ").strip()
    
    if not token:
        print("No token provided!")
        return
    
    if len(token) < 35:
        print("Token seems too short. Make sure you copied the full token.")
        return
        
    asyncio.run(test_token(token))

if __name__ == "__main__":
    main()