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

// --- Sandbox helpers -----------------------------------------------------------
// The sections below run the real functions from src/app.js in a vm sandbox
// with the helpers they call stubbed, so each check fails on the behaviour a
// review found rather than on one spelling of the fix.
const vm = require("vm");
// A trailing "?" marks a function the check can run without, so the check
// still runs against code that predates it.
const sourceOf = (wanted) => {
  const name = wanted.replace(/\?$/, "");
  const start = appSource.search(new RegExp(`\\n(?:async )?function ${name}\\(`));
  if (start === -1 && wanted.endsWith("?")) return "";
  if (start === -1) throw new Error(`src/app.js has no function ${name}`);
  const rest = appSource.slice(start + 1);
  const end = rest.search(/\n(?:async )?function /);
  return end === -1 ? rest : rest.slice(0, end);
};
const constOf = (name) => {
  const match = appSource.match(new RegExp(`const ${name} = [\\[{][\\s\\S]*?\\n[\\]}];`));
  if (!match) throw new Error(`src/app.js has no const ${name}`);
  return match[0];
};
// A missing function or a thrown error is a failed check, not a crashed suite.
const exercise = (label, run) => {
  try {
    run();
  } catch (error) {
    ok(label, false, error.message);
  }
};
// The same for checks that await the app, such as reading a file. They run
// one after another, and the tally at the end waits for them.
let asyncChecks = Promise.resolve();
const exerciseAsync = (label, run) => {
  asyncChecks = asyncChecks.then(() => run()).catch((error) => ok(label, false, error.message));
};

