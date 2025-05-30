import twilio from "twilio";
import { MessagingResponse } from "twilio/lib/twiml/MessagingResponse";
export class TwilioWhatsAppAdapter {
    client;
    onMessage;
    config;
    constructor(config) {
        if (!config.accountSid ||
            !config.authToken ||
            !config.twilioPhoneNumber) {
            throw new Error("TwilioWhatsAppAdapter: accountSid, authToken, and twilioPhoneNumber are required.");
        }
        this.config = config;
        this.client = twilio(this.config.accountSid, this.config.authToken);
    }
    /**
     * For webhook-based adapters, 'connect' primarily means setting up the callback
     * that will be triggered by incoming webhook events.
     * It doesn't establish a persistent connection itself.
     */
    async connect(onMessageCallback) {
        this.onMessage = onMessageCallback;
        console.log("TwilioWhatsAppAdapter: Ready to handle webhook requests. Ensure your webhook is configured in Twilio.");
        // No actual connection is made here, we just store the callback.
    }
    /**
     * Processes an incoming webhook request from Twilio.
     * This method should be called by your HTTP server (e.g., Express route handler).
     * @param requestBody The parsed body of the incoming POST request from Twilio.
     * @returns A TwiML string to respond to Twilio. Typically an empty response to acknowledge.
     */
    async handleWebhookRequest(requestBody) {
        console.log("TwilioWhatsAppAdapter: Received webhook request:", requestBody);
        if (!this.onMessage) {
            console.warn("TwilioWhatsAppAdapter: onMessage callback not set. Ignoring webhook.");
            // Still send a valid TwiML response to Twilio to avoid errors on their end
            const twiml = new MessagingResponse();
            return twiml.toString();
        }
        const payload = {
            userId: requestBody.From, // e.g., "whatsapp:+14155238886"
            userName: requestBody.ProfileName || requestBody.From, // Use ProfileName if available
            text: requestBody.Body,
            timestamp: new Date(), // Twilio doesn't provide a precise timestamp in the webhook for incoming messages
            originalMessage: requestBody,
        };
        // Asynchronously process the message without holding up the Twilio webhook response.
        // Twilio expects a quick response to its webhook.
        this.onMessage(payload).catch((error) => {
            console.error("TwilioWhatsAppAdapter: Error processing message via onMessageCallback:", error);
            // Optionally, you could use the REST API here to send an error message to the user
            // if the main processing fails much later.
        });
        // Respond to Twilio immediately with an empty TwiML response.
        // This acknowledges receipt of the message. The actual reply from the bot
        // will be sent asynchronously via the `sendMessage` method (using the REST API).
        const twiml = new MessagingResponse();
        // If you want to send an immediate "typing" or "processing" style message:
        // twiml.message("Got it! Thinking...");
        return twiml.toString();
    }
    /**
     * Sends a message to a specific user via the Twilio REST API.
     * @param userId The recipient's WhatsApp number (e.g., "whatsapp:+14155238886").
     * @param text The message text to send.
     */
    async sendMessage(userId, text) {
        try {
            const message = await this.client.messages.create({
                body: text,
                from: this.config.twilioPhoneNumber, // Your Twilio WhatsApp number
                to: userId, // User's WhatsApp number
            });
            console.log(`TwilioWhatsAppAdapter: Message sent to ${userId}. SID: ${message.sid}`);
        }
        catch (error) {
            console.error(`TwilioWhatsAppAdapter: Error sending message to ${userId}:`, error);
            throw error; // Re-throw to allow Chatbot core to potentially handle it
        }
    }
    async disconnect() {
        console.log("TwilioWhatsAppAdapter: Disconnecting (clearing onMessage callback).");
        this.onMessage = undefined;
        // No actual connection to close for a webhook-based system.
    }
}
