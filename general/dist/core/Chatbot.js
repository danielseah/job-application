export class Chatbot {
    messagingAdapter;
    llmAdapter;
    llmOptions;
    conversationHistories = new Map(); // UserID -> History
    constructor(messagingAdapter, llmAdapter, llmOptions) {
        this.messagingAdapter = messagingAdapter;
        this.llmAdapter = llmAdapter;
        this.llmOptions = llmOptions;
    }
    async handleIncomingMessage(payload) {
        console.log(`Chatbot: Received message from ${payload.userName || payload.userId}: "${payload.text}"`);
        // Get or initialize conversation history for the user
        let history = this.conversationHistories.get(payload.userId);
        if (!history) {
            history = [
            // Optional: Add a system prompt to set the LLM's behavior
            // { role: "system", content: "You are a helpful assistant." }
            ];
            this.conversationHistories.set(payload.userId, history);
        }
        // Add user's message to history
        history.push({ role: "user", content: payload.text });
        // Keep history to a reasonable length (e.g., last 10 messages)
        const maxHistoryLength = 10; // (system + user/assistant pairs)
        if (history.length > maxHistoryLength) {
            // Remove the oldest user/assistant pair, keeping system prompt if any
            const systemPromptOffset = history[0]?.role === "system" ? 1 : 0;
            history.splice(systemPromptOffset, history.length - maxHistoryLength);
        }
        try {
            console.log(`Chatbot: Sending to LLM for user ${payload.userId}. History length: ${history.length}`);
            const llmResponseText = await this.llmAdapter.generateResponse(history, this.llmOptions);
            if (llmResponseText) {
                // Add LLM's response to history
                history.push({ role: "assistant", content: llmResponseText });
                this.conversationHistories.set(payload.userId, history); // Update history
                console.log(`Chatbot: LLM response for ${payload.userId}: "${llmResponseText}"`);
                await this.messagingAdapter.sendMessage(payload.userId, llmResponseText);
            }
            else {
                console.warn(`Chatbot: LLM returned an empty response for user ${payload.userId}.`);
                await this.messagingAdapter.sendMessage(payload.userId, "I'm sorry, I couldn't generate a response right now.");
            }
        }
        catch (error) {
            console.error("Chatbot: Error processing message or calling LLM:", error);
            await this.messagingAdapter.sendMessage(payload.userId, "Sorry, I encountered an error. Please try again later.");
        }
    }
    async start() {
        console.log("Chatbot: Starting...");
        // The `bind(this)` is crucial to ensure `this` inside `handleIncomingMessage`
        // refers to the Chatbot instance, not the messagingAdapter.
        await this.messagingAdapter.connect(this.handleIncomingMessage.bind(this));
        console.log("Chatbot: Connected to messaging platform and listening.");
    }
    async stop() {
        console.log("Chatbot: Stopping...");
        await this.messagingAdapter.disconnect();
        console.log("Chatbot: Stopped.");
    }
}
