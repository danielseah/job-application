// src/interfaces/IMessagingPlatformAdapter.ts

export interface MessagePayload {
  userId: string; // Unique identifier for the user on the platform
  userName?: string; // Optional: User's display name
  text: string; // The message content
  timestamp: Date; // When the message was sent/received
  originalMessage?: any; // Optional: The raw message object from the platform
}

export interface IMessagingPlatformAdapter {
  /**
   * Initializes the adapter and starts listening for incoming messages.
   * @param onMessageCallback A function to be called when a new message is received.
   */
  connect(
    onMessageCallback: (payload: MessagePayload) => Promise<void>,
  ): Promise<void>;

  /**
   * Sends a message to a specific user.
   * @param userId The unique identifier of the recipient.
   * @param text The message text to send.
   */
  sendMessage(userId: string, text: string): Promise<void>;

  /**
   * Performs any cleanup or disconnection needed.
   */
  disconnect(): Promise<void>;
}