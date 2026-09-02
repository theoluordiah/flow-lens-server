import { Response } from "express";

export const isGitHubUnauthorized = (err: unknown): boolean => {
  const status = (err as { status?: number })?.status;
  const msg = String((err as { message?: string })?.message || "").toLowerCase();
  if (status === 401) return true;
  if (status === 403 && msg.includes("bad credentials")) return true;
  return msg.includes("bad credentials");
};

export const respondToGitHubError = (
  res: Response,
  err: unknown
): boolean => {
  if (isGitHubUnauthorized(err)) {
    res.status(401).json({ error: "github_unauthorized" });
    return true;
  }
  return false;
};
