import mongoose, { Schema, Document } from "mongoose";
import type { RepoFacts, ReviewFinding } from "../services/codeReview.js";

export interface ICodeReview extends Document {
  userId: mongoose.Types.ObjectId;
  repoFullName: string;
  tone: "mentor" | "roast" | "hype";
  /** Commit the code was read at, so a rerun on unchanged code can reuse this. */
  sha: string;
  branch: string;
  summary: string;
  aiReviewed: boolean;
  filesReviewed: string[];
  findings: ReviewFinding[];
  facts: RepoFacts;
  createdAt: Date;
}

const CodeReviewSchema = new Schema<ICodeReview>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    repoFullName: { type: String, required: true },
    tone: { type: String, enum: ["mentor", "roast", "hype"], default: "mentor" },
    sha: { type: String, default: "" },
    branch: { type: String, default: "" },
    summary: { type: String, default: "" },
    aiReviewed: { type: Boolean, default: false },
    filesReviewed: [String],
    findings: { type: Schema.Types.Mixed, default: [] },
    facts: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

CodeReviewSchema.index({ userId: 1, repoFullName: 1, tone: 1, createdAt: -1 });

export const CodeReview = mongoose.model<ICodeReview>("CodeReview", CodeReviewSchema);
