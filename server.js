const http = require("http");
const path = require("path");
const fs = require("fs/promises");
// Phase 021: api/_auth.js (the per-workspace auth document) has no consumer
// here any more. Identity is row-based; the only legacy surface left is the
// channel webhook's state document, which step 5 replaces with the inbox.
const { sweepIdentity } = require("./api/_identity");
const { handleIdentityGet, handleSessionAction } = require("./api/_identity_http");
const { createLocalIdentityStore } = require("./api/_identity_local");
const { appendWebhookMessages } = require("./api/_channel_intake");
const { normalizeWebhookPayload, requireWebhookSignatureConfig, verifyWebhookChallenge, verifyWebhookSignature } = require("./api/_channel_webhook");

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const AUTH_FILE = path.join(DATA_DIR, "auth.json");
const PORT = Number(process.env.PORT || 4179);
const BODY_LIMIT = 1024 * 1024 * 5;
// Row-based identity, file-backed: data/identity.json mirrors the Supabase
// identity tables so local dev exercises the same core as production.
const identityDb = createLocalIdentityStore(DATA_DIR);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    await routeRequest(request, response);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error(error);
    }
    const message = statusCode >= 500 ? "Internal server error" : error.message;
    sendJson(response, statusCode, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`Fashion Store OS running at http://localhost:${PORT}`);
});

async function routeRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    await routeApi(request, response, url);
    return;
  }

  await serveStatic(url.pathname, response);
}

