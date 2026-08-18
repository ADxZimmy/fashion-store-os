// Phase 021 row-based identity core. Storage-agnostic: every function takes a
// `db` adapter (api/_identity_supabase.js in production, api/_identity_local.js
// for the dev server and tests), so the serverless routes and server.js run
// the exact same logic and cannot drift.
//
// Contract change from the legacy api/_auth.js this replaces: there is no
// null-user bootstrap accommodation. requireAuth and requireManager either
// return a real, active account or throw. The legacy behaviour -- returning
// {session: null, user: null} for an empty workspace -- is what let an
// unauthenticated caller mint workspace codes on 2026-08-03. Signup is the
// only unauthenticated creation path, and it creates its own store; it never
// needs to inspect existing data, so the accommodation has no reason to exist.
const {
  SESSION_TTL_SECONDS,
  assertEmail,
  assertPassword,
  clean,
  fullAccess,
  hashPassword,
  hashToken,
  normalizeViews,
  randomToken,
  readSessionToken,
  requestClientKey,
  throwPublicError,
  uid,
  verifyPasswordRecord,
  verifyTokenHash,
} = require("./_crypto");

const MEMBER_LIMIT = 25;
const OPEN_INVITE_LIMIT = 10;
const INVITE_TTL_SECONDS = 60 * 60 * 24 * 3;
const AUDIT_LIST_LIMIT = 200;
const AUDIT_RETENTION_DAYS = 90;
const RATE_EVENT_RETENTION_SECONDS = 60 * 60 * 24;

// One row per attempt, counted over the window -- accurate under concurrency,
// unlike the in-memory limiter this replaces. Keys are scoped so one abusive
// client cannot lock out an email and vice versa.
const RATE_LIMITS = {
  "signin:email": { limit: 10, windowSeconds: 300 },
  "signin:client": { limit: 30, windowSeconds: 300 },
  "signup:client": { limit: 5, windowSeconds: 3600 },
  "recovery:email": { limit: 5, windowSeconds: 900 },
  "recovery:client": { limit: 15, windowSeconds: 900 },
  "invite:client": { limit: 10, windowSeconds: 900 },
};

async function checkRateLimit(db, scope, key) {
  const config = RATE_LIMITS[scope];
  if (!config) throw new Error(`Unknown rate limit scope: ${scope}`);
  const since = new Date(Date.now() - config.windowSeconds * 1000).toISOString();
  const count = await db.countRateEvents(scope, key, since);
  if (count >= config.limit) {
    throwPublicError("Too many attempts. Wait a few minutes and try again.", 429);
  }
  await db.insertRateEvent({ scope, key });
}

// ---------------------------------------------------------------------------
// Session resolution and gates
// ---------------------------------------------------------------------------

async function resolveIdentity(db, request) {
  const token = readSessionToken(request);
  if (!token) return null;
  const session = await db.findSessionByTokenHash(hashToken(token), new Date().toISOString());
  if (!session) return null;
  const account = await db.getAccount(session.account_id);
  if (!account) return null;
  const memberships = await db.listMembershipsByAccount(account.id);
  // v1 keeps one store per account: signup creates a store and invite
  // acceptance refuses existing accounts, so multiple memberships cannot
  // arise. Taking the first is deliberate, not sloppy.
  const membership = memberships[0] || null;
  const store = membership ? await db.getStore(membership.store_id) : null;
  return { session, account, membership, store };
}

async function requireAuth(db, request) {
  const resolved = await resolveIdentity(db, request);
  if (!resolved || !resolved.account) {
    throwPublicError("Sign in is required.", 401);
  }
  if (!resolved.membership || !resolved.store) {
    // An account with no membership should be impossible (deleteStaff removes
    // orphaned accounts), but a gate must fail closed, not accommodate.
    throwPublicError("Sign in is required.", 401);
  }
  if (resolved.membership.status === "suspended") {
    throwPublicError("This staff account is suspended. Contact the manager.", 403);
  }
  return resolved;
}

