import mongoose, { Schema, Document } from "mongoose";

export interface CachedRepo {
  full_name: string;
  name: string;
  owner: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
  updatedAt: string;
}

export interface IAccountStatsCache extends Document {
  userId: mongoose.Types.ObjectId;
  stats: {
    commits: number;
    pullRequests: number;
    issues: number;
    contributors: number;
    openIssues: number;
    stars: number;
    forks: number;
    followers: number;
    repoCount: number;
    languages: Record<string, number>;
    languageRepos: Record<string, number>;
    weeklyActivity: number[];
  };
  repos: CachedRepo[];
  createdAt: Date;
  updatedAt: Date;
}

const AccountStatsCacheSchema = new Schema<IAccountStatsCache>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    stats: { type: Schema.Types.Mixed, required: true },
    repos: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export const AccountStatsCache = mongoose.model<IAccountStatsCache>(
  "AccountStatsCache",
  AccountStatsCacheSchema
);