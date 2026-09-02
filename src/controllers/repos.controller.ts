import { Response } from "express";
import { getGitHubService } from "../utils/helpers.js";
import { respondToGitHubError } from "../utils/githubErrors.js";
import { AuthRequest } from "../middleware/auth.js";

export const listRepos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const service = await getGitHubService(req, res);
    if (!service) return;

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const perPage = Math.min(
      100,
      Math.max(1, parseInt(req.query.perPage as string, 10) || 30)
    );
    const search = req.query.search as string | undefined;

    const result = await service.getRepos({ page, perPage, search });
    res.json(result);
  } catch (err) {
    console.error(err);
    if (respondToGitHubError(res, err)) return;
    res.status(500).json({ error: "Failed to fetch repositories" });
  }
};

export const getRepoDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const service = await getGitHubService(req, res);
    if (!service) return;
    const { owner, repo } = req.params as { owner: string; repo: string };
    const details = await service.getRepoDetails(owner, repo);
    res.json(details);
  } catch (err: unknown) {
    console.error(err);
    if (respondToGitHubError(res, err)) return;
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: "Failed to fetch repository" });
  }
};

export const getRepoStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const service = await getGitHubService(req, res);
    if (!service) return;
    const { owner, repo } = req.params as { owner: string; repo: string };
    const stats = await service.getRepoStats(owner, repo);
    res.json({ stats });
  } catch (err: unknown) {
    console.error(err);
    if (respondToGitHubError(res, err)) return;
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: "Failed to fetch repository stats" });
  }
};