async function requireManager(db, request) {
  const resolved = await requireAuth(db, request);
  if (resolved.membership.role !== "manager") {
    throwPublicError("Only the manager can perform this action.", 403);
  }
  return resolved;
}

async function createSessionFor(db, account) {
  const token = randomToken();
  await db.insertSession({
    id: uid("sess"),
    account_id: account.id,
    token_hash: hashToken(token),
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
  });
  return token;
}

// ---------------------------------------------------------------------------
// Actions. Each returns { status, payload, sessionToken?, clearSession? }.
// ---------------------------------------------------------------------------

async function signup(db, request, body) {
  const name = boundedString(body.name, 120);
  const email = boundedString(body.email, 254).toLowerCase();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || body.password || "");

  assertEmail(email);
  assertPassword(password, confirmPassword);
  await checkRateLimit(db, "signup:client", requestClientKey(request));

  const existing = await db.findAccountByEmail(email);
  if (existing) {
    throwPublicError("An account already exists for that email. Sign in instead.", 409);
  }

  const now = new Date().toISOString();
  const passwordRecord = hashPassword(password);
  const recoveryCode = randomToken(24);
  const account = {
    id: uid("user"),
    email,
    name: name || email,
    password_hash: passwordRecord.passwordHash,
    password_salt: passwordRecord.passwordSalt,
    password_iterations: passwordRecord.passwordIterations,
    password_digest: passwordRecord.passwordDigest,
    password_updated_at: now,
    // Issued at signup because a solo manager has nobody to issue one later.
    // Returned exactly once; only the hash is stored.
    recovery_code_hash: hashToken(recoveryCode),
    recovery_issued_at: now,
    recovery_redeemed_at: null,
    last_sign_in_at: now,
    created_at: now,
    updated_at: now,
  };
  // The unique lower(email) index is the real guard; the findAccountByEmail
  // check above only exists for a friendly message on the common case.
  await db.insertAccount(account);

  const store = {
    id: uid("store"),
    name: "",
    created_by: account.id,
    created_at: now,
    updated_at: now,
  };
  await db.insertStore(store);
  await db.insertMembership({
    account_id: account.id,
    store_id: store.id,
    role: "manager",
    status: "active",
    allowed_views: fullAccess(),
    suspended_at: null,
    created_at: now,
    updated_at: now,
  });
  await audit(db, store.id, "manager.signup", account, account, "Manager account created");
  await audit(db, store.id, "account.recovery_issue", account, account, "Recovery code issued");

  const sessionToken = await createSessionFor(db, account);
  const payload = await composeIdentity(db, { account, store });
  payload.recovery = { email: account.email, name: account.name, recoveryCode, recoveryIssuedAt: now };
  return { status: 201, payload, sessionToken };
}

async function signin(db, request, body) {
  const email = boundedString(body.email, 254).toLowerCase();
  const password = String(body.password || "");

  await checkRateLimit(db, "signin:client", requestClientKey(request));
  if (email) {
    await checkRateLimit(db, "signin:email", email);
  }

  const account = await db.findAccountByEmail(email);
  const verified = verifyPasswordRecord(accountPasswordRecord(account), password);
  if (!account || !verified) {
    // Before failing generically, preserve the legacy hint for invitees who
    // try to sign in without accepting: an open invite exists but no account.
    if (!account && email) {
      const invites = await db.listOpenInvitesByEmail(email);
      if (invites.some((invite) => !inviteExpired(invite))) {
        throwPublicError("Accept your staff invite before signing in.", 403);
      }
    }
    throwPublicError("Sign in details do not match.", 401);
  }

  const memberships = await db.listMembershipsByAccount(account.id);
  const membership = memberships[0] || null;
  if (!membership) {
    throwPublicError("Sign in details do not match.", 401);
  }
  if (membership.status === "suspended") {
    throwPublicError("This staff account is suspended. Contact the manager.", 403);
  }

  const now = new Date().toISOString();
  await db.updateAccount(account.id, { last_sign_in_at: now, updated_at: now });
  const store = await db.getStore(membership.store_id);
  await audit(db, membership.store_id, "account.signin", account, account, "User signed in");

  const sessionToken = await createSessionFor(db, account);
  const payload = await composeIdentity(db, { account: { ...account, last_sign_in_at: now }, store });
  return { status: 200, payload, sessionToken };
}

