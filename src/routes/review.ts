import { Router } from "express";
import { getCodeReview, generateCodeReview, setFindingDismissed } from "../controllers/review.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/:owner/:repo", requireAuth, getCodeReview);
router.post("/:owner/:repo", requireAuth, generateCodeReview);
router.post("/:owner/:repo/dismiss", requireAuth, setFindingDismissed);

export default router;
