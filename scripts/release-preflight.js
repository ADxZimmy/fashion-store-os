const { execFileSync } = require("child_process");

const OWNER_LOGIN = process.env.FASHION_STORE_RELEASE_OWNER || "ADxZimmy";
const OWNER_EMAIL = process.env.FASHION_STORE_RELEASE_OWNER_EMAIL || "";

function main() {
  const status = git(["status", "--short"]);
  const branch = git(["branch", "--show-current"]);
  const head = git(["rev-parse", "--short", "HEAD"]);
  const authorName = git(["show", "-s", "--format=%an", "HEAD"]);
  const authorEmail = git(["show", "-s", "--format=%ae", "HEAD"]);
  const remote = git(["config", "--get", "remote.origin.url"]);

  const checks = [
    {
      label: "Clean worktree",
      ok: status.length === 0,
      detail: status.length ? "Commit or stash local changes before a release handoff." : "No local changes.",
    },
    {
      label: "Expected repository",
      ok: remote.includes("ADxZimmy/fashion-store-os"),
      detail: remote || "No origin remote configured.",
    },
    {
      label: "Owner release author",
      ok: authorName === OWNER_LOGIN || (OWNER_EMAIL && authorEmail.toLowerCase() === OWNER_EMAIL.toLowerCase()),
      detail: OWNER_EMAIL
        ? `Latest commit author is ${authorName} <${authorEmail}>; expected ${OWNER_LOGIN} or ${OWNER_EMAIL}.`
        : `Latest commit author is ${authorName} <${authorEmail}>; expected GitHub owner login ${OWNER_LOGIN} for auto-deploy on the free Vercel project.`,
      warningOnly: true,
    },
  ];

  console.log(`Fashion Store OS release preflight`);
  console.log(`Branch: ${branch}`);
  console.log(`Commit: ${head}`);
  console.log(`Origin: ${remote}`);
  console.log("");

  for (const check of checks) {
    const icon = check.ok ? "PASS" : check.warningOnly ? "WARN" : "FAIL";
    console.log(`${icon} ${check.label}: ${check.detail}`);
  }

  const failed = checks.filter((check) => !check.ok && !check.warningOnly);
  if (failed.length) {
    process.exitCode = 1;
  }
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

main();
