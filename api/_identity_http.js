// Shared HTTP dispatch for the identity endpoints. api/session.js, api/auth.js,
// api/bootstrap.js, and the server.js dev mirror all route through here with
// their own db adapter, so the action surface literally cannot diverge between
// production and local dev.
const { buildClearSessionCookie, buildSessionCookie } = require("./_crypto");
const identity = require("./_identity");
const { sendJson } = require("./_response");

// Null-prototype: a plain literal resolves inherited keys, so an action of
// "constructor" or "toString" would pass the handler lookup and be invoked.
const ACTIONS = Object.assign(Object.create(null), {
  "signup": identity.signup,
  "signin": identity.signin,
  "signout": (db, request) => identity.signout(db, request),
  "accept-invite": identity.acceptInvite,
  "redeem-recovery-code": identity.redeemRecoveryCode,
  "create-staff": identity.createStaff,
  "create-staff-invite": identity.createInvite,
  "cancel-staff-invite": identity.cancelInvite,
  "update-staff-access": identity.updateStaffAccess,
  "create-recovery-code": (db, request) => identity.createRecoveryCode(db, request),
  "reset-user-password": identity.resetUserPassword,
  "change-password": identity.changePassword,
  "suspend-staff": identity.suspendStaff,
  "reactivate-staff": identity.reactivateStaff,
  "delete-staff": identity.deleteStaff,
});

async function handleSessionAction(db, request, response, body) {
  const action = String(body?.action || "").trim();
  const handler = typeof ACTIONS[action] === "function" ? ACTIONS[action] : null;
  if (!handler) {
    sendJson(response, 400, { error: "Unknown action" });
    return;
  }
  const result = await handler(db, request, body || {});
  if (result.sessionToken) {
    response.setHeader("Set-Cookie", buildSessionCookie(result.sessionToken, request));
  }
  if (result.clearSession) {
    response.setHeader("Set-Cookie", buildClearSessionCookie(request));
  }
  sendJson(response, result.status, result.payload);
}

async function handleIdentityGet(db, request, response) {
  const result = await identity.getIdentity(db, request);
  sendJson(response, result.status, result.payload);
}

module.exports = { handleIdentityGet, handleSessionAction, SESSION_ACTIONS: Object.keys(ACTIONS) };
