import { Router } from "express";
import {
  getCachedAnalysis,
  generateAnalysis,
} from "../controllers/analysis.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/:owner/:repo", requireAuth, getCachedAnalysis);
router.post("/:owner/:repo", requireAuth, generateAnalysis);

export default router;
