// src/main.ts
import { Chatbot } from "./core/Chatbot.js";
import { ConsoleAdapter } from "./adapters/messaging/ConsoleAdapter.js";
import { TelegramAdapter } from "./adapters/messaging/TelegramAdapter.js";
import { ChatGPTAdapter } from "./adapters/llm/ChatGPTAdapter.js";
import { GeminiAdapter } from "./adapters/llm/GeminiAdapter.js";
// Optional: For loading API keys from a .env file
import * as dotenv from 'dotenv';
dotenv.config();
async function main() {
    console.log("Starting chatbot application...");
    // --- Configuration ---
    // Choose your messaging platform adapter
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    let messagingAdapter;
    if (telegramToken) {
        console.log("Using Telegram Adapter.");
        messagingAdapter = new TelegramAdapter(telegramToken);
    }
    else {
        console.log("Telegram token not found, using Console Adapter.");
        messagingAdapter = new ConsoleAdapter();
    }
    // Choose your LLM adapter
    // Ensure you have set the API keys as environment variables or directly
    const openAIApiKey = process.env.OPENAI_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    // const geminiApiKey = ""
    let llmAdapter;
    // Example: Prioritize Gemini if key is available, else fallback to ChatGPT, else error
    if (geminiApiKey) {
        console.log("Using Gemini LLM Adapter.");
        llmAdapter = new GeminiAdapter(geminiApiKey, "gemini-2.0-flash-lite"); // Using a faster model for testing
    }
    else if (openAIApiKey) {
        console.log("Using ChatGPT LLM Adapter.");
        llmAdapter = new ChatGPTAdapter(openAIApiKey, "gpt-4.1-nano-2025-04-14");
    }
    else {
        console.error("No LLM API key found. Please set OPENAI_API_KEY or GEMINI_API_KEY environment variables.");
        // Fallback to a dummy LLM adapter for basic testing without API calls
        // This is useful if you want to test the messaging flow without actual LLM calls
        llmAdapter = {
            generateResponse: async (messages, options) => {
                console.warn("Using Dummy LLM Adapter. No API key found for OpenAI or Gemini.");
                const lastUserMessage = messages.findLast((m) => m.role === "user");
                return `Dummy response to: "${lastUserMessage?.content}". Configure an LLM API key for real responses.`;
            },
        };
        // return; // Or exit if an LLM is strictly required
    }
    const llmOptions = {
        temperature: 0.7,
        maxTokens: 150,
    };
    // --- Initialization ---
    const chatbot = new Chatbot(messagingAdapter, llmAdapter, llmOptions);
    // --- Start Chatbot ---
    try {
        await chatbot.start();
        console.log("Chatbot is running. Type 'quit' or 'exit' in the console to stop.");
    }
    catch (error) {
        console.error("Failed to start chatbot:", error);
        process.exit(1);
    }
    // Graceful shutdown
    const shutdown = async () => {
        console.log("\nShutting down chatbot...");
        await chatbot.stop();
        console.log("Chatbot has been shut down. Exiting.");
        process.exit(0);
    };
    process.on("SIGINT", shutdown); // Ctrl+C
    process.on("SIGTERM", shutdown); // kill
    // Keep the process alive for the ConsoleAdapter until 'quit' or 'exit'
    // The ConsoleAdapter's readline interface will keep it alive.
    // We need a way for the user to signal exit from the console.
    // The ConsoleAdapter's readline 'line' event can check for 'quit' or 'exit'.
    // Modify ConsoleAdapter to handle 'quit' or 'exit'
    if (messagingAdapter instanceof ConsoleAdapter) {
        const originalOnLine = messagingAdapter.rl?.listeners("line")[0];
        if (messagingAdapter.rl && originalOnLine) {
            messagingAdapter.rl.removeListener("line", originalOnLine);
            messagingAdapter.rl.on("line", async (line) => {
                if (line.trim().toLowerCase() === "quit" || line.trim().toLowerCase() === "exit") {
                    await shutdown();
                }
                else {
                    // Re-apply the original listener logic
                    if (messagingAdapter.onMessage) {
                        const payload = {
                            userId: ConsoleAdapter.CONSOLE_USER_ID,
                            userName: "Console User",
                            text: line.trim(),
                            timestamp: new Date(),
                        };
                        try {
                            await messagingAdapter.onMessage(payload);
                        }
                        catch (error) {
                            console.error("ConsoleAdapter: Error processing message:", error);
                        }
                    }
                    messagingAdapter.rl?.prompt();
                }
            });
        }
    }
}
main().catch((error) => {
    console.error("Unhandled error in main:", error);
    process.exit(1);
});