async function routeApi(request, response, url) {
  const optionsAllow = {
    "/api/auth": "GET, OPTIONS",
    "/api/bootstrap": "GET, OPTIONS",
    "/api/channel-webhook": "GET, POST, OPTIONS",
    "/api/data": "OPTIONS",
    "/api/health": "GET, OPTIONS",
    "/api/inbound": "OPTIONS",
    "/api/keepalive": "GET, OPTIONS",
    "/api/readiness": "GET, OPTIONS",
    "/api/session": "POST, OPTIONS",
    "/api/workspace-code": "OPTIONS",
    "/api/state": "OPTIONS",
  };

  if (request.method === "OPTIONS" && optionsAllow[url.pathname]) {
    response.writeHead(204, { Allow: optionsAllow[url.pathname] });
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, storage: "json-file", timestamp: new Date().toISOString() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/keepalive") {
    // Local storage is a json file and never pauses, so there is nothing to keep
    // warm. Runs the identity retention sweep for parity with the deployed cron.
    let sweep = null;
    try {
      sweep = await sweepIdentity(identityDb);
    } catch (sweepError) {
      console.error("identity sweep failed", sweepError);
      sweep = { ok: false, error: sweepError.message };
    }
    sendJson(response, 200, {
      ok: true,
      storage: "json-file",
      workspace: process.env.FASHION_STORE_WORKSPACE_ID || "default",
      sweep,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/readiness") {
    const releaseOwner = String(process.env.FASHION_STORE_RELEASE_OWNER || "ADxZimmy").trim();
    const signatureRequired = process.env.CHANNEL_WEBHOOK_REQUIRE_SIGNATURE === "1";
    const checks = [
      { name: "local storage configured", ok: true, detail: "json-file" },
      { name: "workspace id valid", ok: true, detail: process.env.FASHION_STORE_WORKSPACE_ID || "default" },
      {
        name: "webhook signatures required in production",
        ok: signatureRequired,
        detail: signatureRequired ? "Required" : "Optional in local development",
      },
      { name: "owner release lane", ok: releaseOwner === "ADxZimmy", detail: releaseOwner },
      { name: "operations runbook present", ok: true, detail: "docs/operations-runbook.md" },
    ];
    sendJson(response, 200, {
      ok: checks.every((check) => check.ok || check.name === "webhook signatures required in production"),
      mode: "local",
      storage: "json-file",
      workspace: process.env.FASHION_STORE_WORKSPACE_ID || "default",
      checks,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    // Phase 021: identity/session check only. Business state lives on the
    // device; this response must never carry it or gate it.
    await handleIdentityGet(identityDb, request, response);
    return;
  }

  // Phase 021 Release A: retired endpoints answer 410 here exactly as they do
  // in api/_gone.js, so local dev and production agree about what is gone.
  if (["/api/state", "/api/inbound", "/api/data", "/api/workspace-code"].includes(url.pathname)) {
    sendJson(response, 410, {
      ok: false,
      error: "Business data is stored on your device and is no longer synced to the server.",
      retired: "Phase 021 moved business data onto the device. This endpoint no longer exists.",
    });
    return;
  }

  if (url.pathname === "/api/session" && request.method === "POST") {
    // Phase 021: every identity action dispatches through the same module the
    // serverless function uses; only the storage adapter differs.
    const body = (await readJsonBody(request)) || {};
    await handleSessionAction(identityDb, request, response, body);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/channel-webhook") {
    const challenge = verifyWebhookChallenge(url.searchParams, process.env.CHANNEL_WEBHOOK_VERIFY_TOKEN || "");
    if (challenge !== null) {
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(challenge);
      return;
    }

    sendJson(response, 200, {
      ok: true,
      accepts: "POST",
      verification: "Send hub.challenge and matching verify token to complete provider setup.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/channel-webhook") {
    const rawBody = await readRawBody(request);
    const secret = process.env.CHANNEL_WEBHOOK_SECRET || "";
    requireWebhookSignatureConfig(secret, process.env.CHANNEL_WEBHOOK_REQUIRE_SIGNATURE === "1");
    verifyWebhookSignature(
      rawBody,
      secret,
      request.headers["x-hub-signature-256"] || request.headers["x-fashion-signature"] || "",
    );

    let payload;
    try {
      payload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
    } catch (error) {
      error.statusCode = 400;
      error.message = "Invalid JSON body";
      throw error;
    }

    const messages = normalizeWebhookPayload(payload);
    const result = await readJsonWithExists(STATE_FILE);
    const intake = appendWebhookMessages(result.value || {}, messages, {
      maxMessages: process.env.CHANNEL_WEBHOOK_MAX_MESSAGES,
    });

    if (intake.accepted.length || intake.duplicates.length || intake.rejected.length || intake.overflow) {
      await writeJsonAtomic(STATE_FILE, intake.state);
    }

    sendJson(response, intake.accepted.length ? 201 : 202, {
      ok: true,
      accepted: intake.accepted.length,
      duplicates: intake.duplicates.length,
      rejected: intake.rejected.length + intake.overflow,
      messages: intake.accepted,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/auth") {
    await handleIdentityGet(identityDb, request, response);
    return;
  }

  sendJson(response, 404, { error: "API route not found" });
}

async function serveStatic(requestPath, response) {
  const cleanPath = decodeURIComponent(requestPath.split("?")[0]);
  const safePath = cleanPath === "/" ? "/index.html" : cleanPath;

  if (isPrivatePath(safePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const targetPath = path.resolve(ROOT_DIR, `.${safePath}`);
  if (!targetPath.startsWith(ROOT_DIR)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(targetPath);
    const extension = path.extname(targetPath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(file);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    throw error;
  }
}

function isPrivatePath(requestPath) {
  return [
    "/.git/",
    "/.planning/",
    "/data/",
    "/node_modules/",
  ].some((prefix) => requestPath === prefix.slice(0, -1) || requestPath.startsWith(prefix));
}

async function readJsonWithExists(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return { exists: true, value: JSON.parse(content) };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { exists: false, value: null };
    }
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

async function readJsonBody(request) {
  const rawBody = await readRawBody(request);
  if (!rawBody.length) return null;

  try {
    return JSON.parse(rawBody.toString("utf8"));
  } catch (error) {
    error.statusCode = 400;
    throw error;
  }
}

async function readRawBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}
