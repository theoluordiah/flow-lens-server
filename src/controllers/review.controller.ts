import { Response } from "express";
import { CodeReview, ICodeReview } from "../models/CodeReview.js";
import { getGitHubService } from "../utils/helpers.js";
import { respondToGitHubError } from "../utils/githubErrors.js";
import { parseTone } from "../services/analyzer.js";
import { runCodeReview, fingerprintOf, ReviewFinding } from "../services/codeReview.js";
import { DismissedFinding, dismissedSet } from "../models/DismissedFinding.js";
import { AuthRequest } from "../middleware/auth.js";

const toJson = (r: ICodeReview, cached: boolean, dismissed: Set<string>) => ({
  sha: r.sha,
  branch: r.branch,
  tone: r.tone,
  summary: r.summary,
  aiReviewed: r.aiReviewed,
  filesReviewed: r.filesReviewed,
  findings: (r.findings as ReviewFinding[]).map((f) => {
    const fingerprint = f.fingerprint ?? fingerprintOf(f);
    return { ...f, fingerprint, dismissed: dismissed.has(fingerprint) };
  }),
  facts: r.facts,
  createdAt: r.createdAt,
  cached,
});

export const getCodeReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params as { owner: string; repo: string };
    const tone = parseTone(req.query.tone);
    const review = await CodeReview.findOne({
      userId: req.user!.id,
      repoFullName: `${owner}/${repo}`,
      tone,
    }).sort({ createdAt: -1 });
    if (!review) {
      res.status(404).json({ error: "No code review yet for this repository" });
      return;
    }
    res.json(toJson(review, true, await dismissedSet(req.user!.id, `${owner}/${repo}`)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load code review" });
  }
};

export const generateCodeReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params as { owner: string; repo: string };
    const repoFullName = `${owner}/${repo}`;
    const tone = parseTone(req.query.tone ?? req.body?.tone);
    const refresh = req.query.refresh === "true" || req.body?.refresh === true;

    const service = await getGitHubService(req, res);
    if (!service) return;

    const tree = await service.getRepoTree(owner, repo);

    // Same commit and tone means the same code, so reuse the saved review.
    if (!refresh && tree.sha) {
      const cached = await CodeReview.findOne({ userId: req.user!.id, repoFullName, tone, sha: tree.sha }).sort({
        createdAt: -1,
      });
      if (cached) {
        res.json(toJson(cached, true, await dismissedSet(req.user!.id, repoFullName)));
        return;
      }
    }

    console.log(`[CodeReview] Reading ${repoFullName} at ${tree.sha.slice(0, 7) || "empty"} (${tone})...`);
    const result = await runCodeReview(service, owner, repo, tone, tree);
    console.log(
      `[CodeReview] ${result.findings.length} findings from ${result.filesReviewed.length} files (AI ${result.aiReviewed ? "ok" : "skipped"}).`
    );

    const review = await CodeReview.create({ userId: req.user!.id, repoFullName, tone, ...result });
    res.json(toJson(review, false, await dismissedSet(req.user!.id, repoFullName)));
  } catch (err) {
    console.error("[CodeReview] Error:", err);
    if (respondToGitHubError(res, err)) return;
    res.status(500).json({ error: "Failed to review the code" });
  }
};

/** Marks a finding as not a real issue, or brings it back. Remembered for future reviews of this repo. */
export const setFindingDismissed = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params as { owner: string; repo: string };
    const { fingerprint, dismissed } = (req.body ?? {}) as { fingerprint?: unknown; dismissed?: unknown };
    if (typeof fingerprint !== "string" || !fingerprint || fingerprint.length > 500) {
      res.status(400).json({ error: "fingerprint is required" });
      return;
    }
    const key = { userId: req.user!.id, repoFullName: `${owner}/${repo}`, fingerprint };
    if (dismissed === false) {
      await DismissedFinding.deleteOne(key);
    } else {
      await DismissedFinding.updateOne(key, { $setOnInsert: key }, { upsert: true });
    }
    res.json({ fingerprint, dismissed: dismissed !== false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update the finding" });
  }
};
