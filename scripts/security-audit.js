const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const ignoredDirs = new Set([".git", ".vercel", "data", "dist", "node_modules"]);
const auditedExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".sql", ".txt"]);

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

const requiredSignals = [
  ["API body limit", fs.readFileSync(path.join(rootDir, "api/_response.js"), "utf8").includes("BODY_LIMIT")],
  ["Webhook signature-required mode", fs.readFileSync(path.join(rootDir, "api/channel-webhook.js"), "utf8").includes("CHANNEL_WEBHOOK_REQUIRE_SIGNATURE")],
  ["Manager-gated data export", fs.readFileSync(path.join(rootDir, "api/data.js"), "utf8").includes("requireManager")],
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
  ];

  for (const pattern of strongPatterns) {
    if (pattern.test(stripped)) {
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
