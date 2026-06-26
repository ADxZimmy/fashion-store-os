const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

const files = {
  index: read("index.html"),
  app: read("src/app.js"),
  css: read("src/styles.css"),
};

const checks = [
  {
    label: "Toast is a polite atomic live region",
    ok: has(files.index, 'id="toast"') && has(files.index, 'role="status"') && has(files.index, 'aria-live="polite"') && has(files.index, 'aria-atomic="true"'),
  },
  {
    label: "Skip link and main focus target exist",
    ok: has(files.app, 'class="skip-link"') && has(files.app, 'id="mainContent"') && has(files.app, 'tabindex="-1"'),
  },
  {
    label: "Mobile navigation uses hamburger drawer pattern",
    ok: has(files.app, "toggle-mobile-nav") && has(files.app, "aria-controls=\"primaryNavigation\"") && has(files.app, "aria-expanded=") && has(files.css, ".shell.nav-open .sidebar"),
  },
  {
    label: "Mobile drawer has backdrop and close control",
    ok: has(files.app, "close-mobile-nav") && has(files.css, ".nav-backdrop") && has(files.css, ".drawer-close"),
  },
  {
    label: "Touch targets meet 44px minimum",
    ok: /input,\s*select,\s*textarea\s*\{[\s\S]*min-height:\s*44px/.test(files.css) && /\.btn\.small\s*\{[\s\S]*min-height:\s*44px/.test(files.css),
  },
  {
    label: "Focus-visible styles are present",
    ok: has(files.css, ":focus-visible") && /outline:\s*3px/.test(files.css),
  },
  {
    label: "Reduced motion preference is respected",
    ok: has(files.css, "@media (prefers-reduced-motion: reduce)") && has(files.css, "animation-iteration-count: 1"),
  },
  {
    label: "Horizontal overflow and mobile overscroll are constrained",
    ok: has(files.css, "overflow-x: hidden") && has(files.css, "overscroll-behavior-x: none"),
  },
  {
    label: "Modal and drawer can be dismissed with Escape",
    ok: has(files.app, 'event.key === "Escape"') && has(files.app, "closeModal()"),
  },
  {
    label: "Runtime avoids native alert/prompt/confirm dialogs",
    ok: !/\b(alert|prompt|confirm)\s*\(/.test(stripComments(files.app)),
  },
];

let failed = 0;
console.log("Fashion Store OS UX audit");
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}`);
  if (!check.ok) failed += 1;
}

if (failed) {
  process.exitCode = 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function has(source, text) {
  return source.includes(text);
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}
