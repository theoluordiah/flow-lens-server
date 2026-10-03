import { Router } from "express";
import {
  getContributions,
  getProfile,
  saveProfile,
  deleteProfile,
} from "../controllers/profile.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, getProfile);
router.put("/", requireAuth, saveProfile);
router.delete("/", requireAuth, deleteProfile);
router.get("/contributions", requireAuth, getContributions);

export default router;
