const crypto = require("crypto");
const { supabaseRequest, validateWorkspaceId } = require("./_store");

const TABLE_NAME = "fashion_store_os_workspace_codes";

// A join code is read off one screen and typed into another within minutes, so
// a short window costs nothing and makes a leaked or observed code worthless.
const JOIN_TTL_SECONDS = 60 * 30;
// An invite is handed to someone to use over the following days. This must NOT
// share the join TTL: the invite-kind code travels inside the combined invite
// string, so a 30-minute expiry here would kill the string two and a half days
// before the invite token it carries.
const INVITE_TTL_SECONDS = 60 * 60 * 24 * 3;

const KINDS = new Set(["join", "invite"]);
// Excludes 0/O and 1/I/L. Someone reads this aloud or copies it by hand.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
const CODE_GROUP = 5;
// `-` and `_` both occur in base64url tokens, so neither can separate a
// combined invite string. `.` does not appear in either half.
const COMBINED_SEPARATOR = ".";

// One message for unknown, expired, and already-redeemed codes. Distinguishing
// them would let a caller probe which workspaces exist.
const CODE_MISMATCH_MESSAGE = "That code is not valid. Ask for a new one.";

function ttlSecondsForKind(kind) {
  return kind === "invite" ? INVITE_TTL_SECONDS : JOIN_TTL_SECONDS;
}

function generateWorkspaceCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let raw = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    // Modulo bias is negligible here: 256 % 31 skews the first 8 symbols by
    // about 0.4%, well inside what the TTL and single use already cover.
    raw += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return raw.match(new RegExp(`.{1,${CODE_GROUP}}`, "g")).join("-");
}

// Accepts the grouped form, an ungrouped form, and any casing, so a person
// retyping a code is not punished for dropping a dash.
function normalizeWorkspaceCode(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashWorkspaceCode(value) {
  return crypto.createHash("sha256").update(normalizeWorkspaceCode(value)).digest("hex");
}

function buildCombinedInvite(workspaceCode, inviteToken) {
  return `${workspaceCode}${COMBINED_SEPARATOR}${inviteToken}`;
}

// Splits on the FIRST separator only. The invite token is base64url and cannot
// contain `.`, but splitting on the last separator would silently misparse if
// that ever changed.
function splitCombinedInvite(value) {
  const trimmed = String(value ?? "").trim();
  const index = trimmed.indexOf(COMBINED_SEPARATOR);
  if (index <= 0 || index === trimmed.length - 1) {
    return { workspaceCode: "", inviteToken: "" };
  }
  return {
    workspaceCode: trimmed.slice(0, index),
    inviteToken: trimmed.slice(index + 1),
  };
}

function assertKind(kind) {
  if (!KINDS.has(kind)) {
    const error = new Error("Invalid workspace code kind");
    error.statusCode = 400;
    throw error;
  }
}

function throwCodeMismatch() {
  const error = new Error(CODE_MISMATCH_MESSAGE);
  error.statusCode = 404;
  throw error;
}

function isUsable(record, now = Date.now()) {
  if (!record) return false;
  if (record.redeemed_at) return false;
  return Date.parse(record.expires_at) > now;
}

function buildRecord(workspaceCode, workspaceId, kind, createdByUserId) {
  assertKind(kind);
  validateWorkspaceId(workspaceId);
  const now = Date.now();
  return {
    code_hash: hashWorkspaceCode(workspaceCode),
    workspace_id: workspaceId,
    kind,
    created_by_user_id: String(createdByUserId || "") || null,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttlSecondsForKind(kind) * 1000).toISOString(),
    redeemed_at: null,
  };
}

// --- Supabase-backed persistence -------------------------------------------
// These are keyed by code hash, not by workspace, and therefore deliberately do
// not go through storeForRequest. That exemption exists because redemption
// happens before the caller knows their workspace. It returns a workspace id
// and nothing else -- never document contents.

async function issueWorkspaceCode(workspaceId, kind, createdByUserId) {
  const workspaceCode = generateWorkspaceCode();
  const record = buildRecord(workspaceCode, workspaceId, kind, createdByUserId);
  await supabaseRequest("POST", `/${TABLE_NAME}`, [record], { Prefer: "return=minimal" }, [200, 201, 204]);
  return { workspaceCode, expiresAt: record.expires_at, kind };
}

async function redeemWorkspaceCode(rawCode, kind) {
  assertKind(kind);
  const normalized = normalizeWorkspaceCode(rawCode);
  if (!normalized) throwCodeMismatch();

  const codeHash = hashWorkspaceCode(normalized);
  const rows = await supabaseRequest(
    "GET",
    `/${TABLE_NAME}?code_hash=eq.${encodeURIComponent(codeHash)}&kind=eq.${encodeURIComponent(kind)}&select=code_hash,workspace_id,kind,expires_at,redeemed_at&limit=1`,
  );
  const record = Array.isArray(rows) ? rows[0] : null;
  if (!isUsable(record)) throwCodeMismatch();

  // Single use. The `redeemed_at=is.null` filter makes this a conditional
  // update, so two simultaneous redemptions cannot both succeed.
  const redeemedAt = new Date().toISOString();
  const updated = await supabaseRequest(
    "PATCH",
    `/${TABLE_NAME}?code_hash=eq.${encodeURIComponent(codeHash)}&redeemed_at=is.null&select=workspace_id`,
    { redeemed_at: redeemedAt },
    { Prefer: "return=representation" },
    [200, 204],
  );
  const claimed = Array.isArray(updated) ? updated[0] : null;
  if (!claimed) throwCodeMismatch();

  return { workspaceId: claimed.workspace_id, kind };
}

module.exports = {
  CODE_MISMATCH_MESSAGE,
  COMBINED_SEPARATOR,
  INVITE_TTL_SECONDS,
  JOIN_TTL_SECONDS,
  buildCombinedInvite,
  buildRecord,
  generateWorkspaceCode,
  hashWorkspaceCode,
  isUsable,
  issueWorkspaceCode,
  normalizeWorkspaceCode,
  redeemWorkspaceCode,
  splitCombinedInvite,
  throwCodeMismatch,
  ttlSecondsForKind,
};
