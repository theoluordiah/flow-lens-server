import { Router } from "express";
import { listRepos, getRepoDetails, getRepoStats } from "../controllers/repos.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, listRepos);
router.get("/:owner/:repo/stats", requireAuth, getRepoStats);
router.get("/:owner/:repo", requireAuth, getRepoDetails);

export default router;
