const http = require("http");
const path = require("path");
const fs = require("fs/promises");
const {
  acceptStaffInvite,
  buildClearSessionCookie,
  buildSessionCookie,
  changePassword,
  createRecoveryCode,
  createStaff,
  createStaffInvite,
  deleteStaff,
  normalizeAuthDocument,
  reactivateStaff,
  redeemRecoveryCode,
  requireManager,
  requireSession,
  resetUserPassword,
  resolveSession,
  sanitizeAuth,
  sanitizeInvite,
  signIn,
  signOut,
  signUpManager,
  suspendStaff,
  updateStaffAccess,
} = require("./api/_auth");
const {
  buildRecord: buildWorkspaceCodeRecord,
  generateWorkspaceCode,
  hashWorkspaceCode,
  isUsable: isWorkspaceCodeUsable,
  normalizeWorkspaceCode,
  splitCombinedInvite,
  throwCodeMismatch,
} = require("./api/_workspace_codes");
const { assertRedeemAllowed } = require("./api/_rate_limit");
const { appendWebhookMessages } = require("./api/_channel_intake");
const { normalizeWebhookPayload, requireWebhookSignatureConfig, verifyWebhookChallenge, verifyWebhookSignature } = require("./api/_channel_webhook");
const { appendInboundMessage, normalizeChannelMessages } = require("./api/_inbound");

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const AUTH_FILE = path.join(DATA_DIR, "auth.json");
// Local dev is single-workspace and file-backed, so codes live in a file rather
// than the Supabase table. The security-critical logic -- hashing, expiry,
// single use -- is shared with production via api/_workspace_codes.js; only the
// persistence differs.
const WORKSPACE_CODES_FILE = path.join(DATA_DIR, "workspace-codes.json");
const LOCAL_WORKSPACE_ID = "local";
const PORT = Number(process.env.PORT || 4179);
const BODY_LIMIT = 1024 * 1024 * 5;

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
    "/api/data": "GET, DELETE, OPTIONS",
    "/api/health": "GET, OPTIONS",
    "/api/inbound": "GET, POST, OPTIONS",
    "/api/keepalive": "GET, OPTIONS",
    "/api/readiness": "GET, OPTIONS",
    "/api/session": "GET, POST, OPTIONS",
    "/api/workspace-code": "POST, OPTIONS",
    "/api/state": "GET, PUT, OPTIONS",
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
    // warm. Answer for route parity with the deployed Vercel cron target.
    sendJson(response, 200, {
      ok: true,
      storage: "json-file",
      workspace: process.env.FASHION_STORE_WORKSPACE_ID || "default",
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
    const [stateResult, authResult] = await Promise.all([
      readJsonWithExists(STATE_FILE),
      readJsonWithExists(AUTH_FILE),
    ]);
    const normalized = normalizeAuthDocument(authResult.value || {});
    if (authResult.exists && normalized.changed) {
      await writeJsonAtomic(AUTH_FILE, normalized.auth);
    }
    const resolved = resolveSession(normalized.auth, request);
    const canReadState = !normalized.auth.users.length || Boolean(resolved.user);
    sendJson(response, 200, {
      state: canReadState ? stateResult.value : null,
      stateExists: stateResult.exists,
      auth: sanitizeAuth(normalized.auth, resolved.user?.id || ""),
      authExists: authResult.exists || normalized.auth.users.length > 0,
      authenticated: Boolean(resolved.user),
      stateLocked: !canReadState && stateResult.exists,
    });
    return;
  }

  if (url.pathname === "/api/workspace-code" && request.method === "POST") {
    const body = (await readJsonBody(request)) || {};
    const action = String(body.action || "").trim();

    if (action === "redeem") {
      assertRedeemAllowed(request);
      const result = await redeemLocalWorkspaceCode(body.code, "join");
      sendJson(response, 200, { ok: true, workspaceId: result.workspaceId });
      return;
    }

    if (action === "create") {
      const { auth } = await readAuthDocument();
      const { user } = requireManager(auth, request);
      // See api/workspace-code.js: requireManager treats a workspace with no
      // accounts as unlocked, so issuing needs its own guard.
      if (!user || user.role !== "manager") {
        const error = new Error("Only a manager can create a workspace code.");
        error.statusCode = 401;
        throw error;
      }
      const issued = await issueLocalWorkspaceCode("join", user.id);
      sendJson(response, 201, { ok: true, workspaceCode: issued.workspaceCode, expiresAt: issued.expiresAt });
      return;
    }

    const error = new Error("Unknown workspace code action");
    error.statusCode = 400;
    throw error;
  }

  if (url.pathname === "/api/session") {
    const { auth, exists, changed } = await readAuthDocument();
    if (exists && changed) {
      await writeJsonAtomic(AUTH_FILE, auth);
    }

    if (request.method === "GET") {
      await sendSessionPayload(response, request, auth);
      return;
    }

    if (request.method === "POST") {
      const body = (await readJsonBody(request)) || {};
      const action = String(body.action || "").trim();

      if (action === "signup") {
        const result = signUpManager(auth, body);
        await writeJsonAtomic(AUTH_FILE, result.auth);
        response.setHeader("Set-Cookie", buildSessionCookie(result.token, request));
        await sendSessionPayload(response, request, result.auth, 201, { session: result.session, user: result.user }, {
          recovery: { recoveryCode: result.recoveryCode },
        });
        return;
      }

      if (action === "signin") {
        const result = signIn(auth, body);
        await writeJsonAtomic(AUTH_FILE, result.auth);
        response.setHeader("Set-Cookie", buildSessionCookie(result.token, request));
        await sendSessionPayload(response, request, result.auth, 200, { session: result.session, user: result.user });
        return;
      }

      if (action === "accept-invite") {
        // Local dev is single-workspace, so redeeming the code only marks it
        // used. Production resolves a different workspace here.
        const combined = splitCombinedInvite(body.inviteCode || body.code || "");
        let joinedWorkspaceId = "";
        if (combined.workspaceCode) {
          const redeemed = await redeemLocalWorkspaceCode(combined.workspaceCode, "invite");
          joinedWorkspaceId = redeemed.workspaceId;
        }
        const result = acceptStaffInvite(auth, {
          ...body,
          inviteToken: combined.inviteToken || body.inviteToken || body.token,
        });
        await writeJsonAtomic(AUTH_FILE, result.auth);
        response.setHeader("Set-Cookie", buildSessionCookie(result.token, request));
        await sendSessionPayload(response, request, result.auth, 200, { session: result.session, user: result.user }, { joinedWorkspaceId });
        return;
      }

      // Unauthenticated by necessity, and deliberately issues no session.
      if (action === "redeem-recovery-code") {
        const result = redeemRecoveryCode(auth, body);
        await writeJsonAtomic(AUTH_FILE, result.auth);
        sendJson(response, 200, {
          ok: true,
          authenticated: false,
          auth: sanitizeAuth(result.auth),
          state: null,
          stateExists: false,
          passwordReset: true,
        });
        return;
      }

      if (action === "signout") {
        const nextAuth = signOut(auth, request);
        await writeJsonAtomic(AUTH_FILE, nextAuth);
        response.setHeader("Set-Cookie", buildClearSessionCookie(request));
        sendJson(response, 200, {
          ok: true,
          authenticated: false,
          auth: sanitizeAuth(nextAuth),
          state: null,
          stateExists: false,
        });
        return;
      }

      const { session, user } = requireSession(auth, request);

      if (action === "create-staff") {
        const nextAuth = createStaff(auth, user, body);
        await writeJsonAtomic(AUTH_FILE, nextAuth);
        await sendSessionPayload(response, request, nextAuth, 201);
        return;
      }

      if (action === "create-staff-invite") {
        const result = createStaffInvite(auth, user, body);
        await writeJsonAtomic(AUTH_FILE, result.auth);
        const issued = await issueLocalWorkspaceCode("invite", user?.id);
        const invite = sanitizeInvite(
          result.auth.users.find((item) => item.email === result.invite.email) || {},
          result.inviteToken,
          issued.workspaceCode,
        );
        await sendSessionPayload(response, request, result.auth, 201, null, { invite });
        return;
      }

      if (action === "update-staff-access") {
        const nextAuth = updateStaffAccess(auth, user, body);
        await writeJsonAtomic(AUTH_FILE, nextAuth);
        await sendSessionPayload(response, request, nextAuth);
        return;
      }

      if (action === "create-recovery-code") {
        const result = createRecoveryCode(auth, user);
        await writeJsonAtomic(AUTH_FILE, result.auth);
        await sendSessionPayload(response, request, result.auth, 201, null, { recovery: result.recovery });
        return;
      }

      if (action === "reset-user-password") {
        const result = resetUserPassword(auth, user, body);
        await writeJsonAtomic(AUTH_FILE, result.auth);
        await sendSessionPayload(response, request, result.auth, 201, null, { recovery: result.recovery });
        return;
      }

      if (action === "change-password") {
        const nextAuth = changePassword(auth, user, body, session);
        await writeJsonAtomic(AUTH_FILE, nextAuth);
        await sendSessionPayload(response, request, nextAuth);
        return;
      }

      if (action === "suspend-staff") {
        const nextAuth = suspendStaff(auth, user, body);
        await writeJsonAtomic(AUTH_FILE, nextAuth);
        await sendSessionPayload(response, request, nextAuth);
        return;
      }

      if (action === "reactivate-staff") {
        const nextAuth = reactivateStaff(auth, user, body);
        await writeJsonAtomic(AUTH_FILE, nextAuth);
        await sendSessionPayload(response, request, nextAuth);
        return;
      }

      if (action === "delete-staff") {
        const nextAuth = deleteStaff(auth, user, body);
        await writeJsonAtomic(AUTH_FILE, nextAuth);
        await sendSessionPayload(response, request, nextAuth);
        return;
      }

      const error = new Error("Unknown session action");
      error.statusCode = 400;
      throw error;
    }
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

  if (request.method === "GET" && url.pathname === "/api/inbound") {
    const { auth } = await readAuthDocument();
    requireSession(auth, request);
    const result = await readJsonWithExists(STATE_FILE);
    sendJson(response, 200, {
      messages: normalizeChannelMessages(result.value?.channelMessages),
      exists: result.exists,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/inbound") {
    const { auth } = await readAuthDocument();
    requireSession(auth, request);
    const result = await readJsonWithExists(STATE_FILE);
    const next = appendInboundMessage(result.value || {}, await readJsonBody(request));
    await writeJsonAtomic(STATE_FILE, next.state);
    sendJson(response, 201, { ok: true, message: next.message });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    const { auth } = await readAuthDocument();
    requireSession(auth, request);
    const result = await readJsonWithExists(STATE_FILE);
    sendJson(response, 200, { state: result.value, exists: result.exists });
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/state") {
    const { auth } = await readAuthDocument();
    requireSession(auth, request);
    const body = await readJsonBody(request);
    await writeJsonAtomic(STATE_FILE, body);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/auth") {
    const { auth, exists } = await readAuthDocument();
    const resolved = resolveSession(auth, request);
    sendJson(response, 200, {
      auth: sanitizeAuth(auth, resolved.user?.id || ""),
      authenticated: Boolean(resolved.user),
      exists: exists || auth.users.length > 0,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/data") {
    const { auth } = await readAuthDocument();
    const { user } = requireManager(auth, request);
    const stateResult = await readJsonWithExists(STATE_FILE);
    sendJson(response, 200, {
      ok: true,
      exportedAt: new Date().toISOString(),
      storage: { storage: "json-file", workspace: "local", configured: true },
      state: stateResult.value,
      stateExists: stateResult.exists,
      auth: sanitizeAuth(auth, user.id),
      authExists: auth.users.length > 0,
    });
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/api/data") {
    const { auth } = await readAuthDocument();
    requireManager(auth, request);
    await Promise.all([removeIfExists(STATE_FILE), removeIfExists(AUTH_FILE)]);
    sendJson(response, 200, { ok: true });
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

// File-backed equivalents of the Supabase-backed helpers in
// api/_workspace_codes.js. Same validation, same single-use and expiry rules;
// only the storage differs.
async function issueLocalWorkspaceCode(kind, createdByUserId) {
  const workspaceCode = generateWorkspaceCode();
  const record = buildWorkspaceCodeRecord(workspaceCode, LOCAL_WORKSPACE_ID, kind, createdByUserId);
  const existing = await readJsonWithExists(WORKSPACE_CODES_FILE);
  const rows = Array.isArray(existing.value) ? existing.value : [];
  rows.push(record);
  await writeJsonAtomic(WORKSPACE_CODES_FILE, rows);
  return { workspaceCode, expiresAt: record.expires_at, kind };
}

async function redeemLocalWorkspaceCode(rawCode, kind) {
  const normalized = normalizeWorkspaceCode(rawCode);
  if (!normalized) throwCodeMismatch();
  const codeHash = hashWorkspaceCode(normalized);
  const existing = await readJsonWithExists(WORKSPACE_CODES_FILE);
  const rows = Array.isArray(existing.value) ? existing.value : [];
  const record = rows.find((row) => row.code_hash === codeHash && row.kind === kind);
  if (!isWorkspaceCodeUsable(record)) throwCodeMismatch();
  record.redeemed_at = new Date().toISOString();
  await writeJsonAtomic(WORKSPACE_CODES_FILE, rows);
  return { workspaceId: record.workspace_id, kind };
}

async function readAuthDocument() {
  const result = await readJsonWithExists(AUTH_FILE);
  const normalized = normalizeAuthDocument(result.value || {});
  if (result.exists && normalized.changed) {
    await writeJsonAtomic(AUTH_FILE, normalized.auth);
  }
  return {
    auth: normalized.auth,
    exists: result.exists,
    changed: normalized.changed,
  };
}

async function sendSessionPayload(response, request, auth, statusCode = 200, resolvedOverride = null, extra = {}) {
  const resolved = resolvedOverride || resolveSession(auth, request);
  const stateResult = resolved.user ? await readJsonWithExists(STATE_FILE) : { value: null, exists: false };
  sendJson(response, statusCode, {
    ok: true,
    authenticated: Boolean(resolved.user),
    auth: sanitizeAuth(auth, resolved.user?.id || ""),
    state: stateResult.value,
    stateExists: stateResult.exists,
    sessionExpiresAt: resolved.session?.expiresAt || "",
    ...extra,
  });
}

async function removeIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
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
