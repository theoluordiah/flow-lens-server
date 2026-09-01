import { Request, Response } from "express";

export const healthCheck = (_req: Request, res: Response) => {
  res.json({
    name: "FlowLens API",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
};
