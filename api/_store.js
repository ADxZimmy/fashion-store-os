const TABLE_NAME = "fashion_store_os_documents";
const DOCUMENT_KEYS = new Set(["state", "auth"]);

function getSupabaseConfig() {
  const supabaseUrl = trimTrailingSlash(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const apiKey =
    process.env.SUPABASE_REST_API_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    "";

  if (!supabaseUrl || !apiKey) {
    const error = new Error("Production storage is not configured");
    error.statusCode = 503;
    throw error;
  }

  return { supabaseUrl, apiKey };
}

function workspaceId() {
  return process.env.FASHION_STORE_WORKSPACE_ID || "default";
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

async function supabaseRequest(method, pathAndQuery, body, extraHeaders = {}, expectedStatuses = [200]) {
  const { supabaseUrl, apiKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1${pathAndQuery}`, {
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

  if (!expectedStatuses.includes(response.status)) {
    const error = new Error(await readSupabaseError(response));
    error.statusCode = response.status >= 400 && response.status < 500 ? 502 : response.status;
    throw error;
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
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
  return value.replace(/\/+$/, "");
}

module.exports = {
  getDocument,
  getSupabaseConfig,
  removeDocuments,
  setDocument,
};
