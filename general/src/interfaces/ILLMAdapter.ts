// src/interfaces/ILLMAdapter.ts

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMOptions {
  // Common options, can be extended by specific adapters
  temperature?: number;
  maxTokens?: number;
  model?: string; // e.g., "gpt-4", "gemini-1.5-pro-latest"
  // Add other common parameters like topP, topK, etc.
}

export interface ILLMAdapter {
  /**
   * Generates a response from the LLM.
   * @param messages A list of messages forming the conversation history.
   * @param options Optional parameters for the LLM call.
   */
  generateResponse(
    messages: LLMMessage[],
    options?: LLMOptions,
  ): Promise<string>;
}