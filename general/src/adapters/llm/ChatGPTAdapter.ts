// src/adapters/llm/ChatGPTAdapter.ts
// Requires 'openai' library: npm install openai
import {
  ILLMAdapter,
  LLMMessage,
  LLMOptions,
} from "../../interfaces/ILLMAdapter";
import OpenAI from "openai";

export class ChatGPTAdapter implements ILLMAdapter {
  private openai: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = "gpt-4.1-nano-2025-04-14") {
    this.openai = new OpenAI({ apiKey });
    this.defaultModel = defaultModel;
  }

  async generateResponse(
    messages: LLMMessage[],
    options?: LLMOptions,
  ): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: options?.model || this.defaultModel,
        messages: messages as any, // OpenAI's type is slightly different but compatible
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
      });
      return completion.choices[0]?.message?.content || "";
    } catch (error) {
      console.error("ChatGPTAdapter Error:", error);
      throw new Error("Failed to get response from ChatGPT");
    }
  }
}