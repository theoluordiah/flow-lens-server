import { Request, Response } from "express";
import { Analysis, IAnalysis } from "../models/Analysis.js";
import { User } from "../models/User.js";

const SLUG_RE = /^[A-Za-z0-9_-]{4,32}$/;

const findShared = async (slug: string) => {
  if (!SLUG_RE.test(slug)) return null;
  const analysis = await Analysis.findOne({ shareSlug: slug });
  if (!analysis) return null;
  const user = await User.findById(analysis.userId).select("username displayName avatarUrl profileUrl");
  return { analysis, user };
};

const topLanguage = (a: IAnalysis): string | null => {
  const entries = Object.entries(a.repoStats.languages ?? {}) as [string, number][];
  if (!entries.length) return null;
  return entries.sort((x, y) => y[1] - x[1])[0][0];
};

export const getCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const found = await findShared(String(req.params.slug));
    if (!found) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    const { analysis, user } = found;
    res.set("Cache-Control", "public, max-age=300");
    res.json({
      user: user && {
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        profileUrl: user.profileUrl,
      },
      repoFullName: analysis.repoFullName,
      tone: analysis.tone ?? "mentor",
      scores: analysis.report.scores,
      breakdown: analysis.report.breakdown,
      headline: analysis.report.headline || analysis.report.summary,
      strengths: analysis.report.strengths,
      improvements: analysis.report.improvements,
      topLanguage: topLanguage(analysis),
      weeklyActivity: analysis.repoStats.weeklyActivity,
      createdAt: analysis.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load card" });
  }
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Greedy word wrap for SVG <text>, which has no native wrapping.
const wrap = (text: string, maxChars: number, maxLines: number): string[] => {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > maxChars) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return lines;
};

const scoreColor = (n: number) => (n >= 75 ? "#3fb950" : n >= 50 ? "#d29922" : "#f85149");

const TONE_BADGE: Record<string, { label: string; color: string }> = {
  mentor: { label: "MENTOR", color: "#58a6ff" },
  roast: { label: "ROASTED 🔥", color: "#f85149" },
  hype: { label: "HYPED 🚀", color: "#bc8cff" },
};

export const getCardImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const found = await findShared(String(req.params.slug));
    if (!found) {
      res.status(404).type("text/plain").send("Card not found");
      return;
    }
    const { analysis, user } = found;
    const { scores } = analysis.report;
    const badge = TONE_BADGE[analysis.tone ?? "mentor"] ?? TONE_BADGE.mentor;
    const lang = topLanguage(analysis);
    const headline = wrap(analysis.report.headline || analysis.report.summary, 62, 2);

    // Overall score ring
    const r = 44;
    const circ = 2 * Math.PI * r;
    const dash = (scores.overall / 100) * circ;

    const bars = (
      [
        ["Consistency", scores.consistency],
        ["Code quality", scores.codeQuality],
        ["Collaboration", scores.collaboration],
        ["Activity", scores.projectActivity],
      ] as [string, number][]
    )
      .map(([label, value], i) => {
        const y = 62 + i * 26;
        return `<text x="170" y="${y}" class="lbl">${label}</text>
    <rect x="270" y="${y - 9}" width="160" height="8" rx="4" fill="#21262d"/>
    <rect x="270" y="${y - 9}" width="${(value / 100) * 160}" height="8" rx="4" fill="${scoreColor(value)}"/>
    <text x="440" y="${y}" class="val">${value}</text>`;
      })
      .join("\n    ");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="230" viewBox="0 0 480 230" role="img" aria-label="FlowLens score ${scores.overall} for ${esc(analysis.repoFullName)}">
  <style>
    text { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; fill: #e6edf3; }
    .title { font-size: 15px; font-weight: 600; }
    .sub { font-size: 11px; fill: #8b949e; }
    .lbl { font-size: 12px; fill: #c9d1d9; }
    .val { font-size: 12px; font-weight: 600; }
    .big { font-size: 30px; font-weight: 700; }
    .quote { font-size: 12px; font-style: italic; fill: #c9d1d9; }
  </style>
  <rect x="0.5" y="0.5" width="479" height="229" rx="10" fill="#0d1117" stroke="#30363d"/>
  <text x="20" y="28" class="title">${esc(user ? `@${user.username}` : "FlowLens")} · ${esc(analysis.repoFullName.split("/")[1] ?? analysis.repoFullName)}</text>
  <rect x="${460 - badge.label.length * 7.2}" y="14" width="${badge.label.length * 7.2}" height="20" rx="10" fill="${badge.color}" fill-opacity="0.18"/>
  <text x="${460 - badge.label.length * 3.6}" y="28" text-anchor="middle" style="font-size:10px;font-weight:700;fill:${badge.color}">${badge.label}</text>
  <g transform="translate(80 105)">
    <circle r="${r}" fill="none" stroke="#21262d" stroke-width="9"/>
    <circle r="${r}" fill="none" stroke="${scoreColor(scores.overall)}" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90)"/>
    <text y="10" text-anchor="middle" class="big">${scores.overall}</text>
    <text y="62" text-anchor="middle" class="sub">${lang ? esc(lang) : "overall"}</text>
  </g>
  ${bars}
  <line x1="20" y1="178" x2="460" y2="178" stroke="#21262d"/>
  ${headline.map((l, i) => `<text x="20" y="${197 + i * 16}" class="quote">${i === 0 ? "“" : ""}${esc(l)}${i === headline.length - 1 ? "”" : ""}</text>`).join("\n  ")}
  <text x="460" y="${headline.length > 1 ? 213 : 197}" text-anchor="end" class="sub">FlowLens</text>
</svg>`;

    res.set("Cache-Control", "public, max-age=3600");
    res.type("image/svg+xml").send(svg);
  } catch (err) {
    console.error(err);
    res.status(500).type("text/plain").send("Failed to render card");
  }
};
