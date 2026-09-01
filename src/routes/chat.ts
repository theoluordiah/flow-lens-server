import { Router } from "express";
import { askFlowLens } from "../controllers/chat.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/", requireAuth, askFlowLens);

export default router;
