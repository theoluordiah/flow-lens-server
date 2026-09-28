import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { config } from "./config/keys.js";
import { connectDB } from "./config/db.js";
import { swaggerDocument } from "./config/swagger.js";
import { apiLimiter, authLimiter } from "./middleware/rateLimiter.js";
import { healthCheck } from "./controllers/health.controller.js";
import authRoutes from "./routes/auth.js";
import repoRoutes from "./routes/repos.js";
import analysisRoutes from "./routes/analysis.js";
import chatRoutes from "./routes/chat.js";
import dashboardRoutes from "./routes/dashboard.js";
import accountStatsRoutes from "./routes/accountStats.js";
import cardRoutes from "./routes/card.js";

const app = express();

// Render (and most PaaS) sit behind a proxy; without this every client shares one
// rate-limit bucket and req.protocol reports http.
app.set("trust proxy", 1);

// Shared cards are public and fetched from anywhere (PNG export, README embeds,
// preview deployments), so they get open CORS. Mounted before the app-wide policy.
app.use("/api/card", cors({ origin: "*" }), apiLimiter, cardRoutes);

app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get("/", healthCheck);
app.get("/health", healthCheck);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/repos", apiLimiter, repoRoutes);
app.use("/api/analysis", apiLimiter, analysisRoutes);
app.use("/api/chat", apiLimiter, chatRoutes);
app.use("/api/dashboard", apiLimiter, dashboardRoutes);
app.use("/api/account", apiLimiter, accountStatsRoutes);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[Server Error]", err.stack || err.message || err);
    res.status(500).json({ error: "Internal server error" });
  }
);

const start = async () => {
  await connectDB();
  app.listen(config.port, () => {
    console.log(`FlowLens API running on port ${config.port}`);
  });
};

start();
