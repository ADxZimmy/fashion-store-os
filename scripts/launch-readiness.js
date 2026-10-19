const { execFileSync } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmCli = process.env.npm_execpath || "";
const checks = [
  ["JavaScript syntax", ["run", "check"]],
  ["Identity plane unit suite", ["run", "test:identity"]],
  ["Local-first boundary guards", ["run", "test:local-first"]],
  ["Device storage suite", ["run", "test:storage"]],
  ["Encrypted backup suite", ["run", "test:backup"]],
  ["Transit inbox suite", ["run", "test:inbox"]],
  ["Neon migration suite", ["run", "test:neon"]],
  ["Mobile/accessibility UX audit", ["run", "ux:audit"]],
  ["Security hygiene audit", ["run", "ops:security"]],
  ["Production build", ["run", "build"]],
];

let failed = 0;
console.log("Fashion Store OS launch readiness");

for (const [label, args] of checks) {
  console.log("");
  console.log(`Running: ${label}`);
  try {
    runNpm(args);
    console.log(`PASS ${label}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${label}: ${error.message}`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("");
  console.log("PASS Launch readiness checks completed locally.");
  // These gates run against PGlite and static analysis. What they cannot
  // prove is the live deployment: that Neon is reachable, that the build
  // applied the schema, and that the client flows work in a real browser.
  console.log("Local gates only. After a deploy, check live /api/health and /api/readiness, then run docs/production-smoke.md.");
}

function runNpm(args) {
  if (npmCli && npmCli.endsWith(".js")) {
    execFileSync(process.execPath, [npmCli, ...args], { cwd: rootDir, stdio: "inherit" });
    return;
  }
  // On Windows the npm launcher is `npm.cmd`; current Node refuses to spawn a
  // `.cmd` file without `shell: true` (throws EINVAL). Enable the shell there so
  // `node scripts/launch-readiness.js` works from any shell, not just PowerShell.
  const useShell = process.platform === "win32";
  execFileSync(npmCommand, args, { cwd: rootDir, stdio: "inherit", shell: useShell });
}
