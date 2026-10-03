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
import { groqChat, isRateLimited } from "../services/groq.js";
import { CodeReview } from "../models/CodeReview.js";
import { describeFacts, describeReview, fingerprintOf, inspectTree } from "../services/codeReview.js";
import { dismissedSet } from "../models/DismissedFinding.js";
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
    let codeContext: string | null = null;

    if (resolvedOwner && resolvedRepo) {
      const service = new GitHubService(user);
      stats = await service.getRepoStats(resolvedOwner, resolvedRepo);

      const cached = await Analysis.findOne({
        userId: user._id,
        repoFullName: `${resolvedOwner}/${resolvedRepo}`,
      }).sort({ createdAt: -1 });
      if (cached) report = cached.report;

      // Ground anything said about the code in what FlowLens actually read.
      const review = await CodeReview.findOne({
        userId: user._id,
        repoFullName: `${resolvedOwner}/${resolvedRepo}`,
      }).sort({ createdAt: -1 });
      if (review) {
        // Findings the developer dismissed as wrong never reach the chat.
        const dismissed = await dismissedSet(user._id, `${resolvedOwner}/${resolvedRepo}`);
        codeContext = describeReview({
          ...review.toObject(),
          findings: review.findings.map((f) => ({ ...f, dismissed: dismissed.has(f.fingerprint ?? fingerprintOf(f)) })),
        });
      } else {
        try {
          const tree = await service.getRepoTree(resolvedOwner, resolvedRepo);
          codeContext = `${describeFacts(inspectTree(tree))}
No line by line code review has been run yet. If they ask about bugs or code quality, tell them to run one from the Code review tab on the repo page.`;
        } catch (err) {
          console.error("[Chat] Could not read repo tree:", err);
        }
      }
    }

    // With a repo selected, account-wide numbers only confuse the answer.
    const accountContext =
      !stats && context && typeof context === "object" ? buildAccountContext(context) : null;

    const prompt = buildChatPrompt(
      message,
      stats,
      resolvedOwner || req.user!.username,
      resolvedRepo || "",
      report,
      history || [],
      accountContext,
      parseTone(tone),
      codeContext
    );

    // Replies are capped at about 120 words; the rest of the allowance covers the model's reasoning.
    const answer = await groqChat(prompt, false, parseTone(tone), { maxTokens: 1200 });
    res.json({ answer });
  } catch (err) {
    console.error(err);
    if (respondToGitHubError(res, err)) return;
    if (isRateLimited(err)) {
      res.status(503).json({ error: "FlowLens is answering a lot of questions right now. Give it about 30 seconds and ask again." });
      return;
    }
    res.status(500).json({ error: "Failed to get answer" });
  }
};