async function signout(db, request) {
  const token = readSessionToken(request);
  if (token) {
    await db.deleteSessionByTokenHash(hashToken(token));
  }
  return {
    status: 200,
    payload: { ok: true, authenticated: false, identity: null },
    clearSession: true,
  };
}

async function createInvite(db, request, body) {
  const { account, store } = await requireManager(db, request);
  const role = body.role === "manager" ? "manager" : "staff";
  const name = boundedString(body.name, 120);
  const email = boundedString(body.email, 254).toLowerCase();
  assertEmail(email);

  await assertMemberCapacity(db, store.id);
  const openInvites = await db.countOpenInvites(store.id);
  if (openInvites >= OPEN_INVITE_LIMIT) {
    throwPublicError("Too many open invites. Cancel one or wait for acceptance.", 409);
  }
  const existingAccount = await db.findAccountByEmail(email);
  if (existingAccount) {
    throwPublicError("An account already exists for that email.", 409);
  }

  // A new invite for the same address replaces the old row, matching the
  // partial unique index on (store_id, lower(email)) where accepted_at is null.
  const previous = await db.findOpenInvite(store.id, email);
  if (previous) {
    await db.deleteInvite(previous.id);
  }

  const inviteToken = randomToken(24);
  const now = new Date().toISOString();
  const invite = {
    id: uid("invite"),
    store_id: store.id,
    email,
    name: name || email,
    role,
    allowed_views: role === "manager" ? fullAccess() : normalizeViews(body.access, ["dashboard"]),
    token_hash: hashToken(inviteToken),
    created_by: account.id,
    created_at: now,
    expires_at: new Date(Date.now() + INVITE_TTL_SECONDS * 1000).toISOString(),
    accepted_at: null,
  };
  await db.insertInvite(invite);
  await audit(db, store.id, "staff.invite", account, { id: "", email }, `${role === "manager" ? "Manager" : "Staff"} invite created`);

  const payload = await composeIdentity(db, { account, store });
  // The raw token is returned exactly once. No workspace-code half anymore:
  // accounts are global, so the invitee accepts from any device by signing up
  // through the invite.
  payload.invite = {
    email: invite.email,
    name: invite.name,
    role: invite.role,
    inviteToken,
    inviteCode: inviteToken,
    inviteExpiresAt: invite.expires_at,
  };
  return { status: 201, payload };
}

async function acceptInvite(db, request, body) {
  const email = boundedString(body.email, 254).toLowerCase();
  const inviteToken = clean(body.inviteToken || body.token || body.inviteCode);
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || body.password || "");
  const name = boundedString(body.name, 120);

  assertEmail(email);
  assertPassword(password, confirmPassword);
  await checkRateLimit(db, "invite:client", requestClientKey(request));

  const invites = await db.listOpenInvitesByEmail(email);
  const invite = invites.find((item) => verifyTokenHash(item.token_hash, inviteToken)) || null;
  if (!invite) {
    throwPublicError("Invite details do not match.", 401);
  }
  if (inviteExpired(invite)) {
    throwPublicError("This staff invite has expired. Ask the manager for a new invite.", 410);
  }
  const existingAccount = await db.findAccountByEmail(email);
  if (existingAccount) {
    // v1 keeps one store per account; attaching an existing account to a
    // second store is out of scope and recorded as such in the phase docs.
    throwPublicError("An account already exists for that email. Sign in instead.", 409);
  }

  const now = new Date().toISOString();
  const passwordRecord = hashPassword(password);
  const account = {
    id: uid(invite.role === "manager" ? "user" : "staff"),
    email,
    name: name || invite.name || email,
    password_hash: passwordRecord.passwordHash,
    password_salt: passwordRecord.passwordSalt,
    password_iterations: passwordRecord.passwordIterations,
    password_digest: passwordRecord.passwordDigest,
    password_updated_at: now,
    recovery_code_hash: "",
    recovery_issued_at: null,
    recovery_redeemed_at: null,
    last_sign_in_at: now,
    created_at: now,
    updated_at: now,
  };
  await db.insertAccount(account);
  await db.insertMembership({
    account_id: account.id,
    store_id: invite.store_id,
    role: invite.role,
    status: "active",
    allowed_views: normalizeViews(invite.allowed_views, invite.role === "manager" ? fullAccess() : ["dashboard"]),
    suspended_at: null,
    created_at: now,
    updated_at: now,
  });
  await db.updateInvite(invite.id, { accepted_at: now });
  const store = await db.getStore(invite.store_id);
  await audit(db, invite.store_id, "staff.accept_invite", account, account, "Invite accepted");

  const sessionToken = await createSessionFor(db, account);
  const payload = await composeIdentity(db, { account, store });
  return { status: 201, payload, sessionToken };
}

