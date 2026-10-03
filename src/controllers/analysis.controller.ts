import { Response } from "express";
import crypto from "crypto";
import { Analysis } from "../models/Analysis.js";
import { getGitHubService } from "../utils/helpers.js";
import { respondToGitHubError } from "../utils/githubErrors.js";
import {
  buildAnalysisPrompt,
  parseNarrative,
  fallbackNarrative,
  parseTone,
  ReportNarrative,
  ReportTone,
  DeveloperReport,
} from "../services/analyzer.js";
import { computeScores, buildGrowthPlan, GrowthPlan, ScoreResult } from "../services/scoring.js";
import { groqChat } from "../services/groq.js";
import { AuthRequest } from "../middleware/auth.js";
import { config } from "../config/keys.js";

const generateNarrative = async (
  prompt: string,
  result: ScoreResult,
  plan: GrowthPlan,
  tone: ReportTone
): Promise<ReportNarrative> => {
  try {
    const narrative = parseNarrative(await groqChat(prompt, true, tone));
    if (narrative) return narrative;

    const retryPrompt = `${prompt}

Your previous response was not valid JSON with the exact required structure. Respond with ONLY valid JSON matching the exact shape described above (headline string, strengths and improvements as non-empty arrays of strings, and a summary string). No markdown, no commentary.`;
    const retry = parseNarrative(await groqChat(retryPrompt, true, tone));
    if (retry) return retry;
  } catch (err) {
    console.error("[Analysis] Groq failed, using fallback narrative:", err);
  }
  // Never fail an analysis because of the LLM — scores are already computed.
  return fallbackNarrative(result, plan);
};

// Analyses created before `tone` existed have no tone field; treat them as mentor.
const toneFilter = (tone: ReportTone) =>
  tone === "mentor" ? { tone: { $in: ["mentor", null] } } : { tone };

const findLatest = (userId: string, repoFullName: string, tone: ReportTone) => {
  const filter: Record<string, unknown> = { userId, repoFullName, ...toneFilter(tone) };
  return Analysis.findOne(filter).sort({ createdAt: -1 });
};

export const getCachedAnalysis = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { owner, repo } = req.params as { owner: string; repo: string };
    const tone = parseTone(req.query.tone);
    const analysis = await findLatest(req.user!.id, `${owner}/${repo}`, tone);

    if (!analysis) {
      res.status(404).json({ error: "No analysis found for this repository" });
      return;
    }
    res.json({
      report: analysis.report,
      repoStats: analysis.repoStats,
      tone: analysis.tone ?? "mentor",
      createdAt: analysis.createdAt,
    });
  } catch (err) {
    console.error(err);
    if (respondToGitHubError(res, err)) return;
    res.status(500).json({ error: "Failed to fetch analysis" });
  }
};

export const generateAnalysis = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { owner, repo } = req.params as { owner: string; repo: string };
    const repoFullName = `${owner}/${repo}`;
    const tone = parseTone(req.query.tone ?? req.body?.tone);
    const refresh = req.query.refresh === "true" || req.body?.refresh === true;

    if (!refresh) {
      const cached = await findLatest(req.user!.id, repoFullName, tone);
      if (cached) {
        res.json({ report: cached.report, repoStats: cached.repoStats, tone, cached: true });
        return;
      }
    }

    const service = await getGitHubService(req, res);
    if (!service) return;

    console.log(`[Analysis] Fetching stats for ${repoFullName}...`);
    const stats = await service.getRepoStats(owner, repo);
    const result = computeScores(stats);
    const growthPlan = buildGrowthPlan(stats);
    console.log(`[Analysis] Scores computed (overall ${result.scores.overall}). Calling Groq (${tone})...`);
    const narrative = await generateNarrative(
      buildAnalysisPrompt(stats, owner, repo, result, tone, growthPlan),
      result,
      growthPlan,
      tone
    );
    console.log(`[Analysis] Report generated.`);

    const report: DeveloperReport = {
      scores: result.scores,
      breakdown: result.breakdown,
      ...narrative,
      growthPlan,
    };

    const analysis = await Analysis.create({
      userId: req.user!.id,
      repoFullName,
      tone,
      report,
      repoStats: stats,
    });

    res.json({ report: analysis.report, repoStats: analysis.repoStats, tone, cached: false });
  } catch (err) {
    console.error(`[Analysis] Error generating analysis:`, err);
    if (respondToGitHubError(res, err)) return;
    res.status(500).json({ error: "Failed to generate analysis" });
  }
};

/**
 * Opt-in: makes the latest analysis for a repo publicly viewable via an
 * unguessable slug. Nothing is public until the user calls this.
 */
export const shareAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params as { owner: string; repo: string };
    const tone = parseTone(req.query.tone ?? req.body?.tone);
    const analysis = await findLatest(req.user!.id, `${owner}/${repo}`, tone);

    if (!analysis) {
      res.status(404).json({ error: "Generate an analysis before sharing it" });
      return;
    }
    if (!analysis.shareSlug) {
      analysis.shareSlug = crypto.randomBytes(6).toString("base64url");
      await analysis.save();
    }

    // Behind Render's proxy chain, trust the original scheme so links are https.
    const proto = req.get("x-forwarded-proto")?.split(",")[0].trim() || req.protocol;
    const base = `${proto}://${req.get("host")}`;
    res.json({
      slug: analysis.shareSlug,
      cardUrl: `${config.clientUrl}/card/${analysis.shareSlug}`,
      apiUrl: `${base}/api/card/${analysis.shareSlug}`,
      imageUrl: `${base}/api/card/${analysis.shareSlug}/image.svg`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to share analysis" });
  }
};

export const unshareAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params as { owner: string; repo: string };
    await Analysis.updateMany(
      { userId: req.user!.id, repoFullName: `${owner}/${repo}` },
      { $unset: { shareSlug: 1 } }
    );
    res.json({ shared: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to unshare analysis" });
  }
};
