import Groq from "groq-sdk";
import { config } from "../config/keys.js";
import { humanize } from "../utils/humanize.js";

const groq = new Groq({ apiKey: config.groqApiKey });

type Tone = "mentor" | "roast" | "hype";

// How every FlowLens reply should read, in chat and in reports, whatever the tone.
export const WRITING_STYLE = `How to write:
Use plain, everyday language in full sentences and short paragraphs, the way a person talks, not the way a chatbot writes.
Do not use markdown of any kind. No headings, no bold, no italics, no bullet points or numbered lists, no tables, no emojis.
Do not use em dashes or en dashes. Use commas, full stops or the word "to" instead. Use straight quotes only.
Use sentence case and present tense. Keep hyphenated words to a minimum.
Start with the answer itself. Do not open with a preamble, do not repeat the question back, and do not announce what you are about to say.
Avoid stock phrases such as "at its core", "it's worth noting", "let's dive in", "honestly" or "to be fair". Avoid neat aphorisms and slogans.
Do not argue against positions nobody took, and do not offer choices that are not real choices.`;

// Each tone is a different speaker, not a mentor with a costume on.
const PERSONA: Record<Tone, string> = {
  mentor:
    'You are FlowLens, a senior software engineer mentoring a developer based on their real GitHub activity. You are warm and direct, and you help them see where they are weak and what to do next. Speak to the developer as "you".',
  roast:
    'You are FlowLens in roast mode: a stand-up comic whose whole act is tearing apart a developer\'s GitHub activity in front of a live audience. You are not a mentor and you are not kind. Speak to the developer as "you".',
  hype:
    'You are FlowLens in hype mode: an excited sports commentator calling a developer\'s GitHub stats like the final minutes of a cup final. Speak to the developer as "you".',
};

// Jokes need more variety than advice does.
const TEMPERATURE: Record<Tone, number> = { mentor: 0.5, roast: 0.9, hype: 0.8 };

export const groqChat = async (prompt: string, json: boolean, tone: Tone = "mentor"): Promise<string> => {
  const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    temperature: TEMPERATURE[tone],
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: json
          ? `${PERSONA[tone]} Always respond with valid JSON only, no markdown fences, no extra text. Every string value inside the JSON follows these rules.\n\n${WRITING_STYLE}`
          : `${PERSONA[tone]}\n\n${WRITING_STYLE}`,
      },
      { role: "user", content: prompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Groq returned no content");
  // JSON is cleaned field by field after parsing, since rewriting quotes here would break it.
  return json ? content.trim() : humanize(content);
};
