import OpenAI from "openai";
export class ChatGPTAdapter {
    openai;
    defaultModel;
    constructor(apiKey, defaultModel = "gpt-4.1-nano-2025-04-14") {
        this.openai = new OpenAI({ apiKey });
        this.defaultModel = defaultModel;
    }
    async generateResponse(messages, options) {
        try {
            const completion = await this.openai.chat.completions.create({
                model: options?.model || this.defaultModel,
                messages: messages, // OpenAI's type is slightly different but compatible
                temperature: options?.temperature,
                max_tokens: options?.maxTokens,
            });
            return completion.choices[0]?.message?.content || "";
        }
        catch (error) {
            console.error("ChatGPTAdapter Error:", error);
            throw new Error("Failed to get response from ChatGPT");
        }
    }
}
