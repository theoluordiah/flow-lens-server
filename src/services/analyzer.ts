import { RepoStats, WINDOW_WEEKS } from "./github.js";
import { ScoreResult, ScoreKey, SCORE_LABELS, GrowthPlan } from "./scoring.js";
import { humanize } from "../utils/humanize.js";

export type ReportTone = "mentor" | "roast" | "hype";
export const REPORT_TONES: ReportTone[] = ["mentor", "roast", "hype"];

export const parseTone = (v: unknown): ReportTone =>
  REPORT_TONES.includes(v as ReportTone) ? (v as ReportTone) : "mentor";

export interface DeveloperReport {
  scores: {
    consistency: number;
    codeQuality: number;
    collaboration: number;
    projectActivity: number;
    overall: number;
  };
  breakdown?: Record<ScoreKey, string>;
  headline?: string;
  strengths: string[];
  improvements: string[];
  summary: string;
  /** Plain-language explanation of the weakest area and where to start. */
  focus?: string;
  /** Concrete next steps, each measured against the scoring formula. */
  growthPlan?: GrowthPlan;
}

// The part of the report the LLM writes. Scores are never produced by the LLM.
export interface ReportNarrative {
  headline: string;
  strengths: string[];
  improvements: string[];
  summary: string;
  focus: string;
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");

const parseRaw = (raw: string): unknown => {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return JSON.parse(cleaned);
  }
  return JSON.parse(cleaned.slice(start, end + 1));
};

