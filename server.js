const http = require("http");
const path = require("path");
const fs = require("fs/promises");
// Phase 021: no legacy document plane remains. Identity, backups, and the
// transit inbox are all rows; business records live on the device. fs is only
// used to serve static files now.
const { sweepIdentity } = require("./api/_identity");
const { readBackup, removeBackup, writeBackup } = require("./api/_backup");
const { SECURITY_HEADERS } = require("./api/_security_headers");
const { RETIRED_ENDPOINTS, retiredEndpointFor, sendGone } = require("./api/_gone");
const { handleIdentityGet, handleSessionAction } = require("./api/_identity_http");
const { openDevDatabase } = require("./db/pglite");
const { acceptMessages, acknowledgeMessages, pullMessages } = require("./api/_inbox");
const { normalizeWebhookPayload, requireWebhookSignatureConfig, verifyWebhookChallenge, verifyWebhookSignature } = require("./api/_channel_webhook");

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const PORT = Number(process.env.PORT || 4179);
const BODY_LIMIT = 1024 * 1024 * 5;
// Local dev runs the production SQL adapter (api/_identity_pg.js) on PGlite,
// an embedded Postgres persisted under data/pglite. Same schema, same queries
// as Neon in production, so local behaviour predicts production behaviour --
// the file-backed fake this replaced drifted from the real adapter twice.
const devDatabase = openDevDatabase(path.join(DATA_DIR, "pglite"), (line) => console.log(`[db] ${line}`));

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
  // Same headers production sends (vercel.json carries a checked copy), set
  // before routing so every response gets them, error responses included.
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
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
  const { db: identityDb } = await devDatabase;
  const optionsAllow = {
    "/api/auth": "GET, OPTIONS",
    "/api/bootstrap": "GET, OPTIONS",
    "/api/channel-webhook": "GET, POST, OPTIONS",
    "/api/data": "OPTIONS",
    "/api/health": "GET, OPTIONS",
    "/api/inbound": "OPTIONS",
    "/api/maintenance": "GET, OPTIONS",
    "/api/readiness": "GET, OPTIONS",
    "/api/backup": "GET, PUT, DELETE, OPTIONS",
    "/api/inbox": "GET, POST, OPTIONS",
    "/api/session": "POST, OPTIONS",
    "/api/workspace-code": "OPTIONS",
    "/api/state": "OPTIONS",
    "/api/retired": "OPTIONS",
  };

  if (request.method === "OPTIONS" && optionsAllow[url.pathname]) {
    response.writeHead(204, { Allow: optionsAllow[url.pathname] });
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    await identityDb.probe();
    sendJson(response, 200, { ok: true, storage: "postgres", databaseHost: "pglite (local)", timestamp: new Date().toISOString() });
    return;
  }

  // Mirrors api/maintenance.js: the daily retention sweep the Vercel cron runs.
  if (request.method === "GET" && url.pathname === "/api/maintenance") {
    const sweep = await sweepIdentity(identityDb);
    sendJson(response, 200, { ok: true, storage: "postgres", databaseHost: "pglite (local)", sweep, timestamp: new Date().toISOString() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/readiness") {
    const releaseOwner = String(process.env.FASHION_STORE_RELEASE_OWNER || "ADxZimmy").trim();
    const signatureRequired = process.env.CHANNEL_WEBHOOK_REQUIRE_SIGNATURE === "1";
    await identityDb.probe();
    const checks = [
      { name: "database configured", required: true, ok: true, detail: "pglite (local)" },
      { name: "database reachable", required: true, ok: true, detail: "Round trip succeeded" },
      { name: "owner release lane", required: true, ok: releaseOwner === "ADxZimmy", detail: releaseOwner },
      {
        name: "webhook signatures required",
        required: false,
        ok: signatureRequired,
        detail: signatureRequired ? "Required" : "Optional in local development",
      },
      {
        name: "channel intake bound to a store",
        required: false,
        ok: Boolean(String(process.env.FASHION_STORE_INBOX_STORE_ID || "").trim()),
        detail: String(process.env.FASHION_STORE_INBOX_STORE_ID || "").trim() || "FASHION_STORE_INBOX_STORE_ID not set",
      },
    ];
    sendJson(response, 200, {
      ok: checks.filter((check) => check.required).every((check) => check.ok),
      mode: "local",
      storage: "postgres",
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

  // Phase 021 Release A: retired endpoints answer 410 through the same helper
  // as production's api/retired.js, where vercel.json rewrites these paths,
  // so local dev and production give the same answer for each one.
  if (url.pathname === "/api/retired" || ["/api/state", "/api/inbound", "/api/data", "/api/workspace-code"].includes(url.pathname)) {
    sendGone(request, response, RETIRED_ENDPOINTS[retiredEndpointFor(request)]);
    return;
  }

  // Encrypted backup: opaque ciphertext in both directions, manager-gated.
  if (url.pathname === "/api/backup") {
    if (request.method === "GET") {
      const result = await readBackup(identityDb, request);
      sendJson(response, result.status, result.payload);
      return;
    }
    if (request.method === "PUT") {
      const body = (await readJsonBody(request)) || {};
      const result = await writeBackup(identityDb, request, body);
      sendJson(response, result.status, result.payload);
      return;
    }
    if (request.method === "DELETE") {
      const result = await removeBackup(identityDb, request);
      sendJson(response, result.status, result.payload);
      return;
    }
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
    const intake = await acceptMessages(identityDb, messages, { maxMessages: process.env.CHANNEL_WEBHOOK_MAX_MESSAGES });
    sendJson(response, intake.accepted.length ? 201 : 202, {
      ok: true,
      accepted: intake.accepted.length,
      duplicates: intake.duplicates.length,
      rejected: intake.rejected.length + intake.overflow,
    });
    return;
  }

  // Transit inbox drain: GET pulls, POST acknowledges what the device stored.
  if (url.pathname === "/api/inbox") {
    if (request.method === "GET") {
      const result = await pullMessages(identityDb, request);
      sendJson(response, result.status, result.payload);
      return;
    }
    if (request.method === "POST") {
      const body = (await readJsonBody(request)) || {};
      const result = await acknowledgeMessages(identityDb, request, body);
      sendJson(response, result.status, result.payload);
      return;
    }
  }

  sendJson(response, 404, { error: "API route not found" });
}

async function serveStatic(requestPath, response) {
  const cleanPath = decodeURIComponent(requestPath.split("?")[0]);
  // The offline shell must be served from the root so its scope covers every
  // route. scripts/build.js copies src/sw.js to dist/sw.js for Vercel; this
  // mirrors that here, without which the worker 404s locally and offline
  // behaviour can only ever be seen in production.
  const safePath = cleanPath === "/" ? "/index.html" : cleanPath === "/sw.js" ? "/src/sw.js" : cleanPath;

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
    "/db/",
    "/node_modules/",
  ].some((prefix) => requestPath === prefix.slice(0, -1) || requestPath.startsWith(prefix));
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
