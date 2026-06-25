const http = require("http");
const path = require("path");
const fs = require("fs/promises");
const { appendInboundMessage, normalizeChannelMessages } = require("./api/_inbound");

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const AUTH_FILE = path.join(DATA_DIR, "auth.json");
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
    console.error(error);
    const statusCode = error.statusCode || 500;
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
  if (request.method === "OPTIONS" && url.pathname === "/api/inbound") {
    response.writeHead(204, { Allow: "GET, POST, OPTIONS" });
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, storage: "json-file", timestamp: new Date().toISOString() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const [stateResult, authResult] = await Promise.all([
      readJsonWithExists(STATE_FILE),
      readJsonWithExists(AUTH_FILE),
    ]);
    sendJson(response, 200, {
      state: stateResult.value,
      stateExists: stateResult.exists,
      auth: authResult.value,
      authExists: authResult.exists,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/inbound") {
    const result = await readJsonWithExists(STATE_FILE);
    sendJson(response, 200, {
      messages: normalizeChannelMessages(result.value?.channelMessages),
      exists: result.exists,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/inbound") {
    const result = await readJsonWithExists(STATE_FILE);
    const next = appendInboundMessage(result.value || {}, await readJsonBody(request));
    await writeJsonAtomic(STATE_FILE, next.state);
    sendJson(response, 201, { ok: true, message: next.message });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    const result = await readJsonWithExists(STATE_FILE);
    sendJson(response, 200, { state: result.value, exists: result.exists });
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/state") {
    const body = await readJsonBody(request);
    await writeJsonAtomic(STATE_FILE, body);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/auth") {
    const result = await readJsonWithExists(AUTH_FILE);
    sendJson(response, 200, { auth: result.value, exists: result.exists });
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/auth") {
    const body = await readJsonBody(request);
    await writeJsonAtomic(AUTH_FILE, body);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/api/data") {
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

  if (!chunks.length) return null;

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    error.statusCode = 400;
    throw error;
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}
