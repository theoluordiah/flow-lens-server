import mongoose, { Schema, Document } from "mongoose";

/** A code review finding the developer marked as not a real issue. Applies to every future review of the repo. */
export interface IDismissedFinding extends Document {
  userId: mongoose.Types.ObjectId;
  repoFullName: string;
  fingerprint: string;
  createdAt: Date;
}

const DismissedFindingSchema = new Schema<IDismissedFinding>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    repoFullName: { type: String, required: true },
    fingerprint: { type: String, required: true },
  },
  { timestamps: true }
);

DismissedFindingSchema.index({ userId: 1, repoFullName: 1, fingerprint: 1 }, { unique: true });

export const DismissedFinding = mongoose.model<IDismissedFinding>("DismissedFinding", DismissedFindingSchema);

export const dismissedSet = async (
  userId: string | mongoose.Types.ObjectId,
  repoFullName: string
): Promise<Set<string>> =>
  new Set(
    (await DismissedFinding.find({ userId, repoFullName }).select("fingerprint").lean()).map((d) => d.fingerprint)
  );
