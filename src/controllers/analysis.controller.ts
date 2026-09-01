import { Response } from "express";
import { Analysis } from "../models/Analysis.js";
import { getGitHubService } from "../utils/helpers.js";
import {
  buildAnalysisPrompt,
  parseReport,
  isValidReport,
  DeveloperReport,
} from "../services/analyzer.js";
import { groqChat } from "../services/groq.js";
import { AuthRequest } from "../middleware/auth.js";

const generateReport = async (prompt: string): Promise<DeveloperReport> => {
  const raw = await groqChat(prompt, true);
  const report = parseReport(raw);

  if (!isValidReport(report)) {
    const retryPrompt = `${prompt}

Your previous response was not valid JSON with the exact required structure. Respond with ONLY valid JSON matching the exact shape described above (all five scores as numbers 0-100, strengths and improvements as arrays of strings, and a summary string). No markdown, no commentary.`;
    const retryRaw = await groqChat(retryPrompt, true);
    return parseReport(retryRaw);
  }

  return report;
};

export const getCachedAnalysis = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { owner, repo } = req.params as { owner: string; repo: string };
    const repoFullName = `${owner}/${repo}`;
    const analysis = await Analysis.findOne({
      userId: req.user!.id,
      repoFullName,
    }).sort({ createdAt: -1 });

    if (!analysis) {
      res.status(404).json({ error: "No analysis found for this repository" });
      return;
    }
    res.json({
      report: analysis.report,
      repoStats: analysis.repoStats,
      createdAt: analysis.createdAt,
    });
  } catch (err) {
    console.error(err);
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

    const cached = await Analysis.findOne({
      userId: req.user!.id,
      repoFullName,
    }).sort({ createdAt: -1 });
    if (cached) {
      res.json({ report: cached.report, repoStats: cached.repoStats, cached: true });
      return;
    }

    const service = await getGitHubService(req, res);
    if (!service) return;

    console.log(`[Analysis] Fetching stats for ${repoFullName}...`);
    const stats = await service.getRepoStats(owner, repo);
    console.log(`[Analysis] Stats fetched. Building prompt...`);
    const prompt = buildAnalysisPrompt(stats, owner, repo);
    console.log(`[Analysis] Calling Groq API...`);
    const report = await generateReport(prompt);
    console.log(`[Analysis] Report generated.`);

    report.scores.overall = Math.round(
      (report.scores.consistency +
        report.scores.codeQuality +
        report.scores.collaboration +
        report.scores.projectActivity) /
        4
    );

    const analysis = await Analysis.create({
      userId: req.user!.id,
      repoFullName,
      report,
      repoStats: stats,
    });

    res.json({ report: analysis.report, repoStats: analysis.repoStats, cached: false });
  } catch (err) {
    console.error(`[Analysis] Error generating analysis:`, err);
    res.status(500).json({ error: "Failed to generate analysis" });
  }
};
