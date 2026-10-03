import { GitHubService, RepoFile, RepoTree } from "./github.js";
import { groqChat, DEFAULT_MODEL } from "./groq.js";
import { ReportTone, TONE_INSTRUCTIONS } from "./analyzer.js";
import { humanize } from "../utils/humanize.js";

export type Severity = "high" | "medium" | "low";

export interface ReviewFinding {
  id: string;
  /** "check" findings come from fixed rules; "ai" findings from the model reading the code. */
  source: "check" | "ai";
  severity: Severity;
  category: string;
  title: string;
  explanation: string;
  fix: string;
  file?: string;
  line?: number;
  /** The real line of code an AI finding is about, copied from the file (never from the model). */
  evidence?: string;
  /** Stable identity across reruns, used to remember findings the developer dismissed. */
  fingerprint?: string;
  dismissed?: boolean;
}

const squashText = (s: string) => s.replace(/\s+/g, " ").trim();

/** Checks are identified by rule; AI findings by file and the exact code line, which survive reruns. */
export const fingerprintOf = (f: ReviewFinding): string =>
  f.source === "check"
    ? `check:${f.id}`
    : `ai:${f.file ?? ""}:${squashText(f.evidence ?? f.title).toLowerCase()}`;

export interface RepoFacts {
  fileCount: number;
  sourceFileCount: number;
  testFileCount: number;
  hasReadme: boolean;
  hasTests: boolean;
  hasCi: boolean;
  hasGitignore: boolean;
  hasLicense: boolean;
}

export interface CodeReviewResult {
  sha: string;
  branch: string;
  summary: string;
  aiReviewed: boolean;
  filesReviewed: string[];
  findings: ReviewFinding[];
  facts: RepoFacts;
}

// How much code goes to the model. Groq's free tier allows 8,000 tokens per minute for
// gpt-oss-20b, counting the prompt plus max_tokens, so the defaults leave room for both.
// Raise CODE_REVIEW_CHAR_BUDGET on a paid tier to review more code per run.
const AI_CHAR_BUDGET = Number(process.env.CODE_REVIEW_CHAR_BUDGET) || 10000;
const AI_FILE_CHAR_CAP = Math.min(AI_CHAR_BUDGET, 7000);
// The larger model reasons through code far better; the default model is the fallback.
const REVIEW_MODEL = process.env.CODE_REVIEW_MODEL || "openai/gpt-oss-120b";
const AI_MAX_TOKENS = 2500;
const SCAN_FILE_LIMIT = 25;
const SCAN_MAX_FILE_BYTES = 120_000;

const IGNORED_DIR = /(^|\/)(node_modules|dist|build|out|\.next|\.nuxt|vendor|coverage|\.git|__pycache__|venv|\.venv|env|target|bin|obj|public|static|assets)\//i;
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|kt|rb|php|cs|rs|swift|c|cc|cpp|h|hpp|scala|dart|vue|svelte)$/i;
const GENERATED = /(\.d\.ts|\.min\.[a-z]+|\.map|\.lock|-lock\.json|\.generated\.[a-z]+|\.pb\.go)$/i;
const CONFIG_FILE = /(^|\/)[^/]*\.config\.[a-z]+$|(^|\/)(next-env\.d\.ts|setupTests\.[a-z]+)$/i;
const TEST_FILE = /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/i;
const CI_FILE = /^(\.github\/workflows\/|\.gitlab-ci\.yml$|\.circleci\/|azure-pipelines\.yml$|Jenkinsfile$|bitbucket-pipelines\.yml$)/;
const ENV_FILE = /(^|\/)\.env(\.[a-z0-9_-]+)?$/i;
const ENV_TEMPLATE = /\.(example|sample|template|dist|defaults)$/i;
const IMPORTANT_NAME = /(server|app|index|main|controller|service|route|handler|api|auth|model|middleware|store|db|util|helper|lib|core)/i;

const isSource = (f: RepoFile) =>
  SOURCE_EXT.test(f.path) && !IGNORED_DIR.test(f.path) && !GENERATED.test(f.path);

