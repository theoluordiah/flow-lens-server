import { RepoStats, WINDOW_WEEKS } from "./github.js";
import { ScoreResult, ScoreKey } from "./scoring.js";

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
}

// The part of the report the LLM writes. Scores are never produced by the LLM.
export interface ReportNarrative {
  headline: string;
  strengths: string[];
  improvements: string[];
  summary: string;
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
  const { headline, strengths, improvements, summary } = parsed;
  if (!isStringArray(strengths) || !strengths.length) return null;
  if (!isStringArray(improvements) || !improvements.length) return null;
  if (typeof summary !== "string" || !summary.trim()) return null;
  return {
    headline: typeof headline === "string" ? headline.trim() : "",
    strengths,
    improvements,
    summary: summary.trim(),
  };
};

const SCORE_LABELS: Record<ScoreKey, string> = {
  consistency: "Consistency",
  codeQuality: "Code quality",
  collaboration: "Collaboration",
  projectActivity: "Project activity",
};

const IMPROVEMENT_TIPS: Record<ScoreKey, string> = {
  consistency: "Commit a little every week instead of in bursts — small, steady progress compounds.",
  codeQuality: "Route changes through pull requests, even solo, so every change gets a reviewable description.",
  collaboration: "Open issues for planned work and invite a reviewer or contributor onto your PRs.",
  projectActivity: "Set a small weekly goal (e.g. one merged PR) to keep the project moving.",
};

/**
 * Template narrative used when the LLM is unavailable, so an analysis never fails
 * just because the AI provider hiccuped.
 */
export const fallbackNarrative = (result: ScoreResult): ReportNarrative => {
  const keys = (Object.keys(SCORE_LABELS) as ScoreKey[]).sort(
    (a, b) => result.scores[b] - result.scores[a]
  );
  const best = keys.slice(0, 2);
  const worst = keys.slice(-2).reverse();
  return {
    headline: `Overall ${result.scores.overall}/100 — strongest in ${SCORE_LABELS[best[0]].toLowerCase()}.`,
    strengths: best.map(
      (k) => `${SCORE_LABELS[k]} (${result.scores[k]}/100): ${result.breakdown[k]}`
    ),
    improvements: worst.map((k) => IMPROVEMENT_TIPS[k]),
    summary: `Your overall score is ${result.scores.overall}/100. Your strongest area is ${SCORE_LABELS[best[0]].toLowerCase()}, and the biggest opportunity is ${SCORE_LABELS[worst[0]].toLowerCase()}.`,
  };
};

const TONE_INSTRUCTIONS: Record<ReportTone, string> = {
  mentor:
    "Tone: a supportive, direct senior engineering mentor.",
  roast:
    "Tone: a good-natured comedy roast of this repository's GitHub stats, like a witty friend at a hackathon. Be funny and a little savage about the NUMBERS and habits (commit patterns, lonely PRs, issue backlog), never about the person's identity, intelligence, or appearance. Every joke must reference a real number from the data. Improvements should still be genuinely useful, just delivered with humor.",
  hype:
    "Tone: an over-the-top hype-man / sports commentator who is thrilled about this developer's stats. Use energy and playful exaggeration, but every claim must reference a real number from the data. Improvements are framed as 'next level unlocks'.",
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


export const buildAnalysisPrompt = (
  stats: RepoStats,
  owner: string,
  repo: string,
  result: ScoreResult,
  tone: ReportTone = "mentor"
): string => {
  const scoreLines = (Object.keys(SCORE_LABELS) as ScoreKey[])
    .map((k) => `- ${SCORE_LABELS[k]}: ${result.scores[k]}/100 (${result.breakdown[k]})`)
    .join("\n");

  return `${buildRepoContext(stats, owner, repo)}

FlowLens has already computed these scores deterministically from the data. They are final — do not change, recompute, or output them:
${scoreLines}
- Overall: ${result.scores.overall}/100

Write the narrative for this developer growth report.
${TONE_INSTRUCTIONS[tone]}

Return a JSON object with exactly this shape (no markdown fences):
{
  "headline": "<one punchy sentence, max 90 characters, suitable for a shareable card>",
  "strengths": ["<3-4 concise strengths>"],
  "improvements": ["<3-4 specific, actionable improvements>"],
  "summary": "<2-3 sentence overall summary in second person>"
}

Rules:
- Explain the scores above; your text must be consistent with them (don't praise a low score).
- Base every insight strictly on the data provided. Do not invent metrics.
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
Improvements: ${report.improvements.join("; ")}`
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
Answer specifically and concisely, citing the developer's real repositories and stats above. Ground every suggestion in the actual data provided; if a specific repo is asked about and it is in the list, reference it directly.
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
