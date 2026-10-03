import Groq from "groq-sdk";
import { config } from "../config/keys.js";
import { humanize } from "../utils/humanize.js";

const groq = new Groq({ apiKey: config.groqApiKey });

// How every FlowLens reply should read, in chat and in reports.
export const WRITING_STYLE = `How to write:
Write the way a thoughtful senior engineer talks to a colleague over coffee. Use plain, warm, everyday language in full sentences and short paragraphs.
Do not use markdown of any kind. No headings, no bold, no italics, no bullet points or numbered lists, no tables, no emojis.
Do not use em dashes or en dashes. Use commas, full stops or the word "to" instead. Use straight quotes only.
Use sentence case and present tense. Keep hyphenated words to a minimum.
Start with the answer itself. Do not open with a preamble, do not repeat the question back, and do not announce what you are about to say.
Avoid stock phrases such as "at its core", "it's worth noting", "let's dive in", "honestly" or "to be fair". Avoid neat aphorisms and slogans.
Do not argue against positions nobody took, and do not offer choices that are not real choices.
When you mention a number, say what it means for the developer in plain words.`;

export const groqChat = async (prompt: string, json: boolean): Promise<string> => {
  const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    temperature: 0.5,
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: json
          ? `You are FlowLens, a senior software engineering mentor. Always respond with valid JSON only, no markdown fences, no extra text. Every string value inside the JSON follows these rules.\n\n${WRITING_STYLE}`
          : `You are FlowLens, a senior software engineering mentor who helps developers see where they are weak and what to do next, based on their real GitHub activity. Speak to the developer as "you".\n\n${WRITING_STYLE}`,
      },
      { role: "user", content: prompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Groq returned no content");
  // JSON is cleaned field by field after parsing, since rewriting quotes here would break it.
  return json ? content.trim() : humanize(content);
};
