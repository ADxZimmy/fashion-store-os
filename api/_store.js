const TABLE_NAME = "fashion_store_os_documents";
const DOCUMENT_KEYS = new Set(["state", "auth"]);

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

function workspaceId() {
  const id = normalizeEnv(process.env.FASHION_STORE_WORKSPACE_ID) || "default";
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)) {
    const error = new Error("Workspace id must be 1-64 letters, numbers, dashes, or underscores");
    error.statusCode = 503;
    throw error;
  }
  return id;
}

function getStorageSummary() {
  const workspace = safeWorkspaceId();
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

async function probeStorage() {
  await supabaseRequest(
    "GET",
    `/${TABLE_NAME}?workspace_id=eq.${encodeURIComponent(workspaceId())}&select=workspace_id&limit=1`,
  );
  return getStorageSummary();
}

async function getDocument(documentKey) {
  assertDocumentKey(documentKey);
  const rows = await supabaseRequest(
    "GET",
    `/${TABLE_NAME}?workspace_id=eq.${encodeURIComponent(workspaceId())}&document_key=eq.${encodeURIComponent(documentKey)}&select=document&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return {
    exists: Boolean(row),
    value: row ? row.document : null,
  };
}

async function setDocument(documentKey, document) {
  assertDocumentKey(documentKey);
  await ensureWorkspaceDocument(documentKey);
  await supabaseRequest(
    "POST",
    `/${TABLE_NAME}?on_conflict=workspace_id,document_key`,
    [
      {
        workspace_id: workspaceId(),
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

async function ensureWorkspaceDocument(documentKey) {
  const workspace = workspaceId();
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

async function removeDocuments(documentKeys) {
  const keys = documentKeys.map((documentKey) => {
    assertDocumentKey(documentKey);
    return documentKey;
  });

  if (!keys.length) return;

  const quotedKeys = keys.map((key) => `"${key.replace(/"/g, '\\"')}"`).join(",");
  await supabaseRequest(
    "DELETE",
    `/${TABLE_NAME}?workspace_id=eq.${encodeURIComponent(workspaceId())}&document_key=in.(${quotedKeys})`,
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

function safeWorkspaceId() {
  try {
    return workspaceId();
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
  getDocument,
  getSupabaseConfig,
  getStorageSummary,
  probeStorage,
  removeDocuments,
  setDocument,
};
