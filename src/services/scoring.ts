import { RepoStats } from "./github.js";

export type ScoreKey = "consistency" | "codeQuality" | "collaboration" | "projectActivity";

export interface ScoreResult {
  scores: Record<ScoreKey | "overall", number>;
  breakdown: Record<ScoreKey, string>;
}

// Weights for the overall score. Must sum to 1.
const WEIGHTS: Record<ScoreKey, number> = {
  consistency: 0.3,
  projectActivity: 0.25,
  collaboration: 0.25,
  codeQuality: 0.2,
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// Log curve: 0 -> 0, `target` -> 1, capped at 1. Keeps big repos from dwarfing everyone else.
const logScale = (value: number, target: number) =>
  Math.min(1, Math.log1p(Math.max(0, value)) / Math.log1p(target));

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Deterministic developer scores derived purely from GitHub stats.
 * Same input always yields the same output, so re-running an analysis never
 * changes the numbers — the LLM only writes the narrative around them.
 */
export const computeScores = (stats: RepoStats): ScoreResult => {
  const weeks = stats.weeklyActivity.length ? stats.weeklyActivity : [0];
  const activeWeeks = weeks.filter((w) => w > 0).length;
  const maxWeek = Math.max(...weeks);
  const minWeek = Math.min(...weeks);
  const totalWeekly = weeks.reduce((a, b) => a + b, 0);

  // Consistency: how many weeks had commits, and how evenly they were spread.
  const coverage = activeWeeks / weeks.length;
  const evenness = maxWeek > 0 ? minWeek / maxWeek : 0;
  const consistency = clamp(coverage * 70 + evenness * 30);

  // Project activity: overall throughput, PRs and issues weigh more than a single commit.
  const throughput = stats.commits + stats.pullRequests * 3 + stats.issues * 2;
  const projectActivity = clamp(logScale(throughput, 60) * 100);

  // Collaboration: other people involved + PR-based workflow + issue tracking.
  const contributorScore = logScale(Math.max(0, stats.contributors - 1), 8);
  const prScore = logScale(stats.pullRequests, 6);
  const issueScore = logScale(stats.issues, 6);
  const collaboration = clamp(contributorScore * 45 + prScore * 40 + issueScore * 15);

  // Code quality (workflow proxy): changes go through PRs, commits are spread out
  // rather than dumped in one burst, and the open-issue backlog is under control.
  const prRatio = stats.commits > 0 ? Math.min(1, (stats.pullRequests * 4) / stats.commits) : 0;
  const granularity = totalWeekly > 0 ? Math.min(1, activeWeeks / weeks.length + evenness * 0.5) : 0;
  const backlog = stats.openIssues <= 5 ? 1 : Math.max(0, 1 - Math.log10(stats.openIssues / 5) / 2);
  const hasActivity = stats.commits > 0 || totalWeekly > 0;
  const codeQuality = hasActivity ? clamp(prRatio * 40 + granularity * 35 + backlog * 25) : 0;

  const scores = { consistency, codeQuality, collaboration, projectActivity };
  const overall = clamp(
    (Object.keys(WEIGHTS) as ScoreKey[]).reduce((sum, k) => sum + scores[k] * WEIGHTS[k], 0)
  );

  const breakdown: Record<ScoreKey, string> = {
    consistency: `Commits in ${activeWeeks} of the last ${weeks.length} weeks (${weeks.join(" → ")} per week).`,
    projectActivity: `${plural(stats.commits, "commit")}, ${plural(stats.pullRequests, "PR")} and ${plural(stats.issues, "issue")} in the last 2 weeks.`,
    collaboration: `${plural(stats.contributors, "contributor")}, ${plural(stats.pullRequests, "recent PR")}, ${plural(stats.issues, "recent issue")}.`,
    codeQuality: `${stats.commits > 0 ? `${stats.pullRequests} PRs for ${stats.commits} commits` : "No recent commits"}; ${plural(stats.openIssues, "open issue")} in the backlog.`,
  };

  return { scores: { ...scores, overall }, breakdown };
};