async function createStaff(db, request, body) {
  const { account, store } = await requireManager(db, request);
  const role = body.role === "manager" ? "manager" : "staff";
  const name = boundedString(body.name, 120);
  const email = boundedString(body.email, 254).toLowerCase();
  const password = String(body.password || "");

  assertEmail(email);
  assertPassword(password, password);
  await assertMemberCapacity(db, store.id);

  const existing = await db.findAccountByEmail(email);
  if (existing) {
    throwPublicError("An account already exists for that email.", 409);
  }

  const now = new Date().toISOString();
  const passwordRecord = hashPassword(password);
  const created = {
    id: uid(role === "manager" ? "user" : "staff"),
    email,
    name: name || email,
    password_hash: passwordRecord.passwordHash,
    password_salt: passwordRecord.passwordSalt,
    password_iterations: passwordRecord.passwordIterations,
    password_digest: passwordRecord.passwordDigest,
    password_updated_at: now,
    recovery_code_hash: "",
    recovery_issued_at: null,
    recovery_redeemed_at: null,
    last_sign_in_at: null,
    created_at: now,
    updated_at: now,
  };
  await db.insertAccount(created);
  await db.insertMembership({
    account_id: created.id,
    store_id: store.id,
    role,
    status: "active",
    allowed_views: role === "manager" ? fullAccess() : normalizeViews(body.access, ["dashboard"]),
    suspended_at: null,
    created_at: now,
    updated_at: now,
  });
  await audit(db, store.id, role === "manager" ? "manager.create" : "staff.create", account, created, `${role === "manager" ? "Manager" : "Staff"} account created`);

  const payload = await composeIdentity(db, { account, store });
  return { status: 201, payload };
}

async function updateStaffAccess(db, request, body) {
  const { account, store } = await requireManager(db, request);
  const target = await requireStoreStaff(db, store.id, body.id);
  const now = new Date().toISOString();
  await db.updateMembership(target.membership.account_id, store.id, {
    allowed_views: normalizeViews(body.access, ["dashboard"]),
    updated_at: now,
  });
  await audit(db, store.id, "staff.access_update", account, target.account, "Staff access updated");
  const payload = await composeIdentity(db, { account, store });
  return { status: 200, payload };
}

async function suspendStaff(db, request, body) {
  const { account, store } = await requireManager(db, request);
  const target = await requireStoreStaff(db, store.id, body.id);
  const now = new Date().toISOString();
  await db.updateMembership(target.membership.account_id, store.id, {
    status: "suspended",
    suspended_at: now,
    updated_at: now,
  });
  await db.deleteSessionsForAccount(target.membership.account_id);
  await audit(db, store.id, "staff.suspend", account, target.account, "Staff account suspended");
  const payload = await composeIdentity(db, { account, store });
  return { status: 200, payload };
}

