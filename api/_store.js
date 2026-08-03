const TABLE_NAME = "fashion_store_os_documents";
const DOCUMENT_KEYS = new Set(["state", "auth"]);
const WORKSPACE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function getSupabaseConfig() {
  const supabaseUrl = trimTrailingSlash(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const key = resolveSupabaseKey();

  if (!supabaseUrl || !key.value) {
    const error = new Error("Production storage is not configured");
    error.statusCode = 503;
    throw error;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch (error) {
    error.message = "Production storage URL is invalid";
    error.statusCode = 503;
    throw error;
  }

  if (parsedUrl.protocol !== "https:") {
    const error = new Error("Production storage URL must use HTTPS");
    error.statusCode = 503;
    throw error;
  }

  return { supabaseUrl, apiKey: key.value, keySource: key.source, host: parsedUrl.host };
}

// The configured fallback workspace (env). Used for legacy/server-side calls and
// inbound provider webhooks that cannot carry a per-device workspace header.
function defaultWorkspaceId() {
  const id = normalizeEnv(process.env.FASHION_STORE_WORKSPACE_ID) || "default";
  if (!WORKSPACE_ID_PATTERN.test(id)) {
    const error = new Error("Workspace id must be 1-64 letters, numbers, dashes, or underscores");
    error.statusCode = 503;
    throw error;
  }
  return id;
}

// Validate a client-supplied workspace id (400 on bad input, not 503).
function validateWorkspaceId(id) {
  const value = normalizeEnv(id);
  if (!WORKSPACE_ID_PATTERN.test(value)) {
    const error = new Error("Workspace id is invalid");
    error.statusCode = 400;
    throw error;
  }
  return value;
}

// Per-device tenancy: the browser generates a random workspace id and sends it
// as the x-workspace-id header, so each device gets an isolated workspace. Falls
// back to the configured default when no header is present.
function resolveWorkspaceId(request) {
  const headers = request && request.headers ? request.headers : {};
  const raw = headers["x-workspace-id"] || headers["X-Workspace-Id"];
  const value = normalizeEnv(Array.isArray(raw) ? raw[0] : raw);
  return value ? validateWorkspaceId(value) : defaultWorkspaceId();
}

// Bind the resolved workspace to every storage call so a handler can never
// accidentally read or write another tenant's documents.
function storeForRequest(request) {
  return storeForWorkspace(resolveWorkspaceId(request));
}

// Bind to a workspace resolved by something other than the request header. The
// only caller is invite acceptance, where a redeemed workspace code names the
// workspace before the device has ever addressed it. The workspace id must come
// from a redeemed code, never from client input.
function storeForWorkspace(workspaceId) {
  const workspace = validateWorkspaceId(workspaceId);
  return {
    workspace,
    getDocument: (documentKey) => getDocument(documentKey, workspace),
    setDocument: (documentKey, document) => setDocument(documentKey, document, workspace),
    removeDocuments: (documentKeys) => removeDocuments(documentKeys, workspace),
  };
}

function getStorageSummary() {
  const workspace = safeDefaultWorkspaceId();
  try {
    const { host, keySource } = getSupabaseConfig();
    return {
      configured: true,
      host,
      keySource,
      storage: "supabase",
      workspace,
    };
  } catch (error) {
    return {
      configured: false,
      error: error.message,
      storage: "unconfigured",
      workspace,
    };
  }
}

async function probeStorage(workspace = defaultWorkspaceId()) {
  await supabaseRequest(
    "GET",
    `/${TABLE_NAME}?workspace_id=eq.${encodeURIComponent(workspace)}&select=workspace_id&limit=1`,
  );
  return getStorageSummary();
}

async function getDocument(documentKey, workspace = defaultWorkspaceId()) {
  assertDocumentKey(documentKey);
  const rows = await supabaseRequest(
    "GET",
    `/${TABLE_NAME}?workspace_id=eq.${encodeURIComponent(workspace)}&document_key=eq.${encodeURIComponent(documentKey)}&select=document&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return {
    exists: Boolean(row),
    value: row ? row.document : null,
  };
}

async function setDocument(documentKey, document, workspace = defaultWorkspaceId()) {
  assertDocumentKey(documentKey);
  await ensureWorkspaceDocument(workspace);
  await supabaseRequest(
    "POST",
    `/${TABLE_NAME}?on_conflict=workspace_id,document_key`,
    [
      {
        workspace_id: workspace,
        document_key: documentKey,
        document,
      },
    ],
    {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    [200, 201, 204],
  );
}

async function ensureWorkspaceDocument(workspace) {
  await supabaseRequest(
    "POST",
    "/fashion_store_os_workspaces?on_conflict=workspace_id",
    [
      {
        workspace_id: workspace,
        name: workspace === "default" ? "Default workspace" : workspace,
        status: "active",
      },
    ],
    {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    [200, 201, 204],
    { optional: true },
  );
}

async function removeDocuments(documentKeys, workspace = defaultWorkspaceId()) {
  const keys = documentKeys.map((documentKey) => {
    assertDocumentKey(documentKey);
    return documentKey;
  });

  if (!keys.length) return;

  const quotedKeys = keys.map((key) => `"${key.replace(/"/g, '\\"')}"`).join(",");
  await supabaseRequest(
    "DELETE",
    `/${TABLE_NAME}?workspace_id=eq.${encodeURIComponent(workspace)}&document_key=in.(${quotedKeys})`,
    undefined,
    { Prefer: "return=minimal" },
    [200, 202, 204],
  );
}

async function supabaseRequest(method, pathAndQuery, body, extraHeaders = {}, expectedStatuses = [200], options = {}) {
  const { supabaseUrl, apiKey } = getSupabaseConfig();
  const endpoint = `${supabaseUrl}/rest/v1${pathAndQuery}`;
  let response;

  try {
    response = await fetch(endpoint, {
      method,
      headers: {
        Accept: "application/json",
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    const error = new Error(`Supabase request failed: ${cause.message || "network request failed"}`);
    error.statusCode = 502;
    error.publicMessage = "Production storage is unreachable";
    error.cause = cause;
    throw error;
  }

  if (!expectedStatuses.includes(response.status)) {
    if (options.optional && [401, 403, 404].includes(response.status)) {
      return null;
    }
    const error = new Error(await readSupabaseError(response));
    error.statusCode = 502;
    error.publicMessage = "Production storage request failed";
    error.storageStatus = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function resolveSupabaseKey() {
  const candidates = [
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
    ["SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY],
    ["SUPABASE_SERVICE_KEY", process.env.SUPABASE_SERVICE_KEY],
    ["SUPABASE_REST_API_KEY", process.env.SUPABASE_REST_API_KEY],
  ];
  for (const [source, value] of candidates) {
    const normalized = normalizeEnv(value);
    if (normalized) return { source, value: normalized };
  }

  if (process.env.FASHION_STORE_ALLOW_PUBLIC_SUPABASE_KEY === "1") {
    const fallback =
      normalizeEnv(process.env.SUPABASE_PUBLISHABLE_KEY) ||
      normalizeEnv(process.env.SUPABASE_ANON_KEY);
    if (fallback) return { source: "PUBLIC_KEY_FALLBACK", value: fallback };
  }

  return { source: "", value: "" };
}

function safeDefaultWorkspaceId() {
  try {
    return defaultWorkspaceId();
  } catch (error) {
    return "invalid";
  }
}

async function readSupabaseError(response) {
  try {
    const payload = await response.json();
    return payload.message || payload.error || `Supabase responded with ${response.status}`;
  } catch (error) {
    return `Supabase responded with ${response.status}`;
  }
}

function assertDocumentKey(documentKey) {
  if (!DOCUMENT_KEYS.has(documentKey)) {
    const error = new Error("Invalid document key");
    error.statusCode = 400;
    throw error;
  }
}

function trimTrailingSlash(value) {
  return normalizeEnv(value).replace(/\/+$/, "");
}

function normalizeEnv(value) {
  return String(value || "").trim();
}

module.exports = {
  WORKSPACE_ID_PATTERN,
  getDocument,
  getSupabaseConfig,
  getStorageSummary,
  probeStorage,
  removeDocuments,
  resolveWorkspaceId,
  setDocument,
  storeForRequest,
  storeForWorkspace,
  // Exported for api/_workspace_codes.js only. Workspace codes are keyed by
  // hash rather than by workspace, because the caller redeeming one does not
  // yet know which workspace they are joining, so they cannot go through
  // storeForRequest. Any other caller should use storeForRequest.
  supabaseRequest,
  validateWorkspaceId,
};
