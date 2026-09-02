import { RepoStats } from "./github.js";

export interface DeveloperReport {
  scores: {
    consistency: number;
    codeQuality: number;
    collaboration: number;
    projectActivity: number;
    overall: number;
  };
  strengths: string[];
  improvements: string[];
  summary: string;
}

const clamp = (n: unknown, fallback: number): number => {
  const num = typeof n === "number" ? n : fallback;
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
};

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");

export const normalizeReport = (r: unknown): DeveloperReport => {
  const s = (r as { scores?: unknown })?.scores as
    | {
        consistency?: unknown;
        codeQuality?: unknown;
        collaboration?: unknown;
        projectActivity?: unknown;
        overall?: unknown;
      }
    | undefined;

  return {
    scores: {
      consistency: clamp(s?.consistency, 50),
      codeQuality: clamp(s?.codeQuality, 50),
      collaboration: clamp(s?.collaboration, 50),
      projectActivity: clamp(s?.projectActivity, 50),
      overall: clamp(s?.overall, 50),
    },
    strengths: isStringArray((r as { strengths?: unknown })?.strengths)
      ? (r as { strengths: string[] }).strengths
      : [],
    improvements: isStringArray((r as { improvements?: unknown })?.improvements)
      ? (r as { improvements: string[] }).improvements
      : [],
    summary:
      typeof (r as { summary?: unknown })?.summary === "string"
        ? (r as { summary: string }).summary
        : "",
  };
};

export const isValidReport = (r: unknown): boolean => {
  if (!r || typeof r !== "object") return false;
  const { scores, strengths, improvements, summary } = r as {
    scores?: Record<string, unknown>;
    strengths?: unknown;
    improvements?: unknown;
    summary?: unknown;
  };
  if (!scores || typeof scores !== "object") return false;
  const keys = ["consistency", "codeQuality", "collaboration", "projectActivity", "overall"];
  for (const k of keys) {
    const v = scores[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) return false;
  }
  if (!isStringArray(strengths) || !isStringArray(improvements)) return false;
  if (typeof summary !== "string" || !summary) return false;
  return true;
};

const parseRaw = (raw: string): unknown => {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return JSON.parse(cleaned);
  }
  return JSON.parse(cleaned.slice(start, end + 1));
};

export const parseReport = (raw: string): DeveloperReport => {
  let parsed: unknown;
  try {
    parsed = parseRaw(raw);
  } catch {
    parsed = null;
  }
  return normalizeReport(parsed);
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
Weekly commit activity (last 2 weeks, oldest to newest): [${stats.weeklyActivity.join(", ")}]`;
};

export const buildAnalysisPrompt = (
  stats: RepoStats,
  owner: string,
  repo: string
): string => {
  return `${buildRepoContext(stats, owner, repo)}

Analyze this developer's GitHub activity for the repository above and produce a structured developer growth report.

Return a JSON object with exactly this shape (no markdown fences):
{
  "scores": {
    "consistency": <0-100 integer>,
    "codeQuality": <0-100 integer>,
    "collaboration": <0-100 integer>,
    "projectActivity": <0-100 integer>,
    "overall": <0-100 integer, weighted average>
  },
  "strengths": ["<3-4 concise strengths, e.g. strong weekly consistency>"],
  "improvements": ["<3-4 actionable improvements>"],
  "summary": "<2-3 sentence overall summary in second person>"
}

Rules:
- Base every score and insight strictly on the data provided above.
- Consistency reflects regularity of weekly commits across the 2-week window.
- Collaboration reflects PR and contributor activity.
- Code quality reflects commit size patterns implied by the data; be reasonable.
- Improvements must be specific and actionable.
- Do not invent metrics that are not derivable from the data.`;
};

export const buildChatPrompt = (
  question: string,
  stats: RepoStats | null,
  owner: string,
  repo: string,
  report: DeveloperReport | null,
  history: { role: "user" | "assistant"; content: string }[],
  accountContext?: string | null
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
Answer specifically and concisely, citing the developer's real repositories and stats above. Ground every suggestion in the actual data provided; if a specific repo is asked about and it is in the list, reference it directly.`;
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
