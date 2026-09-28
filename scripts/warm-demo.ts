/**
 * Pre-generates analyses for demo repos so demo day never waits on GitHub or Groq.
 *
 * Usage:
 *   FLOWLENS_TOKEN=<jwt> FLOWLENS_API=https://your-api.onrender.com \
 *     npm run demo:warm -- owner/repo owner/other-repo [--tones=mentor,roast,hype] [--share]
 *
 * Get the JWT by logging in on the frontend and copying the `token` from the
 * /dashboard?token=... redirect (or from localStorage).
 */
const api = (process.env.FLOWLENS_API || "http://localhost:5000").replace(/\/$/, "");
const token = process.env.FLOWLENS_TOKEN;

const args = process.argv.slice(2);
const repos = args.filter((a) => !a.startsWith("--"));
const tones = (args.find((a) => a.startsWith("--tones="))?.split("=")[1] || "mentor,roast,hype").split(",");
const share = args.includes("--share");

if (!token || !repos.length) {
  console.error("Usage: FLOWLENS_TOKEN=<jwt> npm run demo:warm -- owner/repo [...] [--tones=mentor,roast] [--share]");
  process.exit(1);
}

const call = async (method: string, path: string) => {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
};

const main = async () => {
  const t0 = Date.now();
  process.stdout.write(`Waking ${api} ... `);
  await fetch(`${api}/health`);
  console.log(`up in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  let failed = 0;
  for (const full of repos) {
    const [owner, repo] = full.split("/");
    for (const tone of tones) {
      try {
        const { report } = await call("POST", `/api/analysis/${owner}/${repo}?tone=${tone}&refresh=true`);
        let line = `✔ ${full} [${tone}] overall ${report.scores.overall} — ${report.headline || ""}`;
        if (share) {
          const s = await call("POST", `/api/analysis/${owner}/${repo}/share?tone=${tone}`);
          line += `\n    card: ${s.imageUrl}`;
        }
        console.log(line);
      } catch (err) {
        failed++;
        console.error(`✘ ${full} [${tone}] ${(err as Error).message}`);
      }
    }
  }
  process.exit(failed ? 1 : 0);
};

main();
