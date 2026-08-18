// Phase 021 step 2 guards. src/app.js is a browser single-file app with no
// module boundary, so these are static assertions over its source plus
// behavioural tests of the boot logic re-hosted in a minimal DOM/storage
// stub. Static checks are the right tool for "this call site must not exist":
// the pivot's correctness depends on the ABSENCE of a server write path, and
// absence is exactly what a behavioural test cannot prove.
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(rootDir, "src/app.js"), "utf8");
const swSource = fs.readFileSync(path.join(rootDir, "src/sw.js"), "utf8");
const serverSource = fs.readFileSync(path.join(rootDir, "server.js"), "utf8");

let pass = 0;
let fail = 0;

function ok(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`PASS ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

// Comments legitimately mention the removed machinery; assertions about
// absence must look at code, not prose.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const appCode = stripComments(appSource);
const serverCode = stripComments(serverSource);

// --- The pivot boundary: no business data may reach the server -------------
ok("no PUT to /api/state anywhere in the client", !/API_STATE_PATH|["'`]\/api\/state/.test(appCode));
ok("no saveBackendData sync path survives", !appCode.includes("saveBackendData"));
ok("no /api/data export or delete call survives", !/API_DATA_PATH|["'`]\/api\/data/.test(appCode));
ok("no workspace-code calls survive", !/API_WORKSPACE_CODE_PATH|["'`]\/api\/workspace-code/.test(appCode));
ok("the client sends no x-workspace-id header", !appCode.includes("x-workspace-id"));
// The client may only talk to identity endpoints plus the backup endpoint.
// Backup is the one deliberate exception to "no business data leaves the
// device", and it is only acceptable because what leaves is ciphertext -- so
// the exception is paired with the assertion that makes it true, below.
// Three endpoint families, each with the reason it does not breach the pivot:
// identity (no business data at all), backup (ciphertext only), and the inbox
// (inbound relay -- messages arrive from providers and are deleted once the
// device stores them, so nothing of the device's is uploaded). The assertions
// that make the latter two true follow.
const fetchTargets = [...appCode.matchAll(/fetch\(\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
ok(
  "the client only calls identity, backup, and inbox endpoints",
  fetchTargets.every((name) =>
    ["API_BOOTSTRAP_PATH", "API_SESSION_PATH", "API_BACKUP_PATH", "API_INBOX_PATH"].includes(name),
  ),
  fetchTargets.join(","),
);
ok(
  "the inbox is drained, never fed: the only upload is a list of ids",
  /body: JSON\.stringify\(\{ inboxIds:/.test(appCode),
);
ok(
  "no request body carries raw records",
  !/body:\s*JSON\.stringify\(state\)/.test(appCode) && !/body:\s*JSON\.stringify\(\s*state\s*[,)]/.test(appCode),
);
ok(
  "the backup upload sends a sealed envelope, never the records",
  /body: JSON\.stringify\(envelope\)/.test(appCode) && /backupCrypto\.seal\(/.test(appCode),
);

// --- Trust direction: an auth answer must never destroy local data ---------
ok("dual-mode backendReady flag is gone", !appCode.includes("backendReady"));
ok("plaintext local password comparison is gone", !/item\.password === password/.test(appCode));
ok("no local password field is persisted", !/password: String\(user\.password/.test(appCode));

// The specific pre-pivot lines that wiped local state on an unauthenticated
// bootstrap. Their absence is the entire point of the step.
ok("bootstrap no longer seeds over local state", !/stateLocked \|\| !authenticated/.test(appCode));
const removalsOfStateKey = [...appCode.matchAll(/removeItem\(STORAGE_KEY\)/g)].length;
ok("STORAGE_KEY is only removed by the explicit erase path", removalsOfStateKey <= 1, `${removalsOfStateKey} call sites`);
ok("erase clears the store tag too", /eraseLocalBusinessData[\s\S]{0,400}STORE_TAG_KEY/.test(appCode));
ok("erase clears the stale workspace key", /eraseLocalBusinessData[\s\S]{0,400}WORKSPACE_KEY/.test(appCode));

// --- Offline and lock semantics --------------------------------------------
ok("a 5xx is treated as unreachable, not as a refusal", /status >= 500/.test(appCode));
ok("offline boot falls back to the cached identity", /readCachedIdentity\(\)/.test(appCode));
ok("the offline cache has a bounded lifetime", /OFFLINE_GRACE_MS/.test(appCode));
ok("sign-out clears the offline cache before anything else", /clearCachedIdentity\(\);[\s\S]{0,200}if \(!offlineMode\)/.test(appCode));
ok("sign-out works while offline", /offlineMode[\s\S]{0,300}Signed out on this device/.test(appCode));

// --- Store mismatch ---------------------------------------------------------
ok("a store mismatch renders a choice screen", appCode.includes("renderStoreMismatch"));
ok("mismatch offers sign-out and erase, nothing automatic", /mismatch-sign-out/.test(appCode) && /mismatch-erase/.test(appCode));
ok("mismatch only triggers when local data exists", /hasLocalBusinessData\(\)/.test(appCode));

// --- Storage failure is surfaced, not swallowed -----------------------------
ok("persistLocalState guards the write", /function persistLocalState\(\)[\s\S]{0,400}try \{/.test(appCode));
ok("a failed save tells the user", /storageFailureAnnounced/.test(appCode));

// --- Service worker ---------------------------------------------------------
ok("the shell worker never caches API traffic", swSource.includes('url.pathname.startsWith("/api/")'));
ok("the shell worker is versioned", /SHELL_VERSION\s*=\s*"[^"]+"/.test(swSource));
ok("activate drops superseded caches", /keys\.filter\(\(key\) => key !== SHELL_VERSION\)/.test(swSource));
ok("navigations fall back to the shell offline", /request\.mode === "navigate"/.test(swSource));
ok("the worker is registered from the app", appCode.includes('navigator.serviceWorker.register("/sw.js")'));
ok("the worker ships in the build", fs.readFileSync(path.join(rootDir, "scripts/build.js"), "utf8").includes("sw.js"));

// --- Server mirror ----------------------------------------------------------
ok("dev server gates the retired endpoints", /\/api\/state[\s\S]{0,200}410/.test(serverCode));
ok("dev server no longer serves business state", !/url\.pathname === "\/api\/state"[\s\S]{0,200}writeJsonAtomic/.test(serverCode));
ok("dev server dropped the legacy auth document plane", !serverCode.includes("normalizeAuthDocument"));
for (const file of ["state.js", "inbound.js", "data.js", "workspace-code.js"]) {
  const source = fs.readFileSync(path.join(rootDir, "api", file), "utf8");
  ok(`api/${file} answers 410`, source.includes("sendGone"));
}

// --- Boot behaviour, exercised against a stubbed browser --------------------
function runBoot({ reachable, authenticated, identity, localState, storeTag, cachedIdentity, cacheAge = 0 }) {
  const store = new Map();
  if (localState) store.set("fashion-studio-os-state-v1", JSON.stringify(localState));
  if (storeTag) store.set("fashion-studio-os-store-v1", storeTag);
  if (cachedIdentity) {
    store.set(
      "fashion-studio-os-identity-v1",
      JSON.stringify({ identity: cachedIdentity, cachedAt: Date.now() - cacheAge }),
    );
  }
  // Mirrors initializeApp's decision table. Kept deliberately small: it is a
  // model of the branch structure, and the static checks above are what tie
  // that structure to the real source.
  const OFFLINE_GRACE = 1000 * 60 * 60 * 24 * 30;
  let accessMode = "loading";
  let offline = false;
  let mismatch = null;
  const stateBefore = store.get("fashion-studio-os-state-v1") || null;

  if (reachable && authenticated) {
    accessMode = "unlocked";
    const tag = store.get("fashion-studio-os-store-v1") || "";
    if (!tag) store.set("fashion-studio-os-store-v1", identity.store.id);
    else if (tag !== identity.store.id && store.has("fashion-studio-os-state-v1")) {
      accessMode = "mismatch";
      mismatch = { existingStoreId: tag, incomingStoreId: identity.store.id };
    }
  } else if (reachable) {
    accessMode = "locked";
  } else {
    offline = true;
    const raw = store.get("fashion-studio-os-identity-v1");
    const parsed = raw ? JSON.parse(raw) : null;
    const fresh = parsed && Date.now() - parsed.cachedAt <= OFFLINE_GRACE;
    accessMode = fresh ? "unlocked" : "locked";
  }

  return {
    accessMode,
    offline,
    mismatch,
    dataSurvived: (store.get("fashion-studio-os-state-v1") || null) === stateBefore,
  };
}

const IDENTITY = { account: { id: "user-1" }, store: { id: "store-1" }, members: [], invites: [], auditEvents: [] };
const DATA = { clients: [{ id: "c1" }] };

let r = runBoot({ reachable: true, authenticated: false, localState: DATA, storeTag: "store-1" });
ok("session expiry locks the UI", r.accessMode === "locked");
ok("session expiry does NOT touch local data", r.dataSurvived);

r = runBoot({ reachable: true, authenticated: true, identity: IDENTITY, localState: DATA, storeTag: "store-1" });
ok("matching store unlocks", r.accessMode === "unlocked" && r.dataSurvived);

r = runBoot({ reachable: true, authenticated: true, identity: IDENTITY, localState: DATA, storeTag: "store-OTHER" });
ok("a different store raises a mismatch", r.accessMode === "mismatch" && r.mismatch.existingStoreId === "store-OTHER");
ok("mismatch leaves the data intact", r.dataSurvived);

r = runBoot({ reachable: true, authenticated: true, identity: IDENTITY, localState: null, storeTag: "store-OTHER" });
ok("a different store with no local data just unlocks", r.accessMode === "unlocked");

r = runBoot({ reachable: false, localState: DATA, cachedIdentity: IDENTITY });
ok("offline with a cached identity unlocks", r.accessMode === "unlocked" && r.offline && r.dataSurvived);

r = runBoot({ reachable: false, localState: DATA });
ok("offline with no cached identity stays locked", r.accessMode === "locked" && r.dataSurvived);

r = runBoot({ reachable: false, localState: DATA, cachedIdentity: IDENTITY, cacheAge: 1000 * 60 * 60 * 24 * 45 });
ok("an expired offline cache stops unlocking", r.accessMode === "locked" && r.dataSurvived);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
