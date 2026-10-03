import { Response } from "express";
import { ProfileConfig } from "../models/ProfileConfig.js";
import { ContributionCalendar } from "../services/github.js";
import { getGitHubService } from "../utils/helpers.js";
import { respondToGitHubError } from "../utils/githubErrors.js";
import { validateProfile } from "../utils/profileValidation.js";
import { AuthRequest } from "../middleware/auth.js";

const CONTRIBUTIONS_TTL_MS = 15 * 60 * 1000;

// The calendar changes slowly and the builder re-renders often; a short per-user cache
// keeps us well inside GitHub's GraphQL rate limit.
const contributionsCache = new Map<string, { at: number; data: ContributionCalendar }>();

export const getContributions = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const cached = contributionsCache.get(userId);
  if (cached && Date.now() - cached.at < CONTRIBUTIONS_TTL_MS) {
    res.json({ ...cached.data, fetchedAt: new Date(cached.at).toISOString(), cached: true });
    return;
  }

  try {
    const service = await getGitHubService(req, res);
    if (!service) return;
    const data = await service.getContributionCalendar();
    const at = Date.now();
    contributionsCache.set(userId, { at, data });
    res.json({ ...data, fetchedAt: new Date(at).toISOString(), cached: false });
  } catch (err) {
    if (respondToGitHubError(res, err)) return;
    const status = (err as { status?: number })?.status;
    if (status === 403 || status === 429) {
      res.status(429).json({ error: "GitHub rate limit reached. Try again in a few minutes." });
      return;
    }
    console.error("[Profile] Contribution calendar failed:", err);
    res.status(502).json({ error: "GitHub did not return contribution data." });
  }
};

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await ProfileConfig.findOne({ userId: req.user!.id });
    res.json({ profile: doc?.profile ?? null, updatedAt: doc?.updatedAt ?? null });
  } catch (err) {
    console.error("[Profile] Load failed:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
};

export const saveProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = validateProfile(req.body?.profile);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  try {
    const doc = await ProfileConfig.findOneAndUpdate(
      { userId: req.user!.id },
      { $set: { profile: result.profile } },
      { new: true, upsert: true }
    );
    res.json({ profile: doc.profile, updatedAt: doc.updatedAt });
  } catch (err) {
    console.error("[Profile] Save failed:", err);
    res.status(500).json({ error: "Failed to save profile" });
  }
};

export const deleteProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ProfileConfig.deleteOne({ userId: req.user!.id });
    res.status(204).end();
  } catch (err) {
    console.error("[Profile] Delete failed:", err);
    res.status(500).json({ error: "Failed to delete profile" });
  }
};
