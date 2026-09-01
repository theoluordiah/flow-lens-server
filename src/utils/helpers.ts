import { Response } from "express";
import { User } from "../models/User.js";
import { GitHubService } from "../services/github.js";
import { AuthRequest } from "../middleware/auth.js";

export const getGitHubService = async (
  req: AuthRequest,
  res: Response
): Promise<GitHubService | null> => {
  const user = await User.findById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return null;
  }
  return new GitHubService(user);
};
