import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  githubId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  profileUrl: string;
  accessToken: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    githubId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    displayName: { type: String, required: true },
    avatarUrl: { type: String, required: true },
    profileUrl: { type: String, required: true },
    accessToken: { type: String, required: true },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", UserSchema);
