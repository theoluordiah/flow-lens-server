import { Response } from "express";
import { User } from "../models/User.js";
import { Analysis } from "../models/Analysis.js";
import { getGitHubService } from "../utils/helpers.js";
import { respondToGitHubError } from "../utils/githubErrors.js";
import { AuthRequest } from "../middleware/auth.js";
import { RepoLite, RepoStats } from "../services/github.js";

export const getDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user!.id).select("-accessToken");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const owner = req.query.owner as string | undefined;
    const repo = req.query.repo as string | undefined;

    const response: {
      developer: typeof user;
      selectedRepository: RepoLite | null;
      stats: RepoStats | null;
      report: unknown;
      reportCreatedAt: string | null;
    } = {
      developer: user,
      selectedRepository: null,
      stats: null,
      report: null,
      reportCreatedAt: null,
    };

    if (!owner || !repo) {
      const service = await getGitHubService(req, res);
      if (!service) return;
      const repos = await service.getReposFlat(50);
      if (repos.length === 0) {
        res.json(response);
        return;
      }
      const latest = repos[0];
      response.selectedRepository = latest;

      const [stats, cached] = await Promise.all([
        service.getRepoStats(latest.owner, latest.name),
        Analysis.findOne({
          userId: user._id,
          repoFullName: latest.full_name,
        }).sort({ createdAt: -1 }),
      ]);
      response.stats = stats;
      if (cached) {
        response.report = cached.report;
        response.reportCreatedAt = (cached as unknown as { createdAt: Date }).createdAt.toISOString();
      }
      res.json(response);
      return;
    }

    const service = await getGitHubService(req, res);
    if (!service) return;

    const repoFullName = `${owner}/${repo}`;
    const [lite, stats, cached] = await Promise.all([
      service.getRepoLite(owner, repo),
      service.getRepoStats(owner, repo),
      Analysis.findOne({ userId: user._id, repoFullName }).sort({ createdAt: -1 }),
    ]);

    response.selectedRepository = lite;
    response.stats = stats;
    if (cached) {
      response.report = cached.report;
      response.reportCreatedAt = (cached as unknown as { createdAt: Date }).createdAt.toISOString();
    }

    res.json(response);
  } catch (err: unknown) {
    console.error(err);
    if (respondToGitHubError(res, err)) return;
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: "Failed to load dashboard" });
  }
};
