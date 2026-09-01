import { Router } from "express";
import { getDashboard } from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, getDashboard);

export default router;