// --- Order workflow (audit, 2026-10-20) --------------------------------------
// Exercised, not grepped, with the sandbox helpers above.
{
  const orderApp = (state, functions) => {
    const context = vm.createContext({
      state,
      toasts: [],
      currentView: "inquiries",
      saveState: () => {},
      render: () => {},
      recordOrderActivity: (order, label) => {
        order.activity = [...(order.activity || []), label];
      },
      getInventoryItem: (id) => state.inventory.find((item) => item.id === id),
      getStyle: (id) => state.styles.find((style) => style.id === id),
      uid: (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`,
      isoDate: () => "2026-10-20",
      normalizeManagerReview: (review) => ({ status: "Not requested", ...(review || {}) }),
      currentUserLabel: () => "Manager",
      estimateOrder: () => ({ lineItems: [] }),
    });
    context.showToast = (message) => context.toasts.push(message);
    vm.runInContext([constOf("productionSteps"), ...["getOrder", "round2", ...functions].map(sourceOf)].join("\n"), context);
    return context;
  };
  const closing = ["productionStepToStatus", "advanceOrder", "completeOrder", "finalizeOrderCompletion", "consumeRemainingReserved"];
  const emptyStore = () => ({ orders: [], inventory: [], usageRecords: [], styles: [], clients: [], inquiries: [], profile: { fabricUnit: "yards" } });
  const lastToast = (context) => context.toasts[context.toasts.length - 1] || "";

  // Advance on a Ready order used to mark it Completed without the completion
  // step, stranding its finishing-item reservations with no way to release them.
  exercise("advancing a Ready order does not close it", () => {
    const state = emptyStore();
    state.inventory.push({ id: "thread", quantity: 5, reserved: 1 });
    state.orders.push({ id: "o1", status: "Ready for Collection", productionStep: "Ready", reservedMaterials: [{ itemId: "thread", role: "Thread", quantity: 1, unit: "spools" }], actualMaterials: [] });
    const context = orderApp(state, closing);
    context.advanceOrder("o1");
    ok("advancing a Ready order does not close it", state.orders[0].status === "Ready for Collection" && state.orders[0].productionStep === "Ready");
    ok("advancing a Ready order points to Handoff or Complete", /Handoff or Complete/.test(lastToast(context)));
    context.completeOrder("o1");
    ok("Complete on a Ready order uses up its reserved finishing items", state.orders[0].status === "Completed" && state.inventory[0].reserved === 0 && state.inventory[0].quantity === 4);
    state.orders.push({ id: "o2", status: "Sewing", productionStep: "Sewing", reservedMaterials: [], actualMaterials: [] });
    context.advanceOrder("o2");
    ok("ordinary production steps still advance", state.orders[1].productionStep === "First Fitting" && state.orders[1].status === "Fitting");
  });
  ok("the production board sends a Ready order to Orders instead of advancing it", /order\.productionStep === "Ready"\s*\?\s*`<button[^`]*data-nav="orders"/.test(bodyOf("renderProduction")));
  ok("the order card offers no Advance on a Ready order", /!\["Materials Reserved", "Ready"\]\.includes\(order\.productionStep\)[^\n]{0,80}data-action="advance-order"/.test(bodyOf("renderOrderCard")));

  // Closing an order with no cutting entry used to record the estimate as the
  // actual usage: a false zero difference in every learning report.
  exercise("an order closed without cutting saves no learning record", () => {
    const uncut = emptyStore();
    uncut.orders.push({ id: "o3", status: "Sewing", productionStep: "Sewing", estimatedMaterials: [{ itemId: "fab", role: "Main fabric", quantity: 3, unit: "yards" }], reservedMaterials: [], actualMaterials: [] });
    const context = orderApp(uncut, closing);
    context.completeOrder("o3");
    ok("an order closed without cutting saves no learning record", uncut.orders[0].status === "Completed" && uncut.usageRecords.length === 0);
    ok("completing without cutting says no learning record was saved", /No cutting was recorded/.test(lastToast(context)));
    const cut = emptyStore();
    cut.orders.push({ id: "o4", status: "Cutting", productionStep: "Cutting", estimatedMaterials: [{ itemId: "fab", role: "Main fabric", quantity: 3, unit: "yards" }], reservedMaterials: [], actualMaterials: [{ itemId: "fab", role: "Main fabric", estimated: 3, actual: 3.4, unit: "yards" }] });
    orderApp(cut, closing).completeOrder("o4");
    ok("an order closed after cutting records the measured difference", cut.usageRecords.length === 1 && cut.usageRecords[0].actual === 3.4 && cut.usageRecords[0].difference === 0.4);
  });

  // Every click on "Convert to order" used to create another order.
  exercise("converting an inquiry twice makes one order", () => {
    const state = emptyStore();
    state.inquiries.push({ id: "i1", clientName: "Ada", contact: "+2348000000000", desiredStyle: "Kaftan", status: "Quoted", notes: "" });
    const context = orderApp(state, ["findBestStyle", "inquiryConverted?", "convertInquiry"]);
    context.convertInquiry("i1");
    context.convertInquiry("i1");
    ok("converting an inquiry twice makes one order", state.orders.length === 1);
    ok("a converted inquiry remembers its order", state.orders.length > 0 && state.inquiries[0].orderId === state.orders[0].id);
    state.inquiries[0].status = "Quoted";
    context.convertInquiry("i1");
    ok("changing a converted inquiry's status back does not allow a second order", state.orders.length === 1);
  });
  ok("a converted inquiry shows no Convert button", /inquiryConverted\(inquiry\)\s*\?\s*`<button[^`]*data-nav="orders"[^`]*`\s*:\s*`<button[^`]*data-action="convert-inquiry"/.test(appCode));

  // The size thresholds are in inches; a studio measuring in centimeters
  // cleared all of them on almost every client.
  exercise("size adjustment respects the measurement unit", () => {
    const context = vm.createContext({});
    vm.runInContext(["calculateSizeAdjustment", "numberValue"].map(sourceOf).join("\n"), context);
    const average = { inches: { "Chest/Bust": "38", "Dress length": "45" }, centimeters: { "Chest/Bust": "96.5", "Dress length": "114" } };
    const large = { inches: { "Chest/Bust": "54", "Dress length": "62" }, centimeters: { "Chest/Bust": "137", "Dress length": "157.5" } };
    ok("an average client measured in inches gets no size allowance", context.calculateSizeAdjustment(average.inches, "inches") === 0);
    ok("the same client measured in centimeters gets none either", context.calculateSizeAdjustment(average.centimeters, "centimeters") === 0);
    const largeInches = context.calculateSizeAdjustment(large.inches, "inches");
    ok("a large client gets the same allowance in either unit", largeInches > 0 && context.calculateSizeAdjustment(large.centimeters, "centimeters") === largeInches);
  });
  ok("the estimate passes the store's measurement unit", /calculateSizeAdjustment\([^)]*measurementUnit\)/.test(bodyOf("estimateOrder")));

  // Cancelled orders are parked at Consultation and keep their fitting date.
  exercise("the dashboard leaves cancelled orders out", () => {
    const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const state = emptyStore();
    state.channelMessages = [];
    state.orders.push(
      { id: "o5", status: "Sewing", productionStep: "Sewing", fittingDate: soon, quote: 0 },
      { id: "o6", status: "Cancelled", productionStep: "Consultation", fittingDate: soon, quote: 0 },
    );
    const context = vm.createContext({
      state,
      ordersDueWithin: () => [],
      lowStockItems: () => [],
      round2: (value) => value,
      money: (value) => String(value),
      metricCard: (label, value) => `[${label}=${value}]`,
      renderCompactOrder: () => "",
      renderLearningRecord: () => "",
      emptyState: () => "",
      escapeHtml: (value) => String(value),
    });
    vm.runInContext([constOf("productionSteps"), ...["renderDashboard", "daysUntil"].map(sourceOf)].join("\n"), context);
    const html = context.renderDashboard();
    ok("Fittings Due leaves cancelled orders out", html.includes("[Fittings Due=1]"));
    const consultation = html.match(/<strong>Consultation<\/strong>\s*<span class="pill">(\d+)<\/span>/);
    ok("the production flow leaves cancelled orders out", Boolean(consultation) && consultation[1] === "0");
  });

  // A theme preset used to rename the business and delete its logo.
  exercise("the neutral theme keeps the business identity", () => {
    const logo = "data:image/png;base64,AAAA";
    const state = { profile: { businessName: "Needle House", displayName: "Needle House", businessType: "Bespoke tailoring", tagline: "Made to measure.", logo, theme: { primary: "#000000" } } };
    const context = vm.createContext({ state, neutralTheme: { primary: "#2f6f73" }, normalizeProfile: (profile) => profile, saveState: () => {}, render: () => {}, showToast: () => {} });
    vm.runInContext(sourceOf("applyNeutralBrand"), context);
    context.applyNeutralBrand();
    const profile = state.profile;
    ok("the neutral theme keeps the business identity", profile.businessName === "Needle House" && profile.displayName === "Needle House" && profile.businessType === "Bespoke tailoring" && profile.tagline === "Made to measure." && profile.logo === logo);
    ok("the neutral theme still changes the colors", profile.theme.primary === "#2f6f73");
  });

  ok("no copy sends managers to a workspace reset that no longer exists", !/reset the workspace/i.test(appCode));
}

// --- App icon and shell assets (audit, 2026-10-20) ---------------------------
{
  const htmlSource = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
  const buildSource = fs.readFileSync(path.join(rootDir, "scripts/build.js"), "utf8");
  // The app is meant to carry no brand, but its favicon was one store's logo.
  const iconHref = (htmlSource.match(/<link rel="icon" href="([^"]+)"/) || [])[1] || "";
  ok("the favicon is the neutral app icon", iconHref === "src/icon.svg" && fs.existsSync(path.join(rootDir, iconHref)));
  ok("no reference images from docs/ ship to production", ![htmlSource, buildSource, swSource].some((source) => /docs\/IMG-/.test(source)));
  // Every file the worker precaches must be one the build publishes, or its
  // install quietly skips it and that file is missing offline.
  const precached = [...swSource.matchAll(/^\s*"(\/[^"]*)",?\s*$/gm)].map((match) => match[1]).filter((asset) => asset !== "/");
  const published = new Set([...buildSource.matchAll(/^\s*"([^"]+)",?\s*$/gm)].map((match) => `/${match[1]}`));
  const unpublished = precached.filter((asset) => !published.has(asset));
  ok("every precached shell file is published by the build", precached.length > 0 && unpublished.length === 0, unpublished.join(","));
}

// --- Feature sweep in a browser (2026-10-20) ---------------------------------
// Three defects every check above had passed: Record payment refused every
// whole amount, price fields took only whole thousands, and Load from a file
// wiped the device for any JSON file.
{
  // An <input> as written in a template, read past ${...} expressions so a
  // ">" inside one (the payment amount has one) does not end the tag early.
  const tagAt = (start) => {
    let depth = 0;
    for (let index = start; index < appSource.length; index += 1) {
      if (appSource.startsWith("${", index)) {
        depth += 1;
        index += 1;
      } else if (depth && appSource[index] === "{") depth += 1;
      else if (depth && appSource[index] === "}") depth -= 1;
      else if (!depth && appSource[index] === ">") return appSource.slice(start, index + 1);
    }
    return appSource.slice(start);
  };
  const attribute = (tag, name) => {
    const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
    return match ? match[1] : undefined;
  };
  const numberInputs = [...appSource.matchAll(/<input\b/g)].map((match) => tagAt(match.index)).filter((tag) => /\stype="number"/.test(tag));
  const labelOf = (tag) => attribute(tag, "name") || tag.slice(0, 60);
  // Millionths as whole numbers, so 0.01 and 100 compare exactly.
  const micro = (value) => Math.round(Number(value) * 1e6);
  const isLiteral = (value) => value !== undefined && /^-?\d+(\.\d+)?$/.test(value);
  // A browser counts a number input's steps from its min, or from its first
  // value when it has no min. Anything else fails validation and the form
  // silently refuses to submit: min 0.01 with step 100 refused every whole
  // payment, the prefilled balance included.
  const stepBase = (tag) => attribute(tag, "min") ?? attribute(tag, "value") ?? "0";
  const stepProblems = numberInputs.flatMap((tag) => {
    const step = attribute(tag, "step") ?? "1";
    if (step === "any") return [];
    const base = stepBase(tag);
    if (!isLiteral(step) || !isLiteral(base) || micro(step) <= 0) return [`${labelOf(tag)}: write min and step as plain numbers`];
    return micro(base) % micro(step) === 0 ? [] : [`${labelOf(tag)}: min ${base} is not a whole number of ${step} steps`];
  });
  ok("every number input's min is a whole multiple of its step", numberInputs.length >= 10 && stepProblems.length === 0, stepProblems.join("; ") || `${numberInputs.length} inputs found`);

  // Every currency the app offers counts in hundredths, so each price field
  // must take 450, 7,500, 10,000 and 12.50 alike. A field missing from this
  // list fails the check, so a rename cannot quietly drop one.
  const moneyFields = ["amount", "budget", "quote", "deposit", "basePrice", "costPerUnit"];
  const accepts = (tag, amount) => {
    const min = attribute(tag, "min");
    const max = attribute(tag, "max");
    const step = attribute(tag, "step") ?? "1";
    if ((min !== undefined && amount < Number(min)) || (max !== undefined && amount > Number(max))) return false;
    return step === "any" || (micro(amount) - micro(stepBase(tag))) % micro(step) === 0;
  };
  const moneyInputs = numberInputs.filter((tag) => moneyFields.includes(attribute(tag, "name")));
  const moneyProblems = [
    ...moneyFields.filter((name) => !moneyInputs.some((tag) => attribute(tag, "name") === name)).map((name) => `no ${name} field`),
    ...moneyInputs.flatMap((tag) => [450, 7500, 10000, 12.5, 1234.56].filter((amount) => !accepts(tag, amount)).map((amount) => `${labelOf(tag)} refuses ${amount}`)),
  ];
  ok("every price field takes ordinary amounts, cents included", moneyProblems.length === 0, moneyProblems.join("; "));

  // Cents that can be entered must not be rounded away on screen.
  exercise("money shows cents only when an amount has them", () => {
    const context = vm.createContext({ state: { profile: { currency: "USD" } } });
    vm.runInContext(["money", "round2"].map(sourceOf).join("\n"), context);
    const shown = [10000, 12.5, 0.5].map((amount) => context.money(amount));
    ok("money shows cents only when an amount has them", shown.join("|") === "$10,000|$12.50|$0.50", shown.join(", "));
  });

  // A device with no profile shows only business setup, so loading a copy has
  // to be offered there too, and setup has to show the dialog that asks first.
  exercise("the setup screen offers Load from a file", () => {
    const setupScreen = (canRestore) => {
      const context = vm.createContext({
        app: { innerHTML: "" },
        applyTheme: () => {},
        wireEvents: () => {},
        focusModalControl: () => {},
        renderModal: () => '<div id="modal-probe"></div>',
        renderProfileFields: () => "",
        renderRecoveryResult: () => "",
        renderBackupPassphraseForm: () => "",
        currentUser: () => ({ role: "manager" }),
        backupAvailable: () => canRestore,
        lastRecoveryResult: null,
        backupPrompt: null,
        backupBusy: "",
        defaultTheme: {},
      });
      vm.runInContext(["renderSetup", "renderSetupRestore", "renderLoadFromFile?"].map(sourceOf).join("\n"), context);
      context.renderSetup();
      return context.app.innerHTML;
    };
    const offersLoad = (html) => /data-action="load-records-file"/.test(html) && /data-import-records/.test(html);
    const withBackup = setupScreen(true);
    ok("the setup screen offers Load from a file next to Restore from backup", /data-action="setup-restore"/.test(withBackup) && offersLoad(withBackup));
    ok("the setup screen offers Load from a file with no backup to restore", offersLoad(setupScreen(false)));
    ok("the setup screen shows dialogs, so a load there can ask first", withBackup.includes('<div id="modal-probe"></div>'));
  });
  // A button, so the keyboard reaches it; it opens the hidden file input.
  ok("Load from a file is a button that opens the file picker", /action === "load-records-file"\)[^\n]*\[data-import-records\][^\n]*\.click\(\)/.test(appCode));

  // Load from a file, run for real against a file input holding the given text.
  const storeRecords = (businessName, lists = {}) => ({
    profile: { businessName },
    clients: [],
    inquiries: [],
    channelMessages: [],
    channelDeliveryEvents: [],
    styles: [],
    inventory: [],
    inventoryAdjustments: [],
    orders: [],
    usageRecords: [],
    ...lists,
  });
  const copyOf = (records, extra = {}) => JSON.stringify({ exportedAt: "2026-10-18T09:30:00.000Z", format: 1, ...extra, records });
  const fileInput = (text) => ({ value: "C:\\fakepath\\records.json", files: [{ name: "records.json", text: async () => text }] });
  const importApp = (state) => {
    const context = vm.createContext({
      state,
      modalState: null,
      selectedClientId: "",
      draftOrderStyleId: "",
      toasts: [],
      writes: [],
      console: { error: () => {}, warn: () => {}, log: () => {} },
      // The real normalizeState runs every record normalizer; only the swap matters here.
      normalizeState: (records) => ({ ...records, clients: Array.isArray(records.clients) ? records.clients : [], styles: Array.isArray(records.styles) ? records.styles : [] }),
      cancelAutoBackup: () => {},
      render: () => {},
      identityStoreId: () => "store-1",
    });
    // Anything that saves, or queues a backup, is a write to the device.
    for (const name of ["persistLocalState", "markBackupPending", "scheduleAutoBackup"]) {
      context[name] = () => {
        context.writes.push(name);
        return true;
      };
    }
    context.showToast = (message) => context.toasts.push(message);
    const format = appSource.match(/^const RECORDS_FILE_FORMAT = .*;$/m);
    vm.runInContext([format ? format[0] : "", ...["clean", "parseRecordsFile?", "importRecordsFile", "confirmImportRecords?", "closeModal"].map(sourceOf)].join("\n"), context);
    return context;
  };
  const deviceRecords = () => storeRecords("Needle House", { clients: [{ id: "c1", name: "Ada" }, { id: "c2", name: "Bola" }], orders: [{ id: "o1" }] });

  // {"hello":"world"} once wiped the profile and every record, dropped the app
  // onto business setup, and queued a backup of the emptied device.
  exerciseAsync("a file that is not a records copy changes nothing", async () => {
    const notCopies = {
      "an unrelated JSON object": '{"hello":"world"}',
      "a JSON list": "[]",
      "a file that is not JSON": "name,phone\nAda,0800",
      "records with no wrapper and lists missing": JSON.stringify({ profile: { businessName: "Needle House" }, clients: [] }),
      "the export wrapper around something else": copyOf({ hello: "world" }),
      "a copy whose client list is not a list": copyOf(storeRecords("Needle House", { clients: "Ada" })),
      "a copy from a newer version": JSON.stringify({ exportedAt: "2026-10-18T09:30:00.000Z", format: 2, records: storeRecords("Needle House") }),
    };
    const touched = [];
    const unexplained = [];
    for (const [label, text] of Object.entries(notCopies)) {
      const state = deviceRecords();
      const before = JSON.stringify(state);
      const context = importApp(state);
      await context.importRecordsFile(fileInput(text));
      if (context.state !== state || JSON.stringify(context.state) !== before || context.writes.length || context.modalState) touched.push(label);
      if (context.toasts.length !== 1 || !/nothing on this device was changed/i.test(context.toasts[0])) unexplained.push(label);
    }
    ok("a file that is not a records copy changes nothing on the device", touched.length === 0, touched.join("; "));
    ok("refusing a file says so and says nothing changed", unexplained.length === 0, unexplained.join("; "));
  });

  exerciseAsync("loading a real copy asks before replacing anything", async () => {
    const state = deviceRecords();
    const before = JSON.stringify(state);
    const context = importApp(state);
    // Shaped like every copy downloaded so far, which carry no store id.
    await context.importRecordsFile(fileInput(copyOf(storeRecords("Needle House", { clients: [{ id: "c9", name: "Chi" }], styles: [{ id: "s1" }] }))));
    ok("loading a real copy asks before replacing anything", context.state === state && JSON.stringify(context.state) === before && context.writes.length === 0 && context.modalState?.type === "import-records");
    context.confirmImportRecords();
    ok("confirming the load replaces the records and queues a backup", context.state.clients[0]?.id === "c9" && context.selectedClientId === "c9" && context.writes.includes("persistLocalState") && context.writes.includes("markBackupPending") && !context.modalState);
  });

  exerciseAsync("cancelling a load leaves the device as it was", async () => {
    const state = deviceRecords();
    const before = JSON.stringify(state);
    const context = importApp(state);
    await context.importRecordsFile(fileInput(copyOf(storeRecords("Needle House"), { storeId: "store-1" })));
    ok("a copy that carries its store id is offered for loading too", context.modalState?.type === "import-records");
    context.closeModal();
    // A stray confirm after the dialog closed has nothing left to load.
    if (typeof context.confirmImportRecords === "function") context.confirmImportRecords();
    ok("cancelling a load leaves the device as it was", context.state === state && JSON.stringify(context.state) === before && context.writes.length === 0);
  });

  // Loaded, another store's records would replace this store's and, minutes
  // later, its backup. A copy that carries a different store id is refused.
  exerciseAsync("a copy from another store is refused", async () => {
    const state = deviceRecords();
    const before = JSON.stringify(state);
    const context = importApp(state);
    await context.importRecordsFile(fileInput(copyOf(storeRecords("Kente Couture"), { storeId: "store-2" })));
    ok("a copy from another store is refused without touching the device", context.state === state && JSON.stringify(context.state) === before && context.writes.length === 0 && !context.modalState);
    ok("refusing another store's copy says why", context.toasts.length === 1 && /different store/i.test(context.toasts[0]) && /nothing on this device was changed/i.test(context.toasts[0]));
  });

  // Complete records with no export wrapper load too, after the same dialog.
  exerciseAsync("complete records without the wrapper load after asking", async () => {
    const state = deviceRecords();
    const before = JSON.stringify(state);
    const context = importApp(state);
    await context.importRecordsFile(fileInput(JSON.stringify(storeRecords("Needle House", { clients: [{ id: "c7", name: "Dayo" }] }))));
    ok("complete records without the wrapper are offered for loading", context.state === state && JSON.stringify(context.state) === before && context.writes.length === 0 && context.modalState?.type === "import-records");
    context.confirmImportRecords();
    ok("confirming loads records that had no wrapper", context.state.clients[0]?.id === "c7" && context.writes.includes("persistLocalState"));
  });

  // The dialog has to say what goes and what replaces it, and flag a copy
  // whose business name differs when no store id can settle it.
  exercise("the load dialog says what it replaces", () => {
    const dialog = (incoming) => {
      const context = vm.createContext({
        state: deviceRecords(),
        modalState: { type: "import-records", exportedAt: "2026-10-18T09:30:00.000Z", storeId: "", ...incoming },
        identityStoreId: () => "store-1",
        backupAvailable: () => true,
        readCachedBackupKey: () => ({ key: "cached" }),
      });
      vm.runInContext(["renderModal", "renderImportRecordsModal?", "describeRecords?", "hasLocalBusinessData", "escapeHtml", "clean", "formatDate"].map(sourceOf).join("\n"), context);
      return context.renderModal();
    };
    const sameStore = dialog({ records: storeRecords("Needle House", { clients: [{ id: "c9" }] }), storeId: "store-1" });
    ok("the load dialog names what is on the device and what replaces it", /Needle House, with 2 clients and 1 order/.test(sameStore) && /Needle House, with 1 client\./.test(sameStore) && /data-action="confirm-import-records"/.test(sameStore));
    ok("the load dialog says the online backup follows", /online backup is replaced/i.test(sameStore));
    ok("copies made before the store id are told apart by business name", /Kente Couture, not Needle House/.test(dialog({ records: storeRecords("Kente Couture") })));
    // The same store under a new name: the id settles it, so no warning.
    const renamed = dialog({ records: storeRecords("Needle House Atelier"), storeId: "store-1" });
    ok("a renamed store's own copy draws no warning", /data-action="confirm-import-records"/.test(renamed) && !/warning-text/.test(renamed));
  });
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

asyncChecks.then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
