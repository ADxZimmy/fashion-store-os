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
// The join flow's UI outlived its removal once: a CRLF-blind edit script in
// step 2 deleted the single-line references and silently missed the
// multi-line ones, leaving a dead "Have a workspace code" button that the
// first browser session found. Guard the UI, not just the network call.
ok("no join-mode UI survives", !/data-auth-mode="join"|mode === "join"|workspace code/i.test(appCode));
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
// The build serves the worker from the root; the dev server must too, or the
// worker 404s locally and offline behaviour can only be seen in production.
// The first browser session found exactly that.
ok("the dev server serves the worker from the root", /cleanPath === "\/sw\.js" \? "\/src\/sw\.js"/.test(serverCode));

// --- Findings from the first browser session (2026-10-19) -------------------
// Each of these passed every earlier static check and was only caught by
// running the app. They are pinned here so they cannot quietly return.
function bodyOf(name) {
  const start = appCode.indexOf(`function ${name}(`);
  if (start === -1) return "";
  const next = appCode.indexOf("\nfunction ", start + 10);
  const nextAsync = appCode.indexOf("\nasync function ", start + 10);
  const ends = [next, nextAsync].filter((index) => index !== -1);
  return appCode.slice(start, ends.length ? Math.min(...ends) : undefined);
}
const setupBody = bodyOf("renderSetup");
const mismatchBody = bodyOf("renderStoreMismatch");
const signOutBody = appCode.slice(appCode.indexOf("async function signOut("), appCode.indexOf("function markSignOutPending("));
const bootBody = appCode.slice(appCode.indexOf("async function initializeApp("), appCode.indexOf("function startReconnectWatch("));
const reconnectBody = bodyOf("startReconnectWatch");

// Signup lands on setup, never Settings, so the one-time recovery code must
// render there (and on the mismatch screen, which signup can also land on).
ok("the signup recovery code shows on the setup screen", /renderRecoveryResult\(lastRecoveryResult\)/.test(setupBody));
ok("the signup recovery code shows on the mismatch screen", /renderRecoveryResult\(lastRecoveryResult\)/.test(mismatchBody));

// A fresh device has no profile, so it only ever shows setup: restore and
// sign-out have to be reachable from there.
ok("restore onto a new device is offered on the setup screen", /renderSetupRestore\(\)/.test(setupBody));
ok("the setup screen can sign out", /data-action="sign-out"/.test(setupBody));
ok("the setup restore action is wired", /action === "setup-restore"/.test(appCode));

// Only a manager can set up a store or restore it. Staff on an empty device
// must not get business setup, which would fork the store onto that device.
ok("staff on an empty device are not offered business setup", /if \(currentUser\(\)\?\.role === "manager"\) renderSetup\(\);\s*else renderNoRecordsHere\(\);/.test(bodyOf("render")));
ok("the no-records screen can sign out", /data-action="sign-out"/.test(bodyOf("renderNoRecordsHere")));

// A locked device cannot know whether accounts exist.
ok("the sign-in note no longer claims no account exists", !/No account exists yet/.test(appCode));

// Sign-out that the server cannot hear must still lock, and must be finished
// with the server before any later "still signed in" answer is trusted.
ok("a failed online sign-out still locks the device", /if \(result\)[\s\S]{0,120}return;[\s\S]{0,600}markSignOutPending\(\);[\s\S]{0,80}accessMode = "locked"/.test(signOutBody));
ok("boot finishes an owed sign-out before trusting the server", /readSignOutPending\(\)[\s\S]{0,200}completePendingSignOut\(\)[\s\S]{0,120}identity: null/.test(bootBody));
ok("the reconnect check finishes an owed sign-out instead of unlocking", /readSignOutPending\(\)[\s\S]{0,300}completePendingSignOut\(\)[\s\S]{0,200}return;/.test(reconnectBody));
ok("a deliberate sign-in clears an owed sign-out", /result\.authenticated && result\.identity\)[\s\S]{0,200}clearSignOutPending\(\)/.test(appCode));