/** Returns the parsed narrative, or null if the LLM output is unusable. */
export const parseNarrative = (raw: string): ReportNarrative | null => {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseRaw(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { headline, strengths, improvements, summary, focus } = parsed;
  if (!isStringArray(strengths) || !strengths.length) return null;
  if (!isStringArray(improvements) || !improvements.length) return null;
  if (typeof summary !== "string" || !summary.trim()) return null;
  return {
    headline: typeof headline === "string" ? humanize(headline) : "",
    strengths: strengths.map(humanize),
    improvements: improvements.map(humanize),
    summary: humanize(summary),
    focus: typeof focus === "string" ? humanize(focus) : "",
  };
};

const IMPROVEMENT_TIPS: Record<ScoreKey, string> = {
  consistency: "Commit a little every week instead of saving it all up for one busy week.",
  codeQuality: "Send your changes through pull requests, even when you work alone, so each one has a description you can look back on.",
  collaboration: "Open issues for the work you plan to do and ask someone to review your pull requests.",
  projectActivity: "Set yourself a small weekly goal, such as one merged pull request, so the project keeps moving.",
};

/**
 * Template narrative used when the LLM is unavailable, so an analysis never fails
 * just because the AI provider hiccuped.
 */
export const fallbackNarrative = (result: ScoreResult, plan?: GrowthPlan): ReportNarrative => {
  const keys = (Object.keys(SCORE_LABELS) as ScoreKey[]).sort(
    (a, b) => result.scores[b] - result.scores[a]
  );
  const best = keys.slice(0, 2);
  const worst = keys.slice(-2).reverse();
  const first = plan?.steps[0];
  return {
    headline: `Overall ${result.scores.overall} out of 100, strongest in ${SCORE_LABELS[best[0]].toLowerCase()}.`,
    strengths: best.map(
      (k) => `${SCORE_LABELS[k]} scores ${result.scores[k]} out of 100. ${result.breakdown[k]}`
    ),
    improvements: worst.map((k) => IMPROVEMENT_TIPS[k]),
    summary: `Your overall score is ${result.scores.overall} out of 100. You are strongest in ${SCORE_LABELS[best[0]].toLowerCase()}, and ${SCORE_LABELS[worst[0]].toLowerCase()} is where you have the most room to grow.`,
    focus: `${SCORE_LABELS[worst[0]]} is your weakest area at ${result.scores[worst[0]]} out of 100. ${result.breakdown[worst[0]]}${
      first ? ` The step that raises your overall score the most is to ${first.action.charAt(0).toLowerCase()}${first.action.slice(1)}, which takes it from ${first.overallFrom} to ${first.overallTo}.` : ""
    }`,
  };
};

const TONE_INSTRUCTIONS: Record<ReportTone, string> = {
  mentor:
    "Tone: a supportive, direct senior engineering mentor.",
  roast:
    "Tone: a good-natured comedy roast of this repository's GitHub stats, like a witty friend at a hackathon. Be funny and a little savage about the numbers and habits (commit patterns, lonely pull requests, issue backlog), never about the person's identity, intelligence or appearance. Every joke must reference a real number from the data. Improvements should still be genuinely useful, just delivered with humour.",
  hype:
    "Tone: an excited sports commentator who is thrilled about this developer's stats. Use energy and playful exaggeration, but every claim must reference a real number from the data. Frame improvements as the next thing they can unlock.",
};

const buildRepoContext = (stats: RepoStats, owner: string, repo: string): string => {
  const langSummary = Object.entries(stats.languages)
    .map(([lang, pct]) => `${lang} ${pct}%`)
    .join(", ");

  return `Repository: ${owner}/${repo}
Commit count: ${stats.commits}
Pull requests: ${stats.pullRequests}
Issues: ${stats.issues}
Contributors: ${stats.contributors}
Stars: ${stats.stars}
Forks: ${stats.forks}
Languages: ${langSummary || "Not detected"}
Activity window: last ${WINDOW_WEEKS} weeks (commit, PR and issue counts cover this window)
Weekly commit activity (oldest to newest): [${stats.weeklyActivity.join(", ")}]`;
};

/** The growth plan as plain text, for grounding the LLM in measured next steps. */
export const describeGrowthPlan = (plan: GrowthPlan): string => {
  const weakest = `Weakest area: ${SCORE_LABELS[plan.weakest.key]} at ${plan.weakest.score}/100.`;
  if (!plan.steps.length) return `${weakest}\nNo single action measurably raises the score right now.`;
  const steps = plan.steps
    .map((s, i) => {
      const moves = s.changes.map((c) => `${SCORE_LABELS[c.key]} ${c.from} to ${c.to}`).join(", ");
      return `Step ${i + 1}: ${s.action}. Overall ${s.overallFrom} to ${s.overallTo} (${moves}). ${s.detail}`;
    })
    .join("\n");
  return `${weakest}
Measured next steps, ranked by how much they raise the overall score (computed by FlowLens, not estimates):
${steps}${
    plan.steps.length > 1
      ? `
Doing all of them in the same six weeks: overall ${plan.steps[0].overallFrom} to ${plan.combinedOverall}.`
      : ""
  }`;
};

export const buildAnalysisPrompt = (
  stats: RepoStats,
  owner: string,
  repo: string,
  result: ScoreResult,
  tone: ReportTone = "mentor",
  plan?: GrowthPlan
): string => {
  const scoreLines = (Object.keys(SCORE_LABELS) as ScoreKey[])
    .map((k) => `- ${SCORE_LABELS[k]}: ${result.scores[k]}/100 (${result.breakdown[k]})`)
    .join("\n");

  return `${buildRepoContext(stats, owner, repo)}

FlowLens has already computed these scores deterministically from the data. They are final, so do not change, recompute or output them:
${scoreLines}
- Overall: ${result.scores.overall}/100

${plan ? describeGrowthPlan(plan) : ""}

Write the narrative for this developer growth report. The developer wants to understand where they are weak and what to do next.
${TONE_INSTRUCTIONS[tone]}

Return a JSON object with exactly this shape (no markdown fences):
{
  "headline": "<one sentence, max 90 characters, suitable for a shareable card>",
  "strengths": ["<3 strengths, each one full sentence that names a real number>"],
  "improvements": ["<3 improvements, each one full sentence; follow the measured next steps above in the same order when they exist>"],
  "summary": "<2 to 3 sentences in second person on how the project is going overall>",
  "focus": "<3 to 4 sentences in second person: name the weakest area, explain in plain words why it scored low using the real numbers, and say what to do first and how much it raises the overall score according to the measured steps>"
}

Rules:
- Explain the scores above; your text must be consistent with them (don't praise a low score).
- Base every insight strictly on the data provided. Do not invent metrics or score changes; only quote the score changes listed in the measured next steps.
- Improvements must be specific and actionable.`;
};

export const buildChatPrompt = (
  question: string,
  stats: RepoStats | null,
  owner: string,
  repo: string,
  report: DeveloperReport | null,
  history: { role: "user" | "assistant"; content: string }[],
  accountContext?: string | null,
  tone: ReportTone = "mentor"
): string => {
  const reportText = report
    ? `Existing analysis:
Scores: consistency ${report.scores.consistency}, code quality ${report.scores.codeQuality}, collaboration ${report.scores.collaboration}, project activity ${report.scores.projectActivity}
Strengths: ${report.strengths.join("; ")}
Improvements: ${report.improvements.join("; ")}${
        report.growthPlan ? `\n${describeGrowthPlan(report.growthPlan)}` : ""
      }`
    : "No prior analysis exists yet for this repository.";

  const historyText = history.length
    ? history
        .slice(-6)
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n")
    : "";

  const contextLine = stats
    ? buildRepoContext(stats, owner, repo)
    : accountContext
      ? "General context about the developer's account is provided below."
      : `Context: repository ${owner}/${repo} (stats unavailable)`;

  return `${contextLine}

${accountContext || ""}

${reportText}

Conversation so far:
${historyText || "(none)"}

Developer asks: "${question}"
Answer the way a mentor would in a conversation: usually two or three short paragraphs, less if the question is simple. Cite the developer's real repositories and stats above and say what the numbers mean for them. Ground every suggestion in the actual data provided; if a specific repo is asked about and it is in the list, reference it directly. When they ask what to work on or where they are weak, start from the measured next steps if they are listed, and only quote score changes that appear there. End with one concrete thing they can do this week.
${tone === "mentor" ? "" : TONE_INSTRUCTIONS[tone]}`;
};

export const buildAccountContext = (context: Record<string, unknown>): string => {
  const c = context as Record<string, any>;
  const repos = Array.isArray(c.repositories) ? c.repositories : [];

  const languageSummary =
    typeof c.languageSummary === "string" && c.languageSummary
      ? c.languageSummary
      : "Not available";

  const weekly =
    Array.isArray(c.weeklyActivity) && c.weeklyActivity.length
      ? ` [${(c.weeklyActivity as number[]).join(", ")}]`
      : "";

  const repoList = repos
    .slice(0, 50)
    .map(
      (r: any) =>
        `- ${r.full_name} ${
          r.stars ? `(${r.stars} stars` : "("
        }${r.language ? `, ${r.language}` : ""})`
    )
    .join("\n");

  return `ACCOUNT-WIDE STATS (developer's ENTIRE GitHub account, all repositories):
- Commits: ${c.commits ?? "N/A"}
- Pull requests: ${c.pullRequests ?? "N/A"}
- Issues: ${c.issues ?? "N/A"}
- Contributors: ${c.contributors ?? "N/A"}
- Top languages: ${languageSummary}
- Weekly commit activity (summed across all repos)${weekly}

Repositories:
${repoList || "(none available)"}

Use these REAL numbers and the actual repository list above to answer. Never claim data is unavailable when it is provided here.`;
};
