import { Octokit } from "@octokit/rest";
import { IUser } from "../models/User.js";

/** Length of the activity window used for all repo stats and scoring. */
export const WINDOW_WEEKS = 6;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface RepoStats {
  commits: number;
  pullRequests: number;
  issues: number;
  contributors: number;
  languages: Record<string, number>;
  weeklyActivity: number[];
  stars: number;
  forks: number;
  openIssues: number;
}

export interface RepoFile {
  path: string;
  sha: string;
  size: number;
}

export interface RepoTree {
  /** Commit the tree was read at; empty for a repository with no commits. */
  sha: string;
  branch: string;
  files: RepoFile[];
  truncated: boolean;
}

export interface RepoLite {
  id: string;
  full_name: string;
  name: string;
  owner: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
  updatedAt: string;
}

export interface ReposResult {
  repos: RepoLite[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    hasNextPage: boolean;
  };
}

const getOctokit = (accessToken: string) => new Octokit({ auth: accessToken });

export class GitHubService {
  private octokit: Octokit;

  constructor(private user: IUser) {
    this.octokit = getOctokit(user.accessToken);
  }

  private mapRepo(r: {
    id?: number;
    full_name?: string | null;
    name?: string;
    owner?: { login?: string } | null;
    description?: string | null;
    language?: string | null;
    stargazers_count?: number;
    forks_count?: number;
    open_issues_count?: number;
    default_branch?: string | null;
    private?: boolean;
    html_url?: string;
    updated_at?: string | null;
  }): RepoLite {
    return {
      id: r.id ? String(r.id) : "",
      full_name: r.full_name || "",
      name: r.name || "",
      owner: r.owner?.login || "",
      description: r.description ?? null,
      language: r.language ?? null,
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      openIssues: r.open_issues_count ?? 0,
      defaultBranch: r.default_branch || "main",
      private: r.private ?? false,
      htmlUrl: r.html_url || "",
      updatedAt: r.updated_at || "",
    };
  }