export const inspectTree = (tree: RepoTree): RepoFacts => {
  const root = tree.files.filter((f) => !f.path.includes("/")).map((f) => f.path.toLowerCase());
  const source = tree.files.filter(isSource);
  const tests = source.filter((f) => TEST_FILE.test(f.path));
  return {
    fileCount: tree.files.length,
    sourceFileCount: source.length - tests.length,
    testFileCount: tests.length,
    hasReadme: root.some((p) => /^readme(\.|$)/.test(p)),
    hasTests: tests.length > 0,
    hasCi: tree.files.some((f) => CI_FILE.test(f.path)),
    hasGitignore: root.includes(".gitignore"),
    hasLicense: root.some((p) => /^(license|licence|copying)(\.|$)/.test(p)),
  };
};

/** Repo facts as plain text, so the chat can talk about what is really in the repo. */
export const describeFacts = (f: RepoFacts): string => {
  const yes = (b: boolean) => (b ? "yes" : "no");
  return `Repository contents (read from GitHub): ${f.fileCount} files, ${f.sourceFileCount} source files, ${f.testFileCount} test files. README: ${yes(f.hasReadme)}. Tests: ${yes(f.hasTests)}. CI workflow: ${yes(f.hasCi)}. .gitignore: ${yes(f.hasGitignore)}. License: ${yes(f.hasLicense)}.`;
};

// --- Fixed checks -----------------------------------------------------------

