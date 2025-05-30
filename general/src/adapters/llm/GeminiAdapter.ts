// src/adapters/llm/GeminiAdapter.ts
// Requires '@google/generative-ai' library: npm install @google/generative-ai
import {
  ILLMAdapter,
  LLMMessage,
  LLMOptions,
} from "../../interfaces/ILLMAdapter";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";

export class GeminiAdapter implements ILLMAdapter {
  private gemini: GoogleGenerativeAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = "gemini-2.0-flash-lite") {
    this.gemini = new GoogleGenerativeAI(apiKey);
    this.defaultModel = defaultModel;
  }

  async generateResponse(
    messages: LLMMessage[],
    options?: LLMOptions,
  ): Promise<string> {
    try {
      const model = this.gemini.getGenerativeModel({
        model: options?.model || this.defaultModel,
      });

      // Gemini expects messages as a single prompt string or as a chat history
      // We'll convert the messages array to the expected format
      const chatHistory = messages.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      }));

      const result = await model.generateContent({
        contents: chatHistory,
        generationConfig: {
          temperature: options?.temperature,
          maxOutputTokens: options?.maxTokens,
        },
        safetySettings: [
          // Example: block only the most egregious harmful content
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      });

      // The response is in result.response.candidates[0].content.parts[0].text
      const text =
        result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";

      return text.trim();
    } catch (error) {
      console.error("GeminiAdapter Error:", error);
      throw new Error("Failed to get response from Gemini");
    }
  }
}