async function reactivateStaff(db, request, body) {
  const { account, store } = await requireManager(db, request);
  const target = await requireStoreStaff(db, store.id, body.id);
  const now = new Date().toISOString();
  await db.updateMembership(target.membership.account_id, store.id, {
    status: "active",
    suspended_at: null,
    updated_at: now,
  });
  await audit(db, store.id, "staff.reactivate", account, target.account, "Staff account reactivated");
  const payload = await composeIdentity(db, { account, store });
  return { status: 200, payload };
}

async function deleteStaff(db, request, body) {
  const { account, store } = await requireManager(db, request);
  const target = await requireStoreStaff(db, store.id, body.id);
  await db.deleteMembership(target.membership.account_id, store.id);
  const remaining = await db.listMembershipsByAccount(target.membership.account_id);
  if (!remaining.length) {
    // No orphan accounts: an account with zero memberships can never pass
    // requireAuth, so keeping the row would only park a password hash.
    await db.deleteAccount(target.membership.account_id);
  }
  await db.deleteSessionsForAccount(target.membership.account_id);
  await audit(db, store.id, "staff.delete", account, target.account, "Staff account removed");
  const payload = await composeIdentity(db, { account, store });
  return { status: 200, payload };
}

async function changePassword(db, request, body) {
  const { account, store, session } = await requireAuth(db, request);
  const currentPassword = String(body.currentPassword || "");
  const password = String(body.password || body.newPassword || "");
  const confirmPassword = String(body.confirmPassword || body.password || body.newPassword || "");

  assertPassword(password, confirmPassword);
  if (!verifyPasswordRecord(accountPasswordRecord(account), currentPassword)) {
    throwPublicError("Current password does not match.", 401);
  }

  const now = new Date().toISOString();
  const passwordRecord = hashPassword(password);
  await db.updateAccount(account.id, {
    password_hash: passwordRecord.passwordHash,
    password_salt: passwordRecord.passwordSalt,
    password_iterations: passwordRecord.passwordIterations,
    password_digest: passwordRecord.passwordDigest,
    password_updated_at: now,
    updated_at: now,
  });
  // Every other session drops; the one making the change survives.
  await db.deleteSessionsForAccount(account.id, session.id);
  await audit(db, store.id, "account.password_change", account, account, "Password changed");
  const payload = await composeIdentity(db, { account, store });
  return { status: 200, payload };
}

// Recovery codes are the way back in when a password is lost. Deliberately
// NOT time-limited: a recovery code is only ever used long after it was
// issued, so a TTL would reliably leave it dead at the moment it is needed.
// Single use is the control instead of time.
async function createRecoveryCode(db, request) {
  const { account, store } = await requireAuth(db, request);
  const recovery = await issueRecovery(db, store.id, account, account);
  const payload = await composeIdentity(db, { account, store });
  payload.recovery = recovery;
  return { status: 201, payload };
}

async function resetUserPassword(db, request, body) {
  const { account, store } = await requireManager(db, request);
  const targetId = clean(body.id);
  const membership = await db.getMembership(targetId, store.id);
  if (!membership) {
    throwPublicError("Account not found.", 404);
  }
  const target = await db.getAccount(targetId);
  if (!target) {
    throwPublicError("Account not found.", 404);
  }
  // A manager hands out a recovery code rather than setting a colleague's
  // password directly, so the colleague chooses their own password and the
  // manager never learns it.
  const recovery = await issueRecovery(db, store.id, target, account);
  const payload = await composeIdentity(db, { account, store });
  payload.recovery = recovery;
  return { status: 201, payload };
}

