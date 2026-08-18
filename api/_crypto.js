// Shared identity primitives for the Phase 021 row-based identity plane.
// Extracted from api/_auth.js so the new modules never depend on the legacy
// document-based module, which is deleted in Release B. The values must stay
// byte-compatible with _auth.js until then: same cookie name, same PBKDF2
// parameters, same token encoding.
const crypto = require("crypto");

const SESSION_COOKIE_NAME = "fso_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const MIN_PASSWORD_LENGTH = 8;
const VIEW_KEYS = [
  "dashboard",
  "inquiries",
  "clients",
  "measurements",
  "orders",
  "recipes",
  "inventory",
  "production",
  "reports",
  "settings",
];

function hashPassword(password) {
  const salt = randomToken(18);
  const passwordHash = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST).toString("hex");
  return {
    passwordHash,
    passwordSalt: salt,
    passwordIterations: PASSWORD_ITERATIONS,
    passwordDigest: PASSWORD_DIGEST,
    passwordUpdatedAt: new Date().toISOString(),
  };
}

function verifyPasswordRecord(record, password) {
  if (!record || !record.passwordHash || !record.passwordSalt) {
    // Equalize cost for unknown accounts so "no such email" and "wrong
    // password" take the same time. The result is discarded.
    crypto.pbkdf2Sync(String(password), "fso-missing-account", PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST);
    return false;
  }
  const iterations = Number(record.passwordIterations || PASSWORD_ITERATIONS);
  const digest = clean(record.passwordDigest) || PASSWORD_DIGEST;
  const expected = Buffer.from(record.passwordHash, "hex");
  const actual = crypto.pbkdf2Sync(String(password), record.passwordSalt, iterations, expected.length, digest);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function verifyTokenHash(storedHash, token) {
  // Hash unconditionally so a missing record and a wrong token cost the same.
  const providedHash = hashToken(String(token || ""));
  const stored = clean(storedHash);
  if (!stored || !token) return false;
  const expected = Buffer.from(stored, "hex");
  const actual = Buffer.from(providedHash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function buildSessionCookie(token, request) {
  const secure = isSecureRequest(request);
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function buildClearSessionCookie(request) {
  const secure = isSecureRequest(request);
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function readSessionToken(request) {
  const cookieHeader = request?.headers?.cookie || request?.headers?.Cookie || "";
  for (const part of String(cookieHeader).split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key !== SESSION_COOKIE_NAME) continue;
    const raw = valueParts.join("=") || "";
    // Only our own cookie is decoded, and a malformed value yields no session
    // rather than an exception. Decoding every cookie on the origin -- the
    // inherited behaviour from api/_auth.js -- let one unrelated cookie
    // containing a stray '%' throw URIError out of every identity endpoint,
    // turning "unauthenticated" into a persistent 500 the user could not
    // clear, because even signout went through this function.
    try {
      return decodeURIComponent(raw);
    } catch (error) {
      return "";
    }
  }
  return "";
}

function requestClientKey(request) {
  // First hop of x-forwarded-for; Vercel sets it. Falls back to the socket.
  const forwarded = clean(request?.headers?.["x-forwarded-for"]).split(",")[0].trim();
  return forwarded || clean(request?.socket?.remoteAddress) || "unknown";
}

function isSecureRequest(request) {
  const forwardedProto = clean(request?.headers?.["x-forwarded-proto"] || request?.headers?.["x-forwarded-protocol"]).toLowerCase();
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production" || forwardedProto === "https";
}

function assertEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throwPublicError("Enter a valid email address.", 400);
  }
}

function assertPassword(password, confirmPassword) {
  if (String(password).length < MIN_PASSWORD_LENGTH || password !== confirmPassword) {
    throwPublicError(`Passwords must match and be at least ${MIN_PASSWORD_LENGTH} characters.`, 400);
  }
}

function normalizeViews(views = [], fallback = ["dashboard"]) {
  const allowed = new Set(VIEW_KEYS);
  const normalized = Array.isArray(views) ? views.filter((view) => allowed.has(view)) : [];
  const unique = [...new Set(normalized)];
  return unique.length ? unique : fallback;
}

function fullAccess() {
  return [...VIEW_KEYS];
}

function throwPublicError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function clean(value) {
  return String(value ?? "").trim();
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  PASSWORD_DIGEST,
  PASSWORD_ITERATIONS,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  VIEW_KEYS,
  assertEmail,
  assertPassword,
  buildClearSessionCookie,
  buildSessionCookie,
  clean,
  fullAccess,
  hashPassword,
  hashToken,
  isSecureRequest,
  normalizeViews,
  randomToken,
  readSessionToken,
  requestClientKey,
  throwPublicError,
  uid,
  verifyPasswordRecord,
  verifyTokenHash,
};
