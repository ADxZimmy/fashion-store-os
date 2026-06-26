const crypto = require("crypto");

const SESSION_COOKIE_NAME = "fso_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const MIN_PASSWORD_LENGTH = 8;
const STAFF_LIMIT = 2;
const INVITE_TTL_SECONDS = 60 * 60 * 24 * 3;
const USER_STATUSES = new Set(["active", "invited", "suspended"]);
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

function normalizeAuthDocument(document = {}) {
  const source = document && typeof document === "object" ? document : {};
  const users = [];
  let changed = false;

  for (const sourceUser of Array.isArray(source.users) ? source.users : []) {
    const email = clean(sourceUser.email).toLowerCase();
    if (!email || users.some((user) => user.email === email)) {
      changed = true;
      continue;
    }

    const passwordRecord = passwordRecordForUser(sourceUser);
    if (!sourceUser.passwordHash || sourceUser.password) {
      changed = true;
    }

    users.push({
      id: clean(sourceUser.id) || uid(sourceUser.role === "staff" ? "staff" : "user"),
      name: clean(sourceUser.name) || email,
      email,
      role: sourceUser.role === "staff" ? "staff" : "manager",
      status: normalizeUserStatus(sourceUser.status, sourceUser.role),
      access: normalizeAccess(sourceUser.access, sourceUser.role === "staff" ? ["dashboard"] : fullAccess()),
      createdAt: clean(sourceUser.createdAt) || new Date().toISOString(),
      updatedAt: clean(sourceUser.updatedAt) || clean(sourceUser.createdAt) || new Date().toISOString(),
      invitedAt: clean(sourceUser.invitedAt),
      inviteExpiresAt: clean(sourceUser.inviteExpiresAt),
      inviteTokenHash: clean(sourceUser.inviteTokenHash),
      inviteAcceptedAt: clean(sourceUser.inviteAcceptedAt),
      suspendedAt: clean(sourceUser.suspendedAt),
      lastSignInAt: clean(sourceUser.lastSignInAt),
      ...passwordRecord,
    });
  }

  const userIds = new Set(users.map((user) => user.id));
  const now = Date.now();
  const sessions = (Array.isArray(source.sessions) ? source.sessions : [])
    .map((session) => ({
      id: clean(session.id) || uid("sess"),
      userId: clean(session.userId),
      tokenHash: clean(session.tokenHash),
      createdAt: clean(session.createdAt) || new Date().toISOString(),
      expiresAt: clean(session.expiresAt),
    }))
    .filter((session) => {
      const valid = userIds.has(session.userId) && session.tokenHash && Date.parse(session.expiresAt) > now;
      if (!valid) changed = true;
      return valid;
    });

  if (source.sessionUserId || !Array.isArray(source.sessions)) {
    changed = changed || Boolean(source.sessionUserId) || Boolean(users.length);
  }

  const auditEvents = normalizeAuditEvents(source.auditEvents);
  if (!Array.isArray(source.auditEvents) && auditEvents.length) {
    changed = true;
  }

  return {
    auth: { users, sessions, auditEvents },
    changed,
  };
}

function sanitizeAuth(auth, sessionUserId = "") {
  const currentUser = auth.users.find((user) => user.id === sessionUserId);
  const visibleUsers = currentUser?.role === "manager"
    ? auth.users
    : currentUser
      ? [currentUser]
      : auth.users.map((user) => ({
          id: user.id,
          role: user.role,
          createdAt: user.createdAt,
          name: "",
          email: "",
          access: ["dashboard"],
        }));

  return {
    users: visibleUsers.map(sanitizeUser),
    auditEvents: currentUser?.role === "manager" ? normalizeAuditEvents(auth.auditEvents) : [],
    sessionUserId: currentUser ? currentUser.id : "",
    serverManaged: true,
  };
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: clean(user.name),
    email: clean(user.email).toLowerCase(),
    role: user.role === "staff" ? "staff" : "manager",
    status: normalizeUserStatus(user.status, user.role),
    access: normalizeAccess(user.access, user.role === "staff" ? ["dashboard"] : fullAccess()),
    createdAt: clean(user.createdAt),
    updatedAt: clean(user.updatedAt),
    invitedAt: clean(user.invitedAt),
    inviteExpiresAt: clean(user.inviteExpiresAt),
    inviteAcceptedAt: clean(user.inviteAcceptedAt),
    suspendedAt: clean(user.suspendedAt),
    lastSignInAt: clean(user.lastSignInAt),
  };
}

