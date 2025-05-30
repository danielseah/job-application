import * as readline from "readline";
export class ConsoleAdapter {
    onMessage;
    rl;
    static CONSOLE_USER_ID = "console_user";
    async connect(onMessageCallback) {
        this.onMessage = onMessageCallback;
        console.log("ConsoleAdapter: Connected. Type your messages below.");
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: "You: ",
        });
        this.rl.on("line", async (line) => {
            if (this.onMessage) {
                const payload = {
                    userId: ConsoleAdapter.CONSOLE_USER_ID,
                    userName: "Console User",
                    text: line.trim(),
                    timestamp: new Date(),
                };
                try {
                    await this.onMessage(payload);
                }
                catch (error) {
                    console.error("ConsoleAdapter: Error processing message:", error);
                }
            }
            this.rl?.prompt();
        });
        this.rl.prompt();
    }
    async sendMessage(userId, text) {
        // In console adapter, we assume userId is always the console user
        if (userId === ConsoleAdapter.CONSOLE_USER_ID) {
            console.log(`Bot: ${text}`);
        }
        else {
            console.warn(`ConsoleAdapter: Attempted to send message to unknown user ${userId}`);
        }
        this.rl?.prompt(); // Keep the prompt active
    }
    async disconnect() {
        console.log("ConsoleAdapter: Disconnecting...");
        if (this.rl) {
            this.rl.close();
        }
        console.log("ConsoleAdapter: Disconnected.");
    }
}
