import Groq from "groq-sdk";
import { config } from "../config/keys.js";

const groq = new Groq({ apiKey: config.groqApiKey });

export const groqChat = async (prompt: string, json: boolean): Promise<string> => {
  const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    temperature: 0.5,
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: json
          ? "You are a senior software engineering mentor. Always respond with valid JSON only, no markdown fences, no extra text."
          : "You are FlowLens, an AI senior software engineering mentor analyzing GitHub activity. Be concise, direct, and actionable. Speak to the developer in second person.",
      },
      { role: "user", content: prompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Groq returned no content");
  return content.trim();
};
