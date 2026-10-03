import mongoose, { Schema, Document } from "mongoose";

export const PROFILE_THEMES = ["flowlens", "phosphor", "amber", "paper"] as const;
export type ProfileTheme = (typeof PROFILE_THEMES)[number];

export const PORTRAIT_CHARSETS = ["standard", "detailed", "blocks", "minimal"] as const;
export type PortraitCharset = (typeof PORTRAIT_CHARSETS)[number];

export interface ProfileLink {
  label: string;
  url: string;
}

export interface ProfileProject {
  name: string;
  description: string;
  url: string;
  tech: string;
}

export interface ProfilePortrait {
  enabled: boolean;
  columns: number;
  contrast: number;
  brightness: number;
  charset: PortraitCharset;
  invert: boolean;
  enhance: boolean;
  fontSize: number;
  /** Generated ASCII text only. The source photo is processed in the browser and never stored. */
  ascii: string[];
}

export interface ProfileSections {
  card: boolean;
  contributions: boolean;
  about: boolean;
  projects: boolean;
  skills: boolean;
  links: boolean;
}

export interface ProfileData {
  displayName: string;
  title: string;
  bio: string;
  focus: string;
  languages: string[];
  stack: string[];
  projects: ProfileProject[];
  links: ProfileLink[];
  theme: ProfileTheme;
  animations: boolean;
  terminalHeadings: boolean;
  autoRefresh: boolean;
  sections: ProfileSections;
  portrait: ProfilePortrait;
  /** Hand-edited README; null means "use the generated one". */
  readmeOverride: string | null;
}

export interface IProfileConfig extends Document {
  userId: mongoose.Types.ObjectId;
  profile: ProfileData;
  createdAt: Date;
  updatedAt: Date;
}

const ProfileConfigSchema = new Schema<IProfileConfig>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    // Validated and normalized by utils/profileValidation before it is stored.
    profile: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export const ProfileConfig = mongoose.model<IProfileConfig>(
  "ProfileConfig",
  ProfileConfigSchema
);
