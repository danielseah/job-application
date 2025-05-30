// src/adapters/messaging/ConsoleAdapter.ts
import {
  IMessagingPlatformAdapter,
  MessagePayload,
} from "../../interfaces/IMessagingPlatformAdapter";
import * as readline from "readline";

export class ConsoleAdapter implements IMessagingPlatformAdapter {
  private onMessage?: (payload: MessagePayload) => Promise<void>;
  private rl?: readline.Interface;
  private static readonly CONSOLE_USER_ID = "console_user";

  async connect(
    onMessageCallback: (payload: MessagePayload) => Promise<void>,
  ): Promise<void> {
    this.onMessage = onMessageCallback;
    console.log("ConsoleAdapter: Connected. Type your messages below.");

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "You: ",
    });

    this.rl.on("line", async (line) => {
      if (this.onMessage) {
        const payload: MessagePayload = {
          userId: ConsoleAdapter.CONSOLE_USER_ID,
          userName: "Console User",
          text: line.trim(),
          timestamp: new Date(),
        };
        try {
          await this.onMessage(payload);
        } catch (error) {
          console.error("ConsoleAdapter: Error processing message:", error);
        }
      }
      this.rl?.prompt();
    });

    this.rl.prompt();
  }

  async sendMessage(userId: string, text: string): Promise<void> {
    // In console adapter, we assume userId is always the console user
    if (userId === ConsoleAdapter.CONSOLE_USER_ID) {
      console.log(`Bot: ${text}`);
    } else {
      console.warn(
        `ConsoleAdapter: Attempted to send message to unknown user ${userId}`,
      );
    }
    this.rl?.prompt(); // Keep the prompt active
  }

  async disconnect(): Promise<void> {
    console.log("ConsoleAdapter: Disconnecting...");
    if (this.rl) {
      this.rl.close();
    }
    console.log("ConsoleAdapter: Disconnected.");
  }
}