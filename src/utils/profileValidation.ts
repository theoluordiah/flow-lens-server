import {
  PORTRAIT_CHARSETS,
  PROFILE_THEMES,
  PortraitCharset,
  ProfileData,
  ProfileLink,
  ProfileProject,
  ProfileTheme,
} from "../models/ProfileConfig.js";

export const LIMITS = {
  displayName: 60,
  title: 80,
  bio: 600,
  focus: 160,
  tag: 30,
  languages: 20,
  stack: 30,
  projects: 6,
  projectName: 60,
  projectDescription: 200,
  projectTech: 80,
  links: 8,
  linkLabel: 30,
  url: 300,
  portraitLines: 120,
  portraitColumns: 160,
  readme: 20000,
};

class ValidationError extends Error {}

// Control characters (other than newline/tab) have no place in profile text and can
// break SVG/XML output downstream.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const text = (v: unknown, field: string, max: number, multiline = false): string => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new ValidationError(`${field} must be text`);
  let s = v.replace(CONTROL_CHARS, "");
  if (!multiline) s = s.replace(/\s+/g, " ");
  s = s.trim();
  if (s.length > max) throw new ValidationError(`${field} must be at most ${max} characters`);
  return s;
};

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

const num = (v: unknown, field: string, min: number, max: number, fallback: number): number => {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    throw new ValidationError(`${field} must be a number between ${min} and ${max}`);
  }
  return v;
};

/** Only web and mailto links; anything else (javascript:, data:, …) is rejected. */
export const validateUrl = (v: unknown, field: string, required: boolean): string => {
  const s = text(v, field, LIMITS.url);
  if (!s) {
    if (required) throw new ValidationError(`${field} is required`);
    return "";
  }
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    throw new ValidationError(`${field} must be a full URL starting with https://`);
  }
  if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
    throw new ValidationError(`${field} must use https://, http:// or mailto:`);
  }
  return s;
};

const list = <T>(v: unknown, field: string, max: number, item: (x: unknown, i: number) => T): T[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ValidationError(`${field} must be a list`);
  if (v.length > max) throw new ValidationError(`${field} can have at most ${max} entries`);
  return v.map(item);
};

const tags = (v: unknown, field: string, max: number): string[] =>
  list(v, field, max, (x) => text(x, `${field} entry`, LIMITS.tag)).filter(Boolean);

const project = (v: unknown, i: number): ProfileProject => {
  if (!isObject(v)) throw new ValidationError(`Project ${i + 1} is invalid`);
  const name = text(v.name, `Project ${i + 1} name`, LIMITS.projectName);
  if (!name) throw new ValidationError(`Project ${i + 1} needs a name`);
  return {
    name,
    description: text(v.description, `Project ${i + 1} description`, LIMITS.projectDescription),
    url: validateUrl(v.url, `Project ${i + 1} link`, false),
    tech: text(v.tech, `Project ${i + 1} tech`, LIMITS.projectTech),
  };
};

const link = (v: unknown, i: number): ProfileLink => {
  if (!isObject(v)) throw new ValidationError(`Link ${i + 1} is invalid`);
  const label = text(v.label, `Link ${i + 1} label`, LIMITS.linkLabel);
  if (!label) throw new ValidationError(`Link ${i + 1} needs a label`);
  return { label, url: validateUrl(v.url, `${label} link`, true) };
};

export type ValidationResult =
  | { ok: true; profile: ProfileData }
  | { ok: false; error: string };

export const validateProfile = (body: unknown): ValidationResult => {
  try {
    if (!isObject(body)) throw new ValidationError("Profile must be an object");
    const sections = isObject(body.sections) ? body.sections : {};
    const portrait = isObject(body.portrait) ? body.portrait : {};

    const ascii = list(portrait.ascii, "Portrait", LIMITS.portraitLines, (line) => {
      if (typeof line !== "string") throw new ValidationError("Portrait lines must be text");
      const clean = line.replace(CONTROL_CHARS, "").replace(/[\r\n\t]/g, " ");
      if (clean.length > LIMITS.portraitColumns) {
        throw new ValidationError(`Portrait lines must be at most ${LIMITS.portraitColumns} characters`);
      }
      return clean;
    });

    const theme = body.theme ?? "flowlens";
    if (!PROFILE_THEMES.includes(theme as ProfileTheme)) throw new ValidationError("Unknown theme");
    const charset = portrait.charset ?? "standard";
    if (!PORTRAIT_CHARSETS.includes(charset as PortraitCharset)) {
      throw new ValidationError("Unknown portrait character set");
    }

    const readme =
      body.readmeOverride === null || body.readmeOverride === undefined
        ? null
        : text(body.readmeOverride, "README", LIMITS.readme, true) || null;

    return {
      ok: true,
      profile: {
        displayName: text(body.displayName, "Name", LIMITS.displayName),
        title: text(body.title, "Title", LIMITS.title),
        bio: text(body.bio, "Bio", LIMITS.bio, true),
        focus: text(body.focus, "Current focus", LIMITS.focus),
        languages: tags(body.languages, "Languages", LIMITS.languages),
        stack: tags(body.stack, "Tech stack", LIMITS.stack),
        projects: list(body.projects, "Projects", LIMITS.projects, project),
        links: list(body.links, "Links", LIMITS.links, link),
        theme: theme as ProfileTheme,
        animations: bool(body.animations, true),
        terminalHeadings: bool(body.terminalHeadings, true),
        autoRefresh: bool(body.autoRefresh, true),
        sections: {
          card: bool(sections.card, true),
          contributions: bool(sections.contributions, true),
          about: bool(sections.about, true),
          projects: bool(sections.projects, true),
          skills: bool(sections.skills, true),
          links: bool(sections.links, true),
        },
        portrait: {
          enabled: bool(portrait.enabled, false) && ascii.length > 0,
          columns: num(portrait.columns, "Portrait columns", 20, LIMITS.portraitColumns, 64),
          contrast: num(portrait.contrast, "Portrait contrast", 0.2, 3, 1.2),
          brightness: num(portrait.brightness, "Portrait brightness", -1, 1, 0),
          charset: charset as PortraitCharset,
          invert: bool(portrait.invert, false),
          enhance: bool(portrait.enhance, true),
          fontSize: num(portrait.fontSize, "Portrait size", 4, 14, 7),
          ascii,
        },
        readmeOverride: readme,
      },
    };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    throw err;
  }
};
