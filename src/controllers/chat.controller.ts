import { Response } from "express";
import { User } from "../models/User.js";
import { Analysis } from "../models/Analysis.js";
import { GitHubService } from "../services/github.js";
import { respondToGitHubError } from "../utils/githubErrors.js";
import {
  buildChatPrompt,
  buildAccountContext,
  DeveloperReport,
  parseTone,
} from "../services/analyzer.js";
import { groqChat } from "../services/groq.js";
import { AuthRequest } from "../middleware/auth.js";

interface ChatBody {
  message: string;
  owner?: string;
  repo?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  context?: Record<string, unknown>;
  tone?: string;
}

export const askFlowLens = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { message, owner, repo, history, context, tone } = req.body as ChatBody;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const user = await User.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let stats = null;
    let report: DeveloperReport | null = null;
    let resolvedOwner = owner;
    let resolvedRepo = repo;

    if (resolvedOwner && resolvedRepo) {
      const service = new GitHubService(user);
      stats = await service.getRepoStats(resolvedOwner, resolvedRepo);

      const cached = await Analysis.findOne({
        userId: user._id,
        repoFullName: `${resolvedOwner}/${resolvedRepo}`,
      }).sort({ createdAt: -1 });
      if (cached) report = cached.report;
    }

    const accountContext =
      context && typeof context === "object" ? buildAccountContext(context) : null;

    const prompt = buildChatPrompt(
      message,
      stats,
      resolvedOwner || req.user!.username,
      resolvedRepo || "",
      report,
      history || [],
      accountContext,
      parseTone(tone)
    );

    const answer = await groqChat(prompt, false);
    res.json({ answer });
  } catch (err) {
    console.error(err);
    if (respondToGitHubError(res, err)) return;
    res.status(500).json({ error: "Failed to get answer" });
  }
};
