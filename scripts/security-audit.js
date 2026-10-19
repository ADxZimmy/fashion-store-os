const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const ignoredDirs = new Set([".git", ".vercel", "data", "dist", "node_modules"]);
const auditedExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".sql", ".txt"]);

// Runs when invoked as a script (npm run ops:security). Wrapped so the
// pure detector below can be required by tests without scanning the repo.
function runAudit() {
  const files = collectFiles(rootDir);
  const findings = [];

  for (const file of files) {
    const relativePath = path.relative(rootDir, file);
    const source = fs.readFileSync(file, "utf8");

    for (const finding of secretFindings(source, relativePath)) {
      findings.push(finding);
    }

    if (relativePath.replace(/\\/g, "/") === "src/app.js" && /\b(alert|prompt|confirm)\s*\(/.test(stripComments(source))) {
      findings.push(`${relativePath}: native browser dialog found in runtime app code`);
    }
  }

  // Phase 021 note: the old "Manager-gated data export" signal asserted that
  // api/data.js contained requireManager. That endpoint is retired -- export is
  // a local file download now -- so the signal was replaced rather than
  // deleted, by ones that assert the invariants the pivot actually depends on:
  // manager gating still exists on the identity plane, and no server write path
  // for business data has crept back in.
  const identitySource = fs.readFileSync(path.join(rootDir, "api/_identity.js"), "utf8");
  // The retired endpoints share one function (api/retired.js, reached through
  // vercel.json rewrites) and one helper; between them they must only refuse.
  const retiredSource = ["api/retired.js", "api/_gone.js"].map((file) => fs.readFileSync(path.join(rootDir, file), "utf8")).join("\n");
  const dbSource = fs.readFileSync(path.join(rootDir, "api/_db.js"), "utf8");
  const runtimeSources = fs
    .readdirSync(path.join(rootDir, "api"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => stripComments(fs.readFileSync(path.join(rootDir, "api", name), "utf8")));

  const requiredSignals = [
    ["API body limit", fs.readFileSync(path.join(rootDir, "api/_response.js"), "utf8").includes("BODY_LIMIT")],
    ["Webhook signature-required mode", fs.readFileSync(path.join(rootDir, "api/channel-webhook.js"), "utf8").includes("CHANNEL_WEBHOOK_REQUIRE_SIGNATURE")],
    ["Manager-gated identity actions", identitySource.includes("requireManager")],
    ["Identity rate limiting is durable", identitySource.includes("consumeRateLimit")],
    ["Retired endpoints answer 410", /sendJson\(response, 410/.test(retiredSource) && retiredSource.includes("sendGone")],
    ["No server-side business state writes", !/setDocument|readJsonBody|\.query\(/.test(retiredSource)],
    ["Database credentials come from the environment", dbSource.includes("process.env.DATABASE_URL")],
    ["No Supabase client left in runtime code", runtimeSources.every((source) => !/supabaseRequest|SUPABASE_SERVICE_ROLE_KEY|\.supabase\.co/.test(source))],
    // Presence only; scripts/test-local-first.js checks the policy itself and
    // that vercel.json matches api/_security_headers.js value for value.
    ["Production sends a Content Security Policy", fs.readFileSync(path.join(rootDir, "vercel.json"), "utf8").includes("Content-Security-Policy")],
    ["Release owner lane mentions ADxZimmy", fs.readFileSync(path.join(rootDir, "scripts/release-preflight.js"), "utf8").includes("ADxZimmy")],
  ];

  console.log("Fashion Store OS security audit");
  for (const [label, ok] of requiredSignals) {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
    if (!ok) findings.push(`Missing required signal: ${label}`);
  }

  if (!findings.length) {
    console.log("PASS No committed secret-looking values or native dialogs found.");
  } else {
    for (const finding of findings) {
      console.log(`FAIL ${finding}`);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runAudit();
}

module.exports = { secretFindings, stripComments };

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) return [];
      return collectFiles(fullPath);
    }
    return entry.isFile() && auditedExtensions.has(path.extname(entry.name).toLowerCase()) ? [fullPath] : [];
  });
}

function secretFindings(source, relativePath) {
  const findings = [];
  const stripped = stripComments(source);
  const strongPatterns = [
    /sk_live_[A-Za-z0-9]{16,}/g,
    /pk_live_[A-Za-z0-9]{16,}/g,
    /sb_secret_[A-Za-z0-9_-]{20,}/g,
    /supabase_[A-Za-z0-9_-]{30,}/gi,
    /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g,
    // Phase 021 moved the server to Neon, so the secret most likely to be
    // committed by accident is now a connection string. Neon passwords carry
    // an npg_ prefix; the URL pattern catches any Postgres URL with an inline
    // password long enough to be real (the placeholder "password" is not).
    /npg_[A-Za-z0-9]{10,}/g,
    /postgres(?:ql)?:\/\/[^\s:@\/'"]+:[^\s@\/'"]{12,}@[^\s\/'"]+/gi,
  ];

  // Strong patterns scan the raw text, not the comment-stripped text. A token
  // pasted into a comment is still a committed secret, and stripComments drops
  // everything after "//" -- which is the credential half of every
  // postgresql:// URL, so a connection-string pattern run on stripped text
  // could never match anything.
  for (const pattern of strongPatterns) {
    if (pattern.test(source)) {
      findings.push(`${relativePath}: secret-looking token matched ${pattern}`);
    }
  }

  const assignmentPattern = /\b([A-Z0-9_]*(?:SECRET|TOKEN|PRIVATE|SERVICE_ROLE|PASSWORD|API_KEY)[A-Z0-9_]*)\s*[:=]\s*["']?([^"'\s#`]+)["']?/g;
  for (const match of stripped.matchAll(assignmentPattern)) {
    const [, key, value] = match;
    if (isPlaceholder(value)) continue;
    if (value.length >= 24 && /[A-Za-z]/.test(value) && /\d/.test(value)) {
      findings.push(`${relativePath}: ${key} appears to contain a concrete secret value`);
    }
  }

  return findings;
}

function isPlaceholder(value) {
  return /^(changeme|change-me|example|placeholder|your_|set_|required|optional|xxx+|<.*>|\$\{.*\})$/i.test(value);
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}