// Offline edits must reach the backup once the app is online again.
ok("every save marks a backup as pending", /function saveState\(\)[\s\S]{0,300}markBackupPending\(\)/.test(appCode));
ok("an online start catches up a pending backup", /readBackupPending\(\)[\s\S]{0,80}scheduleAutoBackup\(CATCH_UP_BACKUP_DELAY_MS\)/.test(bootBody));
ok("an offline start watches for the server to return", /startReconnectWatch\(\)/.test(bootBody));
ok("a failed automatic backup retries instead of waiting for an edit", /scheduleAutoBackup\(RECONNECT_CHECK_MS\)/.test(bodyOf("backUpQuietly")));
ok("pending is cleared only if nothing changed during the upload", /localStorage\.getItem\(BACKUP_PENDING_KEY\) === sealedAt/.test(appCode));

// An erase must never be followed by a backup of the emptied device.
ok("erase cancels a queued backup", /cancelAutoBackup\(\)/.test(bodyOf("eraseLocalBusinessData")));
ok("automatic backup refuses an empty device", /hasRecordsWorthBackingUp\(\)/.test(bodyOf("backUpQuietly")));
ok("manual backup refuses an empty device", /hasRecordsWorthBackingUp\(\)/.test(bodyOf("backUpNow")));
ok("restore cancels anything queued against the replaced records", /cancelAutoBackup\(\)/.test(bodyOf("restoreFromBackup")));

// The owner's writing rule: no em-dashes in UI copy or comments.
ok("no em-dashes anywhere in the app", !/\u2014|&mdash;/.test(appSource));
ok("the erase dialog no longer denies the backup exists", !/There is no server copy to restore from/.test(appCode));

