import TelegramBot from "node-telegram-bot-api";
export class TelegramAdapter {
    token;
    bot;
    onMessageCallback;
    /**
     * Creates an instance of TelegramAdapter.
     * @param token The Telegram Bot API token.
     * @param options Optional TelegramBot options (e.g., polling, webhook).
     *                Defaults to polling: { polling: true }.
     */
    constructor(token, options) {
        this.token = token;
        if (!token) {
            throw new Error("TelegramAdapter: Bot token is required. Please provide a valid token.");
        }
        // Default to polling if no options are provided or if polling is not explicitly set
        const botOptions = options || { polling: true };
        if (botOptions.polling === undefined && !botOptions.webHook) {
            botOptions.polling = true;
        }
        this.bot = new TelegramBot(this.token, botOptions);
    }
    async connect(onMessageCallback) {
        this.onMessageCallback = onMessageCallback;
        console.log("TelegramAdapter: Connecting and starting to listen for messages...");
        this.bot.on("message", this.handleTelegramMessage.bind(this));
        this.bot.on("polling_error", (error) => {
            console.error("TelegramAdapter: Polling error:", error.message);
            // You might want to implement reconnection logic or notify an admin
        });
        this.bot.on("webhook_error", (error) => {
            console.error("TelegramAdapter: Webhook error:", error.message);
        });
        // You can also listen to other events like 'callback_query' for inline keyboards
        // this.bot.on('callback_query', (callbackQuery) => { /* ... */ });
        console.log("TelegramAdapter: Connected and listening.");
    }
    async handleTelegramMessage(msg) {
        // Ignore messages without text or from other bots (optional)
        if (!msg.text || msg.from?.is_bot) {
            // You might want to log these or handle specific non-text messages (photos, etc.)
            return;
        }
        if (!this.onMessageCallback) {
            console.warn("TelegramAdapter: onMessageCallback is not set. Message ignored.");
            return;
        }
        const payload = {
            userId: msg.chat.id.toString(), // chat.id is unique for the conversation
            userName: msg.from?.username ||
                `${msg.from?.first_name || ""} ${msg.from?.last_name || ""}`.trim() ||
                "Telegram User",
            text: msg.text,
            timestamp: new Date(msg.date * 1000), // Telegram date is in seconds
            originalMessage: msg, // Store the original message for more advanced use cases
        };
        try {
            await this.onMessageCallback(payload);
        }
        catch (error) {
            console.error("TelegramAdapter: Error processing message via onMessageCallback:", error);
            // Optionally send an error message back to the user
            // await this.sendMessage(payload.userId, "Sorry, an internal error occurred.");
        }
    }
    async sendMessage(userId, text) {
        try {
            // Telegram expects chatId to be a number or string, our userId is string.
            await this.bot.sendMessage(userId, text);
            console.log(`TelegramAdapter: Message sent to ${userId}: "${text}"`);
        }
        catch (error) {
            console.error(`TelegramAdapter: Error sending message to ${userId}:`, error.response?.body || error.message || error);
            // Handle specific errors, e.g., chat not found, bot blocked by user
            throw error; // Re-throw to allow Chatbot core to potentially handle it
        }
    }
    async disconnect() {
        console.log("TelegramAdapter: Disconnecting...");
        if (this.bot.isPolling()) {
            await this.bot.stopPolling();
            console.log("TelegramAdapter: Polling stopped.");
        }
        // If using webhooks, you might need to remove the webhook
        // await this.bot.deleteWebHook();
        // console.log("TelegramAdapter: Webhook removed.");
        // Remove all listeners to prevent memory leaks if connect is called again
        this.bot.removeAllListeners();
        console.log("TelegramAdapter: All event listeners removed.");
        console.log("TelegramAdapter: Disconnected.");
    }
}
