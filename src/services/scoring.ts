import { RepoStats, WINDOW_WEEKS } from "./github.js";

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
  const totalWeekly = weeks.reduce((a, b) => a + b, 0);

  // Evenness: 1 when every week has the same number of commits, falling toward 0
  // as activity bunches into a few weeks (based on the coefficient of variation).
  const mean = totalWeekly / weeks.length;
  const stdDev = Math.sqrt(weeks.reduce((sum, w) => sum + (w - mean) ** 2, 0) / weeks.length);
  const evenness = mean > 0 ? Math.max(0, 1 - stdDev / mean / 2) : 0;

  // Consistency: how many weeks had commits, and how evenly they were spread.
  const coverage = activeWeeks / weeks.length;
  const consistency = clamp(coverage * 70 + evenness * 30);

  // Targets below are what a healthy, active repo does over the WINDOW_WEEKS window.
  // Project activity: overall throughput, PRs and issues weigh more than a single commit.
  const throughput = stats.commits + stats.pullRequests * 3 + stats.issues * 2;
  const projectActivity = clamp(logScale(throughput, 150) * 100);

  // Collaboration: other people involved + PR-based workflow + issue tracking.
  const contributorScore = logScale(Math.max(0, stats.contributors - 1), 8);
  const prScore = logScale(stats.pullRequests, 12);
  const issueScore = logScale(stats.issues, 12);
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
    projectActivity: `${plural(stats.commits, "commit")}, ${plural(stats.pullRequests, "PR")} and ${plural(stats.issues, "issue")} in the last ${WINDOW_WEEKS} weeks.`,
    collaboration: `${plural(stats.contributors, "contributor")}, ${plural(stats.pullRequests, "recent PR")}, ${plural(stats.issues, "recent issue")}.`,
    codeQuality: `${stats.commits > 0 ? `${stats.pullRequests} PRs for ${stats.commits} commits` : "No recent commits"}; ${plural(stats.openIssues, "open issue")} in the backlog.`,
  };

  return { scores: { ...scores, overall }, breakdown };
};

export const SCORE_LABELS: Record<ScoreKey, string> = {
  consistency: "Consistency",
  codeQuality: "Code quality",
  collaboration: "Collaboration",
  projectActivity: "Project activity",
};

export interface GrowthStep {
  id: string;
  /** The score this step moves the most. */
  area: ScoreKey;
  action: string;
  detail: string;
  overallFrom: number;
  overallTo: number;
  changes: { key: ScoreKey; from: number; to: number }[];
}

export interface GrowthPlan {
  weakest: { key: ScoreKey; score: number };
  steps: GrowthStep[];
  /** Overall score if every step is done in the same window. */
  combinedOverall: number;
}

type Candidate = {
  id: string;
  action: string;
  detail: string;
  apply: (s: RepoStats) => RepoStats;
};

const candidates = (stats: RepoStats): Candidate[] => {
  const weeks = stats.weeklyActivity.length ? stats.weeklyActivity : [];
  const activeWeeks = weeks.filter((w) => w > 0);
  const emptyWeeks = weeks.length - activeWeeks.length;
  const weeklyTotal = weeks.reduce((a, b) => a + b, 0);
  const list: Candidate[] = [];

  if (emptyWeeks > 0 && weeks.length) {
    // Same amount of work, spread evenly. Only adds commits when there are fewer than one per week.
    const total = Math.max(weeklyTotal, weeks.length);
    const perWeek = Math.floor(total / weeks.length);
    const spread = weeks.map((_, i) => perWeek + (i < total % weeks.length ? 1 : 0));
    list.push({
      id: "steady-weeks",
      action: `Commit in every week, not just ${activeWeeks.length} of ${weeks.length}`,
      detail:
        weeklyTotal >= weeks.length
          ? `You made ${plural(weeklyTotal, "commit")} but they landed in only ${plural(activeWeeks.length, "week")}. Spreading the same amount of work across every week, about ${plural(perWeek, "commit")} a week, needs no extra effort, just smaller pieces more often.`
          : `You had ${plural(emptyWeeks, "week")} with no commits at all. One small commit in each of those weeks keeps the project visibly alive.`,
      apply: (s) => ({
        ...s,
        commits: s.commits + (total - weeklyTotal),
        weeklyActivity: spread,
      }),
    });
  }

  list.push({
    id: "pull-requests",
    action: "Ship your next 4 changes through pull requests",
    detail:
      stats.pullRequests === 0
        ? "You pushed straight to the main branch with no pull requests in this window. Opening a pull request for each change, even when you merge it yourself, gives every change a written description and a place for feedback."
        : `You opened ${plural(stats.pullRequests, "pull request")} for ${plural(stats.commits, "commit")}. Putting four more changes through pull requests, even ones you merge yourself, gives each change a written description and a place for feedback.`,
    apply: (s) => ({ ...s, pullRequests: s.pullRequests + 4 }),
  });

  list.push({
    id: "issues",
    action: "Write an issue before you start each piece of work",
    detail: `You opened ${plural(stats.issues, "issue")} in this window. Writing four short issues for work you plan to do shows what you are working on and why, and gives other people a way in.`,
    apply: (s) => ({ ...s, issues: s.issues + 4 }),
  });

  list.push({
    id: "reviewer",
    action: "Bring one more person into the project",
    detail:
      stats.contributors <= 1
        ? "Right now you are the only contributor. Asking one friend or colleague to review a pull request or fix a small issue is the single biggest change to how collaborative the project looks."
        : `You have ${plural(stats.contributors, "contributor")}. Inviting one more person to review or pick up a small issue widens the project beyond its current group.`,
    apply: (s) => ({ ...s, contributors: s.contributors + 1 }),
  });

  if (stats.openIssues > 5) {
    list.push({
      id: "backlog",
      action: `Bring your open issues down from ${stats.openIssues} to 5`,
      detail: `There are ${plural(stats.openIssues, "open issue")}. Closing the ones that are done or out of date, and labelling the rest, makes it clear which problems are real.`,
      apply: (s) => ({ ...s, openIssues: 5 }),
    });
  }

  return list;
};

const KEYS = Object.keys(WEIGHTS) as ScoreKey[];

/**
 * Tries each concrete action against the real scoring formula and keeps the ones
 * that move the overall score the most. Nothing here is guessed by the LLM.
 */
export const buildGrowthPlan = (stats: RepoStats, maxSteps = 3): GrowthPlan => {
  const base = computeScores(stats).scores;
  const weakestKey = KEYS.reduce((a, b) => (base[b] < base[a] ? b : a));

  const ranked = candidates(stats)
    .map((c) => {
      const next = computeScores(c.apply(stats)).scores;
      const changes = KEYS.filter((k) => next[k] !== base[k]).map((k) => ({
        key: k,
        from: base[k],
        to: next[k],
      }));
      const area = changes.length
        ? changes.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a)).key
        : weakestKey;
      return { candidate: c, step: { id: c.id, area, action: c.action, detail: c.detail, overallFrom: base.overall, overallTo: next.overall, changes } };
    })
    .filter(({ step }) => step.overallTo > step.overallFrom)
    .sort((a, b) => b.step.overallTo - a.step.overallTo);

  const chosen = ranked.slice(0, maxSteps);
  const combined = chosen.reduce((s, { candidate }) => candidate.apply(s), stats);

  return {
    weakest: { key: weakestKey, score: base[weakestKey] },
    steps: chosen.map(({ step }) => step),
    combinedOverall: chosen.length ? computeScores(combined).scores.overall : base.overall,
  };
};
