import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/keys.js";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
  };
}

export const requireAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      id: string;
      username: string;
    };
    req.user = { id: decoded.id, username: decoded.username };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
