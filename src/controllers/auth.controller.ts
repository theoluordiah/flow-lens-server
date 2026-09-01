import { Request, Response } from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
import { config } from "../config/keys.js";
import { User } from "../models/User.js";
import { AuthRequest } from "../middleware/auth.js";

export const startGitHubOAuth = (_req: Request, res: Response): void => {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    scope: "read:user user:email repo",
  });
  res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}` });
};

export const githubCallback = async (req: Request, res: Response): Promise<void> => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.redirect(`${config.clientUrl}/login?error=no_code`);
    return;
  }

  try {
    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
      },
      { headers: { Accept: "application/json" } }
    );

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) {
      res.redirect(`${config.clientUrl}/login?error=${tokenRes.data.error || "oauth_failed"}`);
      return;
    }

    const userRes = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const profile = userRes.data;
    const githubId = String(profile.id);

    let user = await User.findOne({ githubId });
    if (user) {
      user.username = profile.login;
      user.displayName = profile.name || profile.login;
      user.avatarUrl = profile.avatar_url;
      user.profileUrl = profile.html_url;
      user.accessToken = accessToken;
      await user.save();
    } else {
      user = await User.create({
        githubId,
        username: profile.login,
        displayName: profile.name || profile.login,
        avatarUrl: profile.avatar_url,
        profileUrl: profile.html_url,
        accessToken,
      });
    }

    const token = jwt.sign(
      { id: user._id.toString(), username: user.username },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    res.redirect(`${config.clientUrl}/dashboard?token=${token}`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.redirect(`${config.clientUrl}/login?error=server_error`);
  }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user!.id).select("-accessToken");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
