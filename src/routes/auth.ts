import { Router } from "express";
import {
  startGitHubOAuth,
  githubCallback,
  getMe,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/github/start", startGitHubOAuth);
router.get("/github/callback", githubCallback);
router.get("/me", requireAuth, getMe);

export default router;
