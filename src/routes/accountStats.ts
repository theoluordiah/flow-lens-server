import { Router } from "express";
import { getAccountStats } from "../controllers/accountStats.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/stats", requireAuth, getAccountStats);

export default router;