function signUpManager(auth, payload = {}) {
  const name = clean(payload.name);
  const email = clean(payload.email).toLowerCase();
  const password = String(payload.password || "");
  const confirmPassword = String(payload.confirmPassword || payload.password || "");

  assertEmail(email);
  assertPassword(password, confirmPassword);

  if (auth.users.some((user) => user.role === "manager")) {
    throwPublicError("Manager access already exists. Sign in or add staff from Settings.", 409);
  }
  if (auth.users.some((user) => user.email === email)) {
    throwPublicError("An account already exists for that email.", 409);
  }

  const manager = {
    id: uid("user"),
    name: name || email,
    email,
    role: "manager",
    status: "active",
    access: fullAccess(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...hashPassword(password),
  };
  auth.users.push(manager);
  appendAuditEvent(auth, "manager.signup", manager, manager, "Manager access created");
  return createSession(auth, manager.id);
}

function signIn(auth, payload = {}) {
  const email = clean(payload.email).toLowerCase();
  const password = String(payload.password || "");
  const user = auth.users.find((item) => item.email === email);

  if (!user || !verifyPassword(user, password)) {
    throwPublicError("Sign in details do not match.", 401);
  }
  assertCanAuthenticate(user);

  user.lastSignInAt = new Date().toISOString();
  user.updatedAt = new Date().toISOString();
  appendAuditEvent(auth, "account.signin", user, user, "User signed in");
  return createSession(auth, user.id);
}

function signOut(auth, request) {
  const token = readSessionToken(request);
  if (!token) return auth;
  const tokenHash = hashToken(token);
  auth.sessions = auth.sessions.filter((session) => session.tokenHash !== tokenHash);
  return auth;
}

function createStaff(auth, currentUser, payload = {}) {
  assertManager(currentUser);
  if (staffCount(auth) >= STAFF_LIMIT) {
    throwPublicError("Staff limit reached. Remove one staff account before adding another.", 409);
  }

  const name = clean(payload.name);
  const email = clean(payload.email).toLowerCase();
  const password = String(payload.password || "");

  assertEmail(email);
  assertPassword(password, password);

  if (auth.users.some((user) => user.email === email)) {
    throwPublicError("An account already exists for that email.", 409);
  }

  auth.users.push({
    id: uid("staff"),
    name: name || email,
    email,
    role: "staff",
    status: "active",
    access: normalizeAccess(payload.access, ["dashboard"]),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...hashPassword(password),
  });
  appendAuditEvent(auth, "staff.create", currentUser, auth.users[auth.users.length - 1], "Staff account created");
  return auth;
}

function createStaffInvite(auth, currentUser, payload = {}) {
  assertManager(currentUser);
  if (staffCount(auth) >= STAFF_LIMIT) {
    throwPublicError("Staff limit reached. Remove one staff account before adding another.", 409);
  }

  const name = clean(payload.name);
  const email = clean(payload.email).toLowerCase();
  assertEmail(email);

  if (auth.users.some((user) => user.email === email)) {
    throwPublicError("An account already exists for that email.", 409);
  }

  const inviteToken = randomToken(24);
  const now = new Date().toISOString();
  const staff = {
    id: uid("staff"),
    name: name || email,
    email,
    role: "staff",
    status: "invited",
    access: normalizeAccess(payload.access, ["dashboard"]),
    createdAt: now,
    updatedAt: now,
    invitedAt: now,
    inviteExpiresAt: new Date(Date.now() + INVITE_TTL_SECONDS * 1000).toISOString(),
    inviteTokenHash: hashToken(inviteToken),
    ...passwordRecordForUser({}),
  };
  auth.users.push(staff);
  appendAuditEvent(auth, "staff.invite", currentUser, staff, "Staff invite created");
  return { auth, invite: sanitizeInvite(staff, inviteToken) };
}

function acceptStaffInvite(auth, payload = {}) {
  const email = clean(payload.email).toLowerCase();
  const inviteToken = clean(payload.inviteToken || payload.token);
  const password = String(payload.password || "");
  const confirmPassword = String(payload.confirmPassword || payload.password || "");
  const name = clean(payload.name);

  assertEmail(email);
  assertPassword(password, confirmPassword);

  const staff = auth.users.find((user) => user.email === email && user.role === "staff");
  if (!staff || staff.status !== "invited" || !staff.inviteTokenHash) {
    throwPublicError("Invite details do not match.", 401);
  }
  if (Date.parse(staff.inviteExpiresAt) <= Date.now()) {
    throwPublicError("This staff invite has expired. Ask the manager for a new invite.", 410);
  }
  if (hashToken(inviteToken) !== staff.inviteTokenHash) {
    throwPublicError("Invite details do not match.", 401);
  }

  const now = new Date().toISOString();
  Object.assign(staff, {
    name: name || staff.name || email,
    status: "active",
    updatedAt: now,
    inviteAcceptedAt: now,
    inviteTokenHash: "",
    inviteExpiresAt: "",
    ...hashPassword(password),
  });
  appendAuditEvent(auth, "staff.accept_invite", staff, staff, "Staff invite accepted");
  return createSession(auth, staff.id);
}

function updateStaffAccess(auth, currentUser, payload = {}) {
  assertManager(currentUser);
  const staff = auth.users.find((user) => user.id === clean(payload.id) && user.role === "staff");
  if (!staff) {
    throwPublicError("Staff account not found.", 404);
  }
  staff.access = normalizeAccess(payload.access, ["dashboard"]);
  staff.updatedAt = new Date().toISOString();
  appendAuditEvent(auth, "staff.access_update", currentUser, staff, "Staff access updated");
  return auth;
}

function deleteStaff(auth, currentUser, payload = {}) {
  assertManager(currentUser);
  const staffId = clean(payload.id);
  const staff = auth.users.find((user) => user.id === staffId && user.role === "staff");
  const before = auth.users.length;
  auth.users = auth.users.filter((user) => !(user.id === staffId && user.role === "staff"));
  auth.sessions = auth.sessions.filter((session) => session.userId !== staffId);
  if (auth.users.length === before) {
    throwPublicError("Staff account not found.", 404);
  }
  appendAuditEvent(auth, "staff.delete", currentUser, staff, "Staff account removed");
  return auth;
}

function suspendStaff(auth, currentUser, payload = {}) {
  assertManager(currentUser);
  const staff = auth.users.find((user) => user.id === clean(payload.id) && user.role === "staff");
  if (!staff) {
    throwPublicError("Staff account not found.", 404);
  }
  staff.status = "suspended";
  staff.suspendedAt = new Date().toISOString();
  staff.updatedAt = staff.suspendedAt;
  auth.sessions = auth.sessions.filter((session) => session.userId !== staff.id);
  appendAuditEvent(auth, "staff.suspend", currentUser, staff, "Staff account suspended");
  return auth;
}

function reactivateStaff(auth, currentUser, payload = {}) {
  assertManager(currentUser);
  const staff = auth.users.find((user) => user.id === clean(payload.id) && user.role === "staff");
  if (!staff) {
    throwPublicError("Staff account not found.", 404);
  }
  staff.status = "active";
  staff.suspendedAt = "";
  staff.updatedAt = new Date().toISOString();
  appendAuditEvent(auth, "staff.reactivate", currentUser, staff, "Staff account reactivated");
  return auth;
}

function changePassword(auth, currentUser, payload = {}, currentSession = null) {
  const currentPassword = String(payload.currentPassword || "");
  const password = String(payload.password || payload.newPassword || "");
  const confirmPassword = String(payload.confirmPassword || payload.password || payload.newPassword || "");

  assertPassword(password, confirmPassword);
  if (!verifyPassword(currentUser, currentPassword)) {
    throwPublicError("Current password does not match.", 401);
  }

  Object.assign(currentUser, {
    updatedAt: new Date().toISOString(),
    ...hashPassword(password),
  });
  auth.sessions = auth.sessions.filter((session) => session.userId !== currentUser.id || session.id === currentSession?.id);
  appendAuditEvent(auth, "account.password_change", currentUser, currentUser, "Password changed");
  return auth;
}

function resolveSession(auth, request) {
  const token = readSessionToken(request);
  if (!token) return { session: null, user: null };
  const tokenHash = hashToken(token);
  const session = auth.sessions.find((item) => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > Date.now());
  const user = session ? auth.users.find((item) => item.id === session.userId && canAuthenticate(item)) : null;
  return user ? { session, user } : { session: null, user: null };
}

function requireSession(auth, request) {
  if (!auth.users.length) return { session: null, user: null };
  const resolved = resolveSession(auth, request);
  if (!resolved.user) {
    throwPublicError("Sign in is required.", 401);
  }
  return resolved;
}

function requireManager(auth, request) {
  if (!auth.users.length) return { session: null, user: null };
  const resolved = requireSession(auth, request);
  assertManager(resolved.user);
  return resolved;
}

function createSession(auth, userId) {
  const user = auth.users.find((item) => item.id === userId);
  assertCanAuthenticate(user);
  const token = randomToken();
  const session = {
    id: uid("sess"),
    userId,
    tokenHash: hashToken(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
  };
  auth.sessions = auth.sessions.filter((item) => item.userId !== userId || Date.parse(item.expiresAt) > Date.now());
  auth.sessions.push(session);
  return { auth, session, token, user };
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
  const cookies = {};
  for (const part of String(cookieHeader).split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (!key) continue;
    cookies[key] = decodeURIComponent(valueParts.join("=") || "");
  }
  return cookies[SESSION_COOKIE_NAME] || "";
}

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

function passwordRecordForUser(user) {
  const passwordHash = clean(user.passwordHash);
  const passwordSalt = clean(user.passwordSalt);
  if (passwordHash && passwordSalt) {
    return {
      passwordHash,
      passwordSalt,
      passwordIterations: Number(user.passwordIterations || PASSWORD_ITERATIONS),
      passwordDigest: clean(user.passwordDigest) || PASSWORD_DIGEST,
      passwordUpdatedAt: clean(user.passwordUpdatedAt) || clean(user.createdAt) || new Date().toISOString(),
    };
  }

  const legacyPassword = String(user.password || "");
  return legacyPassword ? hashPassword(legacyPassword) : hashPassword(randomToken());
}

function normalizeUserStatus(status, role) {
  if (role !== "staff") return "active";
  const cleaned = clean(status).toLowerCase();
  return USER_STATUSES.has(cleaned) ? cleaned : "active";
}

function canAuthenticate(user) {
  return Boolean(user && normalizeUserStatus(user.status, user.role) === "active");
}

function assertCanAuthenticate(user) {
  if (canAuthenticate(user)) return;
  if (user?.status === "invited") {
    throwPublicError("Accept your staff invite before signing in.", 403);
  }
  if (user?.status === "suspended") {
    throwPublicError("This staff account is suspended. Contact the manager.", 403);
  }
  throwPublicError("Sign in details do not match.", 401);
}

function staffCount(auth) {
  return auth.users.filter((user) => user.role === "staff").length;
}

function sanitizeInvite(staff, inviteToken) {
  return {
    email: clean(staff.email).toLowerCase(),
    name: clean(staff.name),
    inviteToken,
    inviteExpiresAt: clean(staff.inviteExpiresAt),
  };
}

function normalizeAuditEvents(events = []) {
  return (Array.isArray(events) ? events : [])
    .map((event) => ({
      id: clean(event.id) || uid("audit"),
      type: clean(event.type) || "account.event",
      actorUserId: clean(event.actorUserId),
      actorEmail: clean(event.actorEmail).toLowerCase(),
      targetUserId: clean(event.targetUserId),
      targetEmail: clean(event.targetEmail).toLowerCase(),
      detail: clean(event.detail),
      createdAt: clean(event.createdAt) || new Date().toISOString(),
    }))
    .filter((event) => event.type)
    .slice(-200);
}

function appendAuditEvent(auth, type, actor, target, detail) {
  auth.auditEvents = normalizeAuditEvents(auth.auditEvents);
  auth.auditEvents.push({
    id: uid("audit"),
    type,
    actorUserId: clean(actor?.id),
    actorEmail: clean(actor?.email).toLowerCase(),
    targetUserId: clean(target?.id),
    targetEmail: clean(target?.email).toLowerCase(),
    detail: clean(detail),
    createdAt: new Date().toISOString(),
  });
  auth.auditEvents = normalizeAuditEvents(auth.auditEvents);
}

function verifyPassword(user, password) {
  if (!user.passwordHash || !user.passwordSalt) return false;
  const iterations = Number(user.passwordIterations || PASSWORD_ITERATIONS);
  const digest = clean(user.passwordDigest) || PASSWORD_DIGEST;
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = crypto.pbkdf2Sync(password, user.passwordSalt, iterations, expected.length, digest);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function assertEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throwPublicError("Enter a valid email address.", 400);
  }
}

function assertPassword(password, confirmPassword) {
  if (password.length < MIN_PASSWORD_LENGTH || password !== confirmPassword) {
    throwPublicError(`Passwords must match and be at least ${MIN_PASSWORD_LENGTH} characters.`, 400);
  }
}

function assertManager(user) {
  if (!user || user.role !== "manager") {
    throwPublicError("Only the manager can perform this action.", 403);
  }
}

function normalizeAccess(access = [], fallback = ["dashboard"]) {
  const allowed = new Set(VIEW_KEYS);
  const normalized = Array.isArray(access) ? access.filter((view) => allowed.has(view)) : [];
  const unique = [...new Set(normalized)];
  return unique.length ? unique : fallback;
}

function fullAccess() {
  return [...VIEW_KEYS];
}

function isSecureRequest(request) {
  const forwardedProto = clean(request?.headers?.["x-forwarded-proto"] || request?.headers?.["x-forwarded-protocol"]).toLowerCase();
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production" || forwardedProto === "https";
}

function throwPublicError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function clean(value) {
  return String(value ?? "").trim();
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  acceptStaffInvite,
  buildClearSessionCookie,
  buildSessionCookie,
  changePassword,
  createStaff,
  createStaffInvite,
  deleteStaff,
  normalizeAuthDocument,
  reactivateStaff,
  requireManager,
  requireSession,
  resolveSession,
  sanitizeAuth,
  signIn,
  signOut,
  signUpManager,
  suspendStaff,
  updateStaffAccess,
};