async function redeemRecoveryCode(db, request, body) {
  const email = boundedString(body.email, 254).toLowerCase();
  const recoveryCode = clean(body.recoveryCode || body.code);
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || body.password || "");

  assertEmail(email);
  assertPassword(password, confirmPassword);
  await checkRateLimit(db, "recovery:client", requestClientKey(request));
  await checkRateLimit(db, "recovery:email", email);

  const account = await db.findAccountByEmail(email);
  // One message for both "no such account" and "wrong code". Diverging here
  // would turn this route into a user-enumeration oracle.
  if (!account || !verifyTokenHash(account.recovery_code_hash, recoveryCode)) {
    throwPublicError("Recovery details do not match.", 401);
  }
  const memberships = await db.listMembershipsByAccount(account.id);
  const membership = memberships[0] || null;
  if (membership && membership.status === "suspended") {
    throwPublicError("This staff account is suspended. Contact the manager.", 403);
  }

  const now = new Date().toISOString();
  const passwordRecord = hashPassword(password);
  await db.updateAccount(account.id, {
    password_hash: passwordRecord.passwordHash,
    password_salt: passwordRecord.passwordSalt,
    password_iterations: passwordRecord.passwordIterations,
    password_digest: passwordRecord.passwordDigest,
    password_updated_at: now,
    recovery_code_hash: "",
    recovery_redeemed_at: now,
    updated_at: now,
  });
  // Every existing session drops and no new one is created. The caller signs
  // in with the new password, which proves the reset worked rather than
  // masking a failure behind a session granted anyway.
  await db.deleteSessionsForAccount(account.id);
  if (membership) {
    await audit(db, membership.store_id, "account.recovery_redeem", account, account, "Password reset with recovery code");
  }
  return { status: 200, payload: { ok: true, authenticated: false, identity: null } };
}

async function getIdentity(db, request) {
  const resolved = await resolveIdentity(db, request);
  if (!resolved || !resolved.account || !resolved.membership || resolved.membership.status === "suspended") {
    return { status: 200, payload: { ok: true, authenticated: false, identity: null } };
  }
  const payload = await composeIdentity(db, { account: resolved.account, store: resolved.store });
  return { status: 200, payload };
}

// ---------------------------------------------------------------------------
// Retention. Called by the daily keepalive cron; safe to run any time.
// ---------------------------------------------------------------------------

