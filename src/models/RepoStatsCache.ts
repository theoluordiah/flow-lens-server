import mongoose, { Schema, Document } from "mongoose";

export interface IRepoStatsCache extends Document {
  userId: mongoose.Types.ObjectId;
  repoFullName: string;
  repoStats: {
    commits: number;
    pullRequests: number;
    issues: number;
    contributors: number;
    openIssues: number;
    stars: number;
    forks: number;
    languages: Record<string, number>;
    weeklyActivity: number[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const RepoStatsCacheSchema = new Schema<IRepoStatsCache>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    repoFullName: { type: String, required: true },
    repoStats: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

RepoStatsCacheSchema.index({ userId: 1, repoFullName: 1 }, { unique: true });

export const RepoStatsCache = mongoose.model<IRepoStatsCache>(
  "RepoStatsCache",
  RepoStatsCacheSchema
);