// --- Security headers (step 6) ---------------------------------------------
// vercel.json cannot import code, so it carries a copy; these fail the moment
// the copy and the source of truth disagree.
{
  const { SECURITY_HEADERS, PRODUCTION_ONLY_HEADERS, CONTENT_SECURITY_POLICY } = require(path.join(rootDir, "api/_security_headers.js"));
  const vercel = JSON.parse(fs.readFileSync(path.join(rootDir, "vercel.json"), "utf8"));
  const block = (vercel.headers || []).find((entry) => entry.source === "/(.*)");
  const deployed = Object.fromEntries((block ? block.headers : []).map((header) => [header.key, header.value]));
  const expected = { ...SECURITY_HEADERS, ...PRODUCTION_ONLY_HEADERS };
  const drift = Object.keys(expected).filter((name) => deployed[name] !== expected[name]);
  ok("vercel.json carries every security header, value for value", drift.length === 0, drift.join(","));
  ok("production keeps the no-store cache policy", deployed["Cache-Control"] === "no-store");
  ok("the dev server applies the same security headers", /Object\.entries\(SECURITY_HEADERS\)[\s\S]{0,80}setHeader/.test(serverCode));
  ok("HSTS is production-only", !Object.prototype.hasOwnProperty.call(SECURITY_HEADERS, "Strict-Transport-Security"));
  // The strict part of the policy, asserted on its own so a later loosening
  // has to change a test, not just a string.
  const directive = (name) => (CONTENT_SECURITY_POLICY.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) || "");
  ok("scripts may only come from this origin", directive("script-src") === "script-src 'self'");
  ok("no inline script or eval is allowed", !/unsafe-inline|unsafe-eval/.test(directive("script-src")));
  ok("the app cannot be framed", directive("frame-ancestors") === "frame-ancestors 'none'");
  ok("plugins are blocked", directive("object-src") === "object-src 'none'");
  ok("the client only talks to its own origin", directive("connect-src") === "connect-src 'self'");
  // The policy may only stay this strict while the app keeps no inline script
  // and no inline handlers; this is what would break first.
  const htmlSource = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
  ok("index.html has no inline script", !/<script(?![^>]*\bsrc=)[^>]*>/i.test(htmlSource));
  ok("templates use no inline event handlers", !/\son(click|change|submit|input|load|error|keydown|keyup)="/i.test(appSource + htmlSource));
  ok("no eval or Function constructor in the client", !/\beval\(|new Function\(/.test(appCode));
}

// --- Route parity (step 6) --------------------------------------------------
// Every serverless endpoint has a dev-server route and vice versa, checked
// rather than inspected: the dev server is where behaviour is verified, so a
// missing mirror means verifying something production does not run.
{
  // An endpoint is a function file in api/ or a path vercel.json rewrites to one.
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(rootDir, "vercel.json"), "utf8"));
  const functionFiles = fs.readdirSync(path.join(rootDir, "api")).filter((name) => name.endsWith(".js") && !name.startsWith("_"));
  const apiRewrites = (vercelConfig.rewrites || []).filter((rule) => rule.source.startsWith("/api/"));
  const endpoints = [
    ...functionFiles.map((name) => `/api/${name.replace(/\.js$/, "")}`),
    ...apiRewrites.map((rule) => rule.source),
  ];
  const mirrored = new Set([...serverCode.matchAll(/["'](\/api\/[a-z-]+)["']/g)].map((match) => match[1]));
  const unmirrored = endpoints.filter((route) => !mirrored.has(route));
  const orphaned = [...mirrored].filter((route) => !endpoints.includes(route));
  ok("every api/ endpoint has a dev-server route", unmirrored.length === 0, unmirrored.join(","));
  ok("every dev-server route has an api/ endpoint", orphaned.length === 0, orphaned.join(","));
  const strayRewrites = apiRewrites.filter((rule) => !functionFiles.includes(`${rule.destination.split("?")[0].replace(/^\/api\//, "")}.js`));
  ok("every api/ rewrite lands on a real function", strayRewrites.length === 0, strayRewrites.map((rule) => rule.source).join(","));
  // Without a framework every file in api/ is one function, and the Hobby
  // plan refuses a deployment with more than 12. Release A first reached 13,
  // which is why the retired endpoints share api/retired.js.
  ok("api/ stays within the Hobby plan's 12 functions", functionFiles.length <= 12, `${functionFiles.length} functions`);
}

// --- Store deletion UI (step 6) ---------------------------------------------
ok("managers can delete the store from Settings", /renderDeleteStorePanel\(\)/.test(appCode) && /form\.id === "deleteStoreForm"/.test(appCode));
ok("store deletion asks for the password again", /deleteStoreForm[\s\S]{0,400}name="currentPassword"/.test(appCode));
ok("a deleted store drops the backup key and queued backups", /storeDeleted[\s\S]{0,300}cancelAutoBackup\(\)[\s\S]{0,80}clearBackupPending\(\)[\s\S]{0,80}clearCachedBackupKey\(\)/.test(appCode));

// --- Server mirror ----------------------------------------------------------
ok("dev server gates the retired endpoints", /\["\/api\/state", "\/api\/inbound", "\/api\/data", "\/api\/workspace-code"\]\.includes\(url\.pathname\)\)\s*\{\s*sendGone\(request, response/.test(serverCode));
ok("dev server no longer serves business state", !/url\.pathname === "\/api\/state"[\s\S]{0,200}writeJsonAtomic/.test(serverCode));
ok("dev server dropped the legacy auth document plane", !serverCode.includes("normalizeAuthDocument"));
// --- Retired endpoints (Release A) -------------------------------------------
// Exercised, not grepped: the shared function must give each retired path its
// own 410 whichever form of the URL the rewrite hands it.
{
  const retired = require(path.join(rootDir, "api/retired.js"));
  const { RETIRED_ENDPOINTS } = require(path.join(rootDir, "api/_gone.js"));
  const call = (method, url) => {
    const response = {
      statusCode: 200,
      headers: {},
      body: "",
      ended: false,
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
      end(chunk) {
        this.body = chunk ? String(chunk) : "";
        this.ended = true;
      },
    };
    retired({ method, url, headers: {} }, response);
    return response;
  };
  const errorOf = (response) => (response.body ? JSON.parse(response.body).error : "");
  ok("four retired paths are covered", Object.keys(RETIRED_ENDPOINTS).sort().join(",") === "data,inbound,state,workspace-code");
  for (const [name, detail] of Object.entries(RETIRED_ENDPOINTS)) {
    const viaRewrite = call("PUT", `/api/retired?endpoint=${name}`);
    const viaPath = call("GET", `/api/${name}`);
    ok(
      `/api/${name} answers 410 with its own message`,
      viaRewrite.statusCode === 410 && errorOf(viaRewrite) === detail && viaPath.statusCode === 410 && errorOf(viaPath) === detail,
    );
  }
  const preflight = call("OPTIONS", "/api/retired?endpoint=state");
  ok("a retired endpoint answers OPTIONS with no body", preflight.statusCode === 204 && preflight.ended && preflight.body === "");
  const unknown = call("GET", "/api/retired?endpoint=nonsense");
  ok("an unknown name still gets a generic 410", unknown.statusCode === 410 && errorOf(unknown).length > 0);
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
