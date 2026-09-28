import { Router } from "express";
import {
  getCachedAnalysis,
  generateAnalysis,
  shareAnalysis,
  unshareAnalysis,
} from "../controllers/analysis.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/:owner/:repo", requireAuth, getCachedAnalysis);
router.post("/:owner/:repo", requireAuth, generateAnalysis);
router.post("/:owner/:repo/share", requireAuth, shareAnalysis);
router.delete("/:owner/:repo/share", requireAuth, unshareAnalysis);

export default router;
