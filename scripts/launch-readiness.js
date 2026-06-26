const { execFileSync } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmCli = process.env.npm_execpath || "";
const checks = [
  ["JavaScript syntax", ["run", "check"]],
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
  console.log("Owner-side production release still requires ADxZimmy to deploy the Git-connected Vercel project with Supabase env vars.");
}

function runNpm(args) {
  if (npmCli && npmCli.endsWith(".js")) {
    execFileSync(process.execPath, [npmCli, ...args], { cwd: rootDir, stdio: "inherit" });
    return;
  }
  execFileSync(npmCommand, args, { cwd: rootDir, stdio: "inherit" });
}
