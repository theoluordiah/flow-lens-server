import mongoose, { Schema, Document } from "mongoose";

export interface IAnalysis extends Document {
  userId: mongoose.Types.ObjectId;
  repoFullName: string;
  report: {
    scores: {
      consistency: number;
      codeQuality: number;
      collaboration: number;
      projectActivity: number;
      overall: number;
    };
    strengths: string[];
    improvements: string[];
    summary: string;
  };
  repoStats: {
    commits: number;
    pullRequests: number;
    issues: number;
    contributors: number;
    languages: Record<string, number>;
    weeklyActivity: number[];
  };
  createdAt: Date;
}

const AnalysisSchema = new Schema<IAnalysis>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    repoFullName: { type: String, required: true },
    report: {
      scores: {
        consistency: { type: Number, required: true },
        codeQuality: { type: Number, required: true },
        collaboration: { type: Number, required: true },
        projectActivity: { type: Number, required: true },
        overall: { type: Number, required: true },
      },
      strengths: [String],
      improvements: [String],
      summary: { type: String, required: true },
    },
    repoStats: {
      commits: { type: Number, required: true },
      pullRequests: { type: Number, required: true },
      issues: { type: Number, required: true },
      contributors: { type: Number, required: true },
      languages: { type: Schema.Types.Mixed, required: true },
      weeklyActivity: [Number],
    },
  },
  { timestamps: true }
);

AnalysisSchema.index({ userId: 1, repoFullName: 1 });

export const Analysis = mongoose.model<IAnalysis>("Analysis", AnalysisSchema);