  async getRepos(opts?: {
    page?: number;
    perPage?: number;
    search?: string;
    max?: number;
  }): Promise<ReposResult> {
    const page = opts?.page ?? 1;
    const perPage = opts?.perPage ?? 30;
    const max = opts?.max;

    const { data, headers } = await this.octokit.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: Math.min(perPage, 100),
      page,
    });

    let repos = data.map((r) => this.mapRepo(r));

    if (opts?.search) {
      const q = opts.search.toLowerCase();
      repos = repos.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.full_name.toLowerCase().includes(q)
      );
    }

    const total = this.parsePageCount(headers.link);
    const hasNextPage = max ? page * perPage < Math.min(max, total || Infinity) : page * perPage < (total || repos.length);

    let items = repos;
    if (max) {
      const stop = max - (page - 1) * perPage;
      if (stop <= 0) items = [];
      else items = repos.slice(0, stop);
    }

    return {
      repos: items,
      pagination: {
        page,
        perPage,
        total: max ? Math.min(total || items.length, max) : total,
        hasNextPage,
      },
    };
  }

  async getReposFlat(max = 100): Promise<RepoLite[]> {
    const result = await this.getRepos({ page: 1, perPage: Math.min(max, 100), max });
    return result.repos;
  }

  async paginateAllRepos(max = 100): Promise<RepoLite[]> {
    const all: RepoLite[] = [];
    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data } = await this.octokit.repos.listForAuthenticatedUser({
        sort: "updated",
        per_page: 100,
        page,
        affiliation: "owner,collaborator,organization_member",
      });
      all.push(...data.map((r) => this.mapRepo(r)));
      if (data.length < 100 || all.length >= max) break;
      page += 1;
    }
    return all.slice(0, max);
  }

  async getRepoLite(owner: string, repo: string): Promise<RepoLite> {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return this.mapRepo(data);
  }

  async getFollowers(): Promise<number> {
    const { data } = await this.octokit.users.getAuthenticated();
    return data?.followers ?? 0;
  }

  async getRepoDetails(owner: string, repo: string) {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return this.mapRepo(data);
  }

  /** Every file on the default branch, pinned to the commit it was read at. */
  async getRepoTree(owner: string, repo: string): Promise<RepoTree> {
    const { data: r } = await this.octokit.repos.get({ owner, repo });
    const branch = r.default_branch;
    let sha: string;
    try {
      const { data: b } = await this.octokit.repos.getBranch({ owner, repo, branch });
      sha = b.commit.sha;
    } catch (err) {
      // Empty repositories have no branch to read.
      const status = (err as { status?: number })?.status;
      if (status === 404 || status === 409) return { sha: "", branch, files: [], truncated: false };
      throw err;
    }
    const { data: tree } = await this.octokit.git.getTree({ owner, repo, tree_sha: sha, recursive: "true" });
    const files = tree.tree
      .filter((t) => t.type === "blob" && t.path && t.sha)
      .map((t) => ({ path: t.path!, sha: t.sha!, size: t.size ?? 0 }));
    return { sha, branch, files, truncated: tree.truncated };
  }

  async getFileText(owner: string, repo: string, fileSha: string): Promise<string> {
    const { data } = await this.octokit.git.getBlob({ owner, repo, file_sha: fileSha });
    return Buffer.from(data.content, data.encoding === "base64" ? "base64" : "utf8").toString("utf8");
  }

  private async countRecentItems(
    fetchPage: (page: number) => Promise<Array<{ created_at: string }>>,
    since: Date
  ): Promise<number> {
    let count = 0;
    let page = 1;
    while (true) {
      const items = await fetchPage(page);
      for (const item of items) {
        if (new Date(item.created_at) >= since) {
          count++;
        } else {
          return count;
        }
      }
      if (items.length < 100) break;
      page++;
    }
    return count;
  }

  async getRepoStats(owner: string, repo: string): Promise<RepoStats> {
    const windowStart = new Date(Date.now() - WINDOW_WEEKS * WEEK_MS);

    const [repoRes, contributorsRes, languagesRes] = await Promise.all([
      this.octokit.repos.get({ owner, repo }),
      this.octokit.repos.listContributors({ owner, repo, per_page: 100 }).catch(() => ({ data: [] })),
      this.octokit.repos.listLanguages({ owner, repo }).catch(() => ({ data: {} })),
    ]);

    const [recentPRs, recentIssues, { commits: recentCommits, weeklyActivity }] = await Promise.all([
      this.countRecentItems(
        (page) => this.octokit.pulls.list({ owner, repo, state: "all", sort: "created", direction: "desc", per_page: 100, page }).then((r) => r.data),
        windowStart
      ).catch(() => 0),
      this.countRecentItems(
        (page) => this.octokit.issues.list({ owner, repo, state: "all", sort: "created", direction: "desc", per_page: 100, page }).then((r) => r.data),
        windowStart
      ).catch(() => 0),
      this.getCommitActivity(owner, repo, windowStart),
    ]);

    const totalBytes = Object.values(languagesRes.data ?? {}).reduce((a, b) => a + b, 0);
    const languagePercentages: Record<string, number> = {};
    if (totalBytes > 0) {
      for (const [lang, bytes] of Object.entries(languagesRes.data ?? {})) {
        languagePercentages[lang] = Math.round((bytes / totalBytes) * 100);
      }
    }

    return {
      commits: recentCommits,
      pullRequests: recentPRs,
      issues: recentIssues,
      contributors:
        Array.isArray(contributorsRes.data) ? contributorsRes.data.length : 0,
      languages: languagePercentages,
      weeklyActivity,
      stars: repoRes.data.stargazers_count ?? 0,
      forks: repoRes.data.forks_count ?? 0,
      openIssues: repoRes.data.open_issues_count ?? 0,
    };
  }

  /**
   * Commit count and per-week buckets (oldest → newest) for the activity window.
   * Small repos need a single request; busy repos fall back to one request per week.
   */
  private async getCommitActivity(
    owner: string,
    repo: string,
    windowStart: Date
  ): Promise<{ commits: number; weeklyActivity: number[] }> {
    const empty = { commits: 0, weeklyActivity: new Array<number>(WINDOW_WEEKS).fill(0) };
    try {
      const { data } = await this.octokit.repos.listCommits({
        owner,
        repo,
        since: windowStart.toISOString(),
        per_page: 100,
      });

      if (data.length < 100) {
        const weeks = empty.weeklyActivity.slice();
        const now = Date.now();
        for (const c of data) {
          const date = c.commit.author?.date ?? c.commit.committer?.date;
          if (!date) continue;
          const weeksAgo = Math.floor((now - new Date(date).getTime()) / WEEK_MS);
          const idx = WINDOW_WEEKS - 1 - Math.min(Math.max(weeksAgo, 0), WINDOW_WEEKS - 1);
          weeks[idx]++;
        }
        return { commits: data.length, weeklyActivity: weeks };
      }

      const [commits, weeklyActivity] = await Promise.all([
        this.octokit.repos
          .listCommits({ owner, repo, per_page: 1, since: windowStart.toISOString() })
          .then((r) => this.parsePageCount(r.headers?.link)),
        this.getWeeklyActivity(owner, repo),
      ]);
      return { commits, weeklyActivity };
    } catch {
      return empty;
    }
  }

  private async getWeeklyActivity(owner: string, repo: string): Promise<number[]> {
    const now = Date.now();
    return Promise.all(
      Array.from({ length: WINDOW_WEEKS }, async (_, idx) => {
        const weeksAgo = WINDOW_WEEKS - 1 - idx;
        try {
          const { data } = await this.octokit.repos.listCommits({
            owner,
            repo,
            since: new Date(now - (weeksAgo + 1) * WEEK_MS).toISOString(),
            until: new Date(now - weeksAgo * WEEK_MS).toISOString(),
            per_page: 100,
          });
          return Array.isArray(data) ? data.length : 0;
        } catch {
          return 0;
        }
      })
    );
  }

  private parsePageCount(linkHeader?: string): number {
    if (!linkHeader) return 0;
    const match = linkHeader.match(/page=(\d+)>;\s*rel="last"/);
    if (match) return parseInt(match[1], 10);

    const perPageMatch = linkHeader.match(/per_page=(\d+)>;\s*rel="last"/);
    if (perPageMatch) {
      const perPage = parseInt(perPageMatch[1], 10);
      const prevMatch = linkHeader.match(/page=(\d+)>;\s*rel="prev"/);
      const lastPage = prevMatch ? parseInt(prevMatch[1], 10) + 1 : perPage;
      return lastPage;
    }
    return 0;
  }
}