const structureFindings = (tree: RepoTree, facts: RepoFacts): ReviewFinding[] => {
  const out: ReviewFinding[] = [];
  const add = (f: Omit<ReviewFinding, "source">) => out.push({ ...f, source: "check" });

  const envFiles = tree.files.filter((f) => ENV_FILE.test(f.path) && !ENV_TEMPLATE.test(f.path));
  if (envFiles.length) {
    add({
      id: "env-committed",
      severity: "high",
      category: "security",
      title: "Environment file committed to the repo",
      explanation: `${envFiles.map((f) => f.path).slice(0, 3).join(", ")} is in version control. Anything in it, such as API keys or database passwords, is visible to everyone who can see the repo and stays in the git history even after you delete it.`,
      fix: "Rotate every secret in that file, delete it from the repo, add .env to .gitignore and commit a .env.example with placeholder values instead.",
      file: envFiles[0].path,
    });
  }

  if (tree.files.some((f) => /(^|\/)node_modules\//.test(f.path))) {
    add({
      id: "deps-committed",
      severity: "medium",
      category: "maintainability",
      title: "Installed dependencies committed",
      explanation: "The node_modules folder is checked in. It bloats the repo, makes diffs unreadable and ties everyone to the exact binaries you installed.",
      fix: "Remove node_modules from git with git rm -r --cached node_modules and add it to .gitignore.",
    });
  }

  if (!facts.hasTests && facts.sourceFileCount >= 3) {
    add({
      id: "no-tests",
      severity: "medium",
      category: "testing",
      title: "No automated tests",
      explanation: `There are ${facts.sourceFileCount} source files and not a single test file, so every change is checked by hand or not at all.`,
      fix: "Start with one test for the most important function or endpoint, and add a test each time you fix a bug.",
    });
  }

  if (!facts.hasReadme) {
    add({
      id: "no-readme",
      severity: "low",
      category: "documentation",
      title: "No README",
      explanation: "There is no README at the root, so nobody can tell what the project does or how to run it without reading the code.",
      fix: "Add a README with one paragraph on what it does, how to install and run it, and which environment variables it needs.",
    });
  }

  if (!facts.hasGitignore && facts.fileCount > 0) {
    add({
      id: "no-gitignore",
      severity: "low",
      category: "maintainability",
      title: "No .gitignore",
      explanation: "Without a .gitignore it is easy to commit build output, dependencies or secrets by accident.",
      fix: "Add a .gitignore for your language from github.com/github/gitignore.",
    });
  }

  if (!facts.hasCi && facts.hasTests) {
    add({
      id: "no-ci",
      severity: "low",
      category: "testing",
      title: "Tests never run automatically",
      explanation: "You have tests but no CI workflow, so nothing stops a pull request that breaks them from being merged.",
      fix: "Add a GitHub Actions workflow that installs dependencies and runs the tests on every push and pull request.",
    });
  }

  const huge = tree.files.filter((f) => isSource(f) && f.size > 40_000).sort((a, b) => b.size - a.size);
  if (huge.length) {
    add({
      id: "huge-files",
      severity: "low",
      category: "maintainability",
      title: "Very large source files",
      explanation: `${huge.slice(0, 3).map((f) => `${f.path} (${Math.round(f.size / 1000)} KB)`).join(", ")} ${huge.length === 1 ? "is" : "are"} big enough that one file is probably doing several jobs, which makes it hard to change safely.`,
      fix: "Split the largest file by responsibility, for example moving data access, validation and request handling into separate modules.",
      file: huge[0].path,
    });
  }

  return out;
};

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/g },
  { name: "private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { name: "OpenAI style API key", re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { name: "Groq API key", re: /\bgsk_[A-Za-z0-9]{20,}/g },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}/g },
  { name: "database URL with a password", re: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^:\s"'`/]+:[^@\s"'`]+@/g },
  {
    name: "hardcoded password or secret",
    re: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["'`](?!\s*$)(?![^"'`]*(?:your|example|changeme|xxx|<|\$\{|process\.env))[^"'`\s]{8,}["'`]/gi,
  },
];

type Hit = { file: string; line: number };

const contentFindings = (files: { path: string; text: string }[]): ReviewFinding[] => {
  const out: ReviewFinding[] = [];
  const secrets: (Hit & { kind: string })[] = [];
  const emptyCatches: Hit[] = [];
  const evals: Hit[] = [];
  const sqlConcat: Hit[] = [];
  const consoleLogs = new Map<string, number>();
  let todos = 0;

  for (const { path, text } of files) {
    if (TEST_FILE.test(path)) continue;
    for (const { name, re } of SECRET_PATTERNS) {
      for (const m of text.matchAll(re)) secrets.push({ file: path, line: lineOf(text, m.index ?? 0), kind: name });
    }
    for (const m of text.matchAll(/catch\s*(?:\([^)]*\))?\s*\{\s*\}/g)) emptyCatches.push({ file: path, line: lineOf(text, m.index ?? 0) });
    for (const m of text.matchAll(/except[^:\n]*:\s*\n\s*pass\b/g)) emptyCatches.push({ file: path, line: lineOf(text, m.index ?? 0) });
    for (const m of text.matchAll(/(?<![\w.])eval\s*\(/g)) evals.push({ file: path, line: lineOf(text, m.index ?? 0) });
    for (const m of text.matchAll(/`[^`]*\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^`]*\$\{/gi)) sqlConcat.push({ file: path, line: lineOf(text, m.index ?? 0) });
    for (const m of text.matchAll(/["'][^"'\n]*\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^"'\n]*["']\s*\+\s*[A-Za-z_]/gi)) sqlConcat.push({ file: path, line: lineOf(text, m.index ?? 0) });
    const logs = (text.match(/\bconsole\.log\(/g) ?? []).length;
    if (logs) consoleLogs.set(path, logs);
    todos += (text.match(/\b(?:TODO|FIXME|HACK|XXX)\b/g) ?? []).length;
  }

  const where = (hits: Hit[]) =>
    hits.length > 1 ? ` It also appears in ${hits.length - 1} other place${hits.length === 2 ? "" : "s"}.` : "";

  if (secrets.length) {
    const s = secrets[0];
    out.push({
      id: "hardcoded-secret",
      source: "check",
      severity: "high",
      category: "security",
      title: `Hardcoded ${s.kind}`,
      explanation: `${s.file} line ${s.line} contains what looks like a ${s.kind} written straight into the code. Anyone who can read the repo can use it.${where(secrets)}`,
      fix: "Revoke that credential now, move it to an environment variable, and read it with process.env or your language's equivalent.",
      file: s.file,
      line: s.line,
    });
  }

  if (sqlConcat.length) {
    const s = sqlConcat[0];
    out.push({
      id: "sql-injection",
      source: "check",
      severity: "high",
      category: "security",
      title: "SQL built by gluing strings together",
      explanation: `${s.file} line ${s.line} builds a SQL query by inserting values into the string. If any of those values come from a user, they can rewrite the query.${where(sqlConcat)}`,
      fix: "Use parameterised queries or your database library's placeholders so values are never part of the SQL text.",
      file: s.file,
      line: s.line,
    });
  }

  if (emptyCatches.length) {
    const s = emptyCatches[0];
    out.push({
      id: "swallowed-errors",
      source: "check",
      severity: "medium",
      category: "error handling",
      title: "Errors caught and silently ignored",
      explanation: `${s.file} line ${s.line} catches an error and does nothing with it, so when something breaks there is no log, no message and no clue.${where(emptyCatches)}`,
      fix: "At minimum log the error with context. Better, handle the specific failure you expect and let anything else propagate.",
      file: s.file,
      line: s.line,
    });
  }

  if (evals.length) {
    const s = evals[0];
    out.push({
      id: "eval",
      source: "check",
      severity: "medium",
      category: "security",
      title: "Use of eval",
      explanation: `${s.file} line ${s.line} runs a string as code. If that string can ever contain user input, it is a remote code execution hole.${where(evals)}`,
      fix: "Replace eval with explicit parsing, such as JSON.parse, or a lookup table of allowed operations.",
      file: s.file,
      line: s.line,
    });
  }

  const totalLogs = [...consoleLogs.values()].reduce((a, b) => a + b, 0);
  if (totalLogs >= 10) {
    const [file, count] = [...consoleLogs.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({
      id: "console-logs",
      source: "check",
      severity: "low",
      category: "maintainability",
      title: "Debug logging left in",
      explanation: `There are ${totalLogs} console.log calls across the files FlowLens read, ${count} of them in ${file}. They clutter production logs and can leak data.`,
      fix: "Remove the debugging ones and use a small logger with levels for the logs you actually need.",
      file,
    });
  }

  if (todos >= 8) {
    out.push({
      id: "todos",
      source: "check",
      severity: "low",
      category: "maintainability",
      title: "Pile of TODOs",
      explanation: `The files FlowLens read contain ${todos} TODO, FIXME or HACK comments. Unfinished work hidden in comments is easy to forget.`,
      fix: "Turn the important ones into GitHub issues and delete the rest.",
    });
  }

  return out;
};

// --- AI review ----------------------------------------------------------------

const pickFilesForAi = (files: RepoFile[]): RepoFile[] =>
  files
    .filter((f) => isSource(f) && !TEST_FILE.test(f.path) && !CONFIG_FILE.test(f.path) && f.size > 200)
    .map((f) => {
      const name = f.path.split("/").pop() ?? f.path;
      const depth = f.path.split("/").length;
      const score =
        (IMPORTANT_NAME.test(name) ? 3 : 0) +
        (/(^|\/)(src|app|lib|server|api)\//.test(f.path) ? 1 : 0) +
        (f.size > 800 && f.size < 20_000 ? 2 : 0) -
        depth * 0.3;
      return { f, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ f }) => f);

const redactSecrets = (text: string) =>
  SECRET_PATTERNS.reduce((t, { re }) => t.replace(re, "[REDACTED]"), text);

const numberLines = (text: string) =>
  text
    .split("\n")
    .map((l, i) => `${String(i + 1).padStart(4)}| ${l}`)
    .join("\n");

const SEVERITIES: Severity[] = ["high", "medium", "low"];

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Finds where the quoted code really is. Returns the true line number, or null when
 * the quote does not exist in the file, which means the finding was made up.
 */
const locateEvidence = (text: string, claimedLine: number, evidence: string): number | null => {
  const quote = squash(evidence);
  if (quote.length < 4) return null;
  const lines = text.split("\n").map(squash);
  const hit = (i: number) => lines[i] && (lines[i].includes(quote) || (lines[i].length >= 8 && quote.includes(lines[i])));
  for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
    const i = claimedLine - 1 + offset;
    if (i >= 0 && i < lines.length && hit(i)) return i + 1;
  }
  const all = lines.map((_, i) => i).filter(hit);
  return all.length === 1 ? all[0] + 1 : null;
};

const parseAiFindings = (
  raw: string,
  shown: Map<string, string>
): { summary: string; findings: ReviewFinding[]; dropped: number } | null => {
  let parsed: { summary?: unknown; findings?: unknown };
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.findings)) return null;
  const findings: ReviewFinding[] = [];
  let dropped = 0;
  for (const [i, f] of (parsed.findings as Record<string, unknown>[]).entries()) {
    const file = typeof f.file === "string" ? f.file.replace(/^\.?\//, "") : "";
    const text = shown.get(file);
    const line =
      text && typeof f.evidence === "string" ? locateEvidence(text, Number(f.line) || 0, f.evidence) : null;
    // Unverifiable quotes, unknown files and findings the model itself doubts are dropped.
    if (!text || !line || f.confidence === "low" || typeof f.title !== "string" || typeof f.explanation !== "string") {
      dropped++;
      continue;
    }
    findings.push({
      id: `ai-${i}`,
      source: "ai",
      severity: SEVERITIES.includes(f.severity as Severity) ? (f.severity as Severity) : "medium",
      category: typeof f.category === "string" ? f.category.toLowerCase() : "logic",
      title: humanize(f.title),
      explanation: humanize(f.explanation),
      fix: typeof f.fix === "string" ? humanize(f.fix) : "",
      file,
      line,
      evidence: text.split("\n")[line - 1].trim().slice(0, 200),
    });
  }
  return { summary: typeof parsed.summary === "string" ? humanize(parsed.summary) : "", findings, dropped };
};

const buildReviewPrompt = (repoFullName: string, files: { path: string; text: string }[], tone: ReportTone) => `You are reviewing complete source files from the GitHub repository ${repoFullName}. Each line starts with its line number and a "|".

Find real problems a senior engineer would flag in code review: bugs, flawed logic, unhandled errors or rejected promises, missing input validation, security holes, race conditions, resource leaks, performance traps and habits that will cause bugs later. Ignore formatting, naming taste and missing comments. Secrets have already been replaced with [REDACTED]; do not report those.

Accuracy matters more than anything else. A false bug report is worse than a missed one. Before you report a problem, check it against the whole file: read the lines after it, see whether the function returns or throws later, whether cleanup happens somewhere else, whether a caller already handles the error, and whether the value can really be what you fear. If you are not sure, leave it out. Write explanations as careful observations, for example "if this request fails, the error is lost", not as verdicts about the whole codebase. Code from other files is not shown, so do not report problems that depend on how unseen code behaves. Do not flag TypeScript non-null assertions or missing checks on values that auth middleware or the framework normally guarantees, such as req.user behind an auth guard. If the code is solid, return fewer findings or none. At most 5 findings, most serious first.
${tone === "mentor" ? "" : `\nWrite the summary and each explanation in this tone, while keeping every technical claim accurate:\n${TONE_INSTRUCTIONS[tone]}\n`}
Return JSON with exactly this shape:
{
  "summary": "<2 to 3 sentences on the overall state of this code, speaking to the developer as you>",
  "findings": [
    {
      "file": "<path exactly as written after FILE:>",
      "line": <line number from the left margin>,
      "evidence": "<the exact code on that line, copied character for character without the line number>",
      "confidence": "high" | "medium" | "low",
      "severity": "high" | "medium" | "low",
      "category": "bug" | "logic" | "security" | "error handling" | "performance" | "maintainability",
      "title": "<short title in sentence case>",
      "explanation": "<1 to 2 sentences: what is wrong and what goes wrong when the code runs>",
      "fix": "<1 to 2 sentences: how to fix it>"
    }
  ]
}

${files.map((f) => `FILE: ${f.path}\n${numberLines(f.text)}`).join("\n\n")}`;

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export const runCodeReview = async (
  service: GitHubService,
  owner: string,
  repo: string,
  tone: ReportTone,
  tree?: RepoTree
): Promise<CodeReviewResult> => {
  const snapshot = tree ?? (await service.getRepoTree(owner, repo));
  const facts = inspectTree(snapshot);

  // Most important files first; the rest of the source only feeds the fixed checks.
  const candidates = pickFilesForAi(snapshot.files);
  const others = snapshot.files.filter((f) => isSource(f) && !candidates.includes(f));
  const ordered = [...candidates, ...others]
    .filter((f) => f.size <= SCAN_MAX_FILE_BYTES)
    .slice(0, SCAN_FILE_LIMIT);

  const fetched = (
    await Promise.all(
      ordered.map(async (f) => {
        try {
          return { path: f.path, text: await service.getFileText(owner, repo, f.sha) };
        } catch {
          return null;
        }
      })
    )
  ).filter((f): f is { path: string; text: string } => f !== null && !f.text.includes("\u0000"));

  const checks = [...structureFindings(snapshot, facts), ...contentFindings(fetched)];

  // Fill the AI budget with the most important files. Files are sent whole or not at all,
  // because a model judging half a file reports "missing" code that is just out of view.
  const forAi: { path: string; text: string }[] = [];
  let used = 0;
  for (const path of candidates.map((c) => c.path)) {
    const file = fetched.find((f) => f.path === path);
    if (!file) continue;
    // Trailing spaces and runs of blank lines cost tokens and carry no meaning.
    const text = redactSecrets(file.text).replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
    const cost = numberLines(text).length;
    if (cost > AI_FILE_CHAR_CAP || used + cost > AI_CHAR_BUDGET) continue;
    forAi.push({ path, text });
    used += cost;
  }

  let aiFindings: ReviewFinding[] = [];
  let summary = "";
  let aiReviewed = false;
  let aiFiles: string[] = [];
  const models = [...new Set([REVIEW_MODEL, DEFAULT_MODEL])];
  // Too big for the provider: retry with the top half of the files. Model unavailable: try the next one.
  let modelIndex = 0;
  for (let batch = forAi; batch.length && modelIndex < models.length; ) {
    const shown = new Map(batch.map((f) => [f.path, f.text]));
    try {
      const raw = await groqChat(buildReviewPrompt(`${owner}/${repo}`, batch, tone), true, tone, {
        maxTokens: AI_MAX_TOKENS,
        model: models[modelIndex],
        temperature: 0.3,
        fallback: false,
      });
      const parsed = parseAiFindings(raw, shown);
      if (parsed) {
        aiFindings = parsed.findings;
        summary = parsed.summary;
        aiReviewed = true;
        aiFiles = batch.map((f) => f.path);
        if (parsed.dropped) console.log(`[CodeReview] Dropped ${parsed.dropped} finding(s) that did not match the code.`);
      }
      break;
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 413 && batch.length > 1) {
        console.warn(`[CodeReview] Request too large with ${batch.length} files, retrying with fewer.`);
        batch = batch.slice(0, Math.floor(batch.length / 2));
        continue;
      }
      console.error(`[CodeReview] ${models[modelIndex]} failed:`, (err as Error).message);
      modelIndex++;
    }
  }

  const findings = [...checks, ...aiFindings].map((f) => ({ ...f, fingerprint: fingerprintOf(f) })).sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  );

  if (!summary) {
    const high = findings.filter((f) => f.severity === "high").length;
    summary = !snapshot.files.length
      ? "This repository is empty, so there is no code to review yet."
      : findings.length
        ? `FlowLens found ${findings.length} thing${findings.length === 1 ? "" : "s"} to look at${high ? `, ${high} of them serious` : ""}.${aiReviewed ? "" : " The line by line AI review was not available this time, so these come from the automatic checks."}`
        : "Nothing stood out in the files FlowLens read.";
  }

  return {
    sha: snapshot.sha,
    branch: snapshot.branch,
    summary,
    aiReviewed,
    filesReviewed: aiFiles,
    findings,
    facts,
  };
};

/** The review as plain text for the chat, so it can talk about the real code. */
export const describeReview = (r: Pick<CodeReviewResult, "summary" | "findings" | "filesReviewed" | "facts">): string => {
  const lines = r.findings
    .filter((f) => !f.dismissed)
    .slice(0, 10)
    .map(
      (f) =>
        `${f.severity.toUpperCase()} ${f.category}: ${f.title}${f.file ? ` (${f.file}${f.line ? ` line ${f.line}` : ""})` : ""}. ${f.explanation} Fix: ${f.fix}`
    )
    .join("\n");
  return `${describeFacts(r.facts)}
Code review of ${r.filesReviewed.length ? r.filesReviewed.join(", ") : "the repository structure"}:
${r.summary}
${lines || "No problems found."}`;
};
