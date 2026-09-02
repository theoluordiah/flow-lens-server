import { Response } from "express";
import { User } from "../models/User.js";
import { AccountStatsCache, IAccountStatsCache, CachedRepo } from "../models/AccountStatsCache.js";
import { RepoStatsCache } from "../models/RepoStatsCache.js";
import { GitHubService, RepoLite, RepoStats } from "../services/github.js";
import { AuthRequest } from "../middleware/auth.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const REPO_STATS_TTL_MS = 60 * 60 * 1000; // 1 hour per-repo
const MAX_AGGREGATED_REPOS = 30; // cap GitHub calls per account refresh

interface AccountStats {
  commits: number;
  pullRequests: number;
  issues: number;
  contributors: number;
  openIssues: number;
  stars: number;
  forks: number;
  followers: number;
  repoCount: number;
  languages: Record<string, number>;
  languageRepos: Record<string, number>;
  weeklyActivity: number[];
}

const sumWeekly = (weeklyActivity: number[][], weekCount: number): number[] => {
  const totals = new Array<number>(weekCount).fill(0);
  for (const activity of weeklyActivity) {
    for (let i = 0; i < activity.length; i++) {
      totals[i] = (totals[i] ?? 0) + (activity[i] ?? 0);
    }
  }
  return totals;
};

const toCachedRepo = (repo: RepoLite): CachedRepo => ({
  full_name: repo.full_name,
  name: repo.name,
  owner: repo.owner,
  description: repo.description,
  language: repo.language,
  stars: repo.stars,
  forks: repo.forks,
  openIssues: repo.openIssues,
  defaultBranch: repo.defaultBranch,
  private: repo.private,
  htmlUrl: repo.htmlUrl,
  updatedAt: repo.updatedAt,
});

const aggregate = (
  repos: RepoLite[],
  perRepoStats: RepoStats[]
): AccountStats => {
  const weekCount = Math.max(
    0,
    ...perRepoStats.map((s) => s.weeklyActivity.length),
    0
  );

  const stats: AccountStats = {
    commits: 0,
    pullRequests: 0,
    issues: 0,
    contributors: 0,
    openIssues: 0,
    stars: repos.reduce((a, r) => a + r.stars, 0),
    forks: repos.reduce((a, r) => a + r.forks, 0),
    followers: 0,
    repoCount: repos.length,
    languages: {},
    languageRepos: {},
    weeklyActivity: [],
  };

  const languageCount: Record<string, number> = {};
  for (const repo of repos) {
    const lang = repo.language;
    if (lang) languageCount[lang] = (languageCount[lang] ?? 0) + 1;
  }
  stats.languages = languageCount;
  stats.languageRepos = { ...languageCount };

  for (const s of perRepoStats) {
    stats.commits += s.commits || 0;
    stats.pullRequests += s.pullRequests || 0;
    stats.issues += s.issues || 0;
    stats.contributors += s.contributors || 0;
    stats.openIssues += s.openIssues || 0;
  }

  stats.weeklyActivity = sumWeekly(
    perRepoStats.map((s) => s.weeklyActivity),
    weekCount
  );

  return stats;
};

// Deduplicate in-flight aggregations per user so a double-fire doesn't double the API cost.
const inFlight: Map<string, Promise<IAccountStatsCache | null>> = new Map();

