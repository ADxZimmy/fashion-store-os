const fs = require("fs/promises");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const publicFiles = [
  "index.html",
  "src/app.js",
  "src/styles.css",
  "docs/IMG-20260528-WA0025.jpg",
  "docs/IMG-20260528-WA0028.jpg",
  "docs/IMG-20260528-WA0029.jpg",
];

async function copyPublicFile(relativePath) {
  const sourcePath = path.join(rootDir, relativePath);
  const targetPath = path.join(distDir, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function build() {
  await fs.rm(distDir, { recursive: true, force: true });
  await Promise.all(publicFiles.map(copyPublicFile));
  console.log(`Built ${publicFiles.length} public files into ${path.relative(rootDir, distDir)}.`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
