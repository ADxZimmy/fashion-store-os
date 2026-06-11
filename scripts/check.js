const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const ignoredDirs = new Set([".git", ".vercel", "data", "dist", "node_modules"]);

function collectJavaScriptFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) return [];
      return collectJavaScriptFiles(path.join(dir, entry.name));
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [path.join(dir, entry.name)] : [];
  });
}

const files = collectJavaScriptFiles(rootDir);

for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

console.log(`Checked ${files.length} JavaScript files.`);