async function sweepIdentity(db) {
  const now = new Date();
  return db.sweep({
    nowIso: now.toISOString(),
    rateCutoffIso: new Date(now.getTime() - RATE_EVENT_RETENTION_SECONDS * 1000).toISOString(),
    auditCutoffIso: new Date(now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function composeIdentity(db, { account, store }) {
  const memberships = await db.listMembershipsByStore(store.id);
  const viewerMembership = memberships.find((item) => item.account_id === account.id) || null;
  const isManager = viewerMembership?.role === "manager";

  const accountIds = memberships.map((item) => item.account_id);
  const accounts = await db.getAccounts(accountIds);
  const accountById = new Map(accounts.map((item) => [item.id, item]));

  const members = memberships.map((membership) => {
    const member = accountById.get(membership.account_id) || {};
    if (!isManager && membership.account_id !== account.id) {
      // Staff see that colleagues exist but not who they are -- parity with
      // the legacy sanitizeAuth skeletons.
      return {
        accountId: membership.account_id,
        name: "",
        email: "",
        role: membership.role,
        status: membership.status,
        allowedViews: ["dashboard"],
        createdAt: membership.created_at,
      };
    }
    return {
      accountId: membership.account_id,
      name: clean(member.name),
      email: clean(member.email),
      role: membership.role,
      status: membership.status,
      allowedViews: normalizeViews(membership.allowed_views, membership.role === "manager" ? fullAccess() : ["dashboard"]),
      createdAt: membership.created_at,
      updatedAt: membership.updated_at,
      suspendedAt: membership.suspended_at || "",
      lastSignInAt: member.last_sign_in_at || "",
      recoveryIssuedAt: member.recovery_issued_at || "",
      recoveryRedeemedAt: member.recovery_redeemed_at || "",
    };
  });

  const invites = isManager
    ? (await db.listOpenInvitesByStore(store.id)).filter((invite) => !inviteExpired(invite)).map((invite) => ({
        id: invite.id,
        email: invite.email,
        name: invite.name,
        role: invite.role,
        allowedViews: normalizeViews(invite.allowed_views, ["dashboard"]),
        inviteExpiresAt: invite.expires_at,
        createdAt: invite.created_at,
      }))
    : [];

  const auditEvents = isManager
    ? (await db.listAudit(store.id, AUDIT_LIST_LIMIT)).map((event) => ({
        id: event.id,
        type: event.type,
        actorAccountId: event.actor_account_id,
        actorEmail: event.actor_email,
        targetAccountId: event.target_account_id,
        targetEmail: event.target_email,
        detail: event.detail,
        createdAt: event.created_at,
      }))
    : [];

  return {
    ok: true,
    authenticated: true,
    identity: {
      account: {
        id: account.id,
        name: clean(account.name),
        email: clean(account.email),
        createdAt: account.created_at,
        lastSignInAt: account.last_sign_in_at || "",
        recoveryIssuedAt: account.recovery_issued_at || "",
        recoveryRedeemedAt: account.recovery_redeemed_at || "",
      },
      store: { id: store.id, name: clean(store.name) },
      membership: viewerMembership
        ? {
            role: viewerMembership.role,
            status: viewerMembership.status,
            allowedViews: normalizeViews(viewerMembership.allowed_views, viewerMembership.role === "manager" ? fullAccess() : ["dashboard"]),
          }
        : null,
      members,
      invites,
      auditEvents,
    },
  };
}

async function issueRecovery(db, storeId, target, actor) {
  const recoveryCode = randomToken(24);
  const now = new Date().toISOString();
  await db.updateAccount(target.id, {
    recovery_code_hash: hashToken(recoveryCode),
    recovery_issued_at: now,
    recovery_redeemed_at: null,
    updated_at: now,
  });
  await audit(db, storeId, "account.recovery_issue", actor, target, "Recovery code issued");
  return { email: clean(target.email), name: clean(target.name), recoveryCode, recoveryIssuedAt: now };
}

async function requireStoreStaff(db, storeId, targetId) {
  const accountId = clean(targetId);
  const membership = accountId ? await db.getMembership(accountId, storeId) : null;
  if (!membership || membership.role !== "staff") {
    // Managers cannot be suspended/removed through these actions -- parity
    // with the legacy module, where removing a manager means resetting the
    // store. Same 404 for "not found" and "is a manager" to avoid probing.
    throwPublicError("Staff account not found.", 404);
  }
  const account = await db.getAccount(accountId);
  if (!account) {
    throwPublicError("Staff account not found.", 404);
  }
  return { membership, account };
}

async function assertMemberCapacity(db, storeId) {
  const members = await db.countMembers(storeId);
  const openInvites = await db.countOpenInvites(storeId);
  if (members + openInvites >= MEMBER_LIMIT) {
    throwPublicError("User limit reached. Remove an account before adding another.", 409);
  }
}

async function audit(db, storeId, type, actor, target, detail) {
  await db.insertAudit({
    id: uid("audit"),
    store_id: storeId,
    type,
    actor_account_id: clean(actor?.id),
    actor_email: clean(actor?.email).toLowerCase(),
    target_account_id: clean(target?.id),
    target_email: clean(target?.email).toLowerCase(),
    detail: clean(detail),
    created_at: new Date().toISOString(),
  });
}

function accountPasswordRecord(account) {
  if (!account) return null;
  return {
    passwordHash: account.password_hash,
    passwordSalt: account.password_salt,
    passwordIterations: account.password_iterations,
    passwordDigest: account.password_digest,
  };
}

function inviteExpired(invite) {
  return Date.parse(invite.expires_at) <= Date.now();
}

function boundedString(value, max) {
  const cleaned = clean(value);
  if (cleaned.length > max) {
    throwPublicError("A field is longer than allowed.", 400);
  }
  return cleaned;
}

module.exports = {
  MEMBER_LIMIT,
  OPEN_INVITE_LIMIT,
  INVITE_TTL_SECONDS,
  RATE_LIMITS,
  acceptInvite,
  changePassword,
  createInvite,
  createRecoveryCode,
  createStaff,
  deleteStaff,
  getIdentity,
  reactivateStaff,
  redeemRecoveryCode,
  requireAuth,
  requireManager,
  resetUserPassword,
  resolveIdentity,
  signin,
  signout,
  signup,
  suspendStaff,
  sweepIdentity,
  updateStaffAccess,
};
