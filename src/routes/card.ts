import { Router } from "express";
import { getCard, getCardImage } from "../controllers/card.controller.js";

// Public, unauthenticated: only serves analyses the owner explicitly shared.
const router = Router();

router.get("/:slug", getCard);
router.get("/:slug/image.svg", getCardImage);

export default router;