const computeAndCache = async (
  userId: string,
  service: GitHubService
): Promise<IAccountStatsCache | null> => {
  let repos: RepoLite[];
  try {
    repos = await service.paginateAllRepos(MAX_AGGREGATED_REPOS);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    const isRateLimit = status === 403 || status === 429;
    if (isRateLimit) {
      // Fall back to whatever we have cached, even if stale.
      const stale = await AccountStatsCache.findOne({ userId });
      if (stale) {
        console.warn(
          "[AccountStats] GitHub rate limited; serving stale cache."
        );
        return stale;
      }
      console.error("[AccountStats] GitHub rate limited, no cache available.");
      return null;
    }
    console.error("[AccountStats] GitHub API failed:", err);
    return null;
  }

  if (repos.length === 0) {
    return AccountStatsCache.findOneAndUpdate(
      { userId },
      {
        $set: {
          stats: {
            commits: 0,
            pullRequests: 0,
            issues: 0,
            contributors: 0,
            openIssues: 0,
            stars: 0,
            forks: 0,
            followers: 0,
            repoCount: 0,
            languages: {},
            languageRepos: {},
            weeklyActivity: [],
          },
          repos: [],
        },
      },
      { new: true, upsert: true }
    );
  }

  const emptyStats: RepoStats = {
    commits: 0,
    pullRequests: 0,
    issues: 0,
    contributors: 0,
    openIssues: 0,
    stars: 0,
    forks: 0,
    languages: {},
    weeklyActivity: [],
  };

  const perRepoStats: RepoStats[] = [];
  const CONCURRENCY = 3;
  let index = 0;
  const worker = async (): Promise<void> => {
    while (index < repos.length) {
      const repoIndex = index;
      index += 1;
      const repo = repos[repoIndex];
      const fullName = repo.full_name;
      try {
        const cached = await RepoStatsCache.findOne({
          userId,
          repoFullName: fullName,
        });
        if (
          cached &&
          Date.now() - new Date(cached.updatedAt).getTime() < REPO_STATS_TTL_MS
        ) {
          perRepoStats[repoIndex] = { ...cached.repoStats } as RepoStats;
          continue;
        }

        const fetched = await service.getRepoStats(repo.owner, repo.name);
        perRepoStats[repoIndex] = fetched;
        await RepoStatsCache.findOneAndUpdate(
          { userId, repoFullName: fullName },
          { $set: { repoStats: fetched } },
          { new: true, upsert: true }
        );
      } catch (err) {
        console.error(
          `[AccountStats] Skipping repo ${repo.full_name}:`,
          err
        );
        perRepoStats[repoIndex] = { ...emptyStats };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, repos.length) }, () => worker())
  );

  const stats = aggregate(repos, perRepoStats);

  try {
    stats.followers = await service.getFollowers();
  } catch (err) {
    console.error("[AccountStats] Failed to fetch followers:", err);
  }

  return AccountStatsCache.findOneAndUpdate(
    { userId },
    {
      $set: {
        stats,
        repos: repos.map(toCachedRepo),
      },
    },
    { new: true, upsert: true }
  );
};

export const getAccountStats = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const user = await User.findById(req.user!.id).select("-accessToken");
    if (!user || !req.user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userWithToken = await User.findById(req.user.id);
    if (!userWithToken) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userId = user._id.toString();
    void userWithToken;

    // Fresh cache hit.
    const cached = await AccountStatsCache.findOne({ userId });
    if (
      cached &&
      Date.now() - new Date(cached.updatedAt).getTime() < CACHE_TTL_MS
    ) {
      res.json({
        developer: user,
        stats: cached.stats,
        repos: cached.repos,
        cached: true,
      });
      return;
    }

    // Reuse an in-flight aggregation for this user instead of spawning a second one.
    let task = inFlight.get(userId);
    if (!task) {
      const service = new GitHubService(userWithToken);
      task = computeAndCache(userId, service);
      inFlight.set(userId, task);
      task.finally(() => inFlight.delete(userId)).catch(() => undefined);
    }

    const fresh = await task;
    if (!fresh) {
      res
        .status(429)
        .json({
          error:
            "GitHub API rate limit reached and no cached stats are available. Try again later.",
        });
      return;
    }

    res.json({
      developer: user,
      stats: fresh.stats,
      repos: fresh.repos,
      cached: false,
    });
  } catch (err) {
    console.error("[AccountStats] Server error:", err);
    res.status(500).json({ error: "Failed to load account stats" });
  }
};