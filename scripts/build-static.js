const fs = require("fs/promises");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const entries = [
  ["index.html", "index.html"],
  ["src", "src"],
  ["docs/IMG-20260528-WA0025.jpg", "docs/IMG-20260528-WA0025.jpg"],
  ["docs/IMG-20260528-WA0028.jpg", "docs/IMG-20260528-WA0028.jpg"],
  ["docs/IMG-20260528-WA0029.jpg", "docs/IMG-20260528-WA0029.jpg"],
];

async function build() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  for (const [source, target] of entries) {
    await copyEntry(path.join(rootDir, source), path.join(distDir, target));
  }

  console.log(`Static Vercel build written to ${path.relative(rootDir, distDir)}`);
}

async function copyEntry(source, target) {
  const stat = await fs.stat(source);
  if (stat.isDirectory()) {
    await fs.cp(source, target, { recursive: true });
    return;
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
