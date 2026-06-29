const {
  acceptStaffInvite,
  buildClearSessionCookie,
  buildSessionCookie,
  changePassword,
  createStaff,
  createStaffInvite,
  deleteStaff,
  normalizeAuthDocument,
  reactivateStaff,
  requireSession,
  resolveSession,
  sanitizeAuth,
  signIn,
  signOut,
  signUpManager,
  suspendStaff,
  updateStaffAccess,
} = require("./_auth");
const { handleError, handleOptions, readJsonBody, sendJson, sendMethodNotAllowed } = require("./_response");
const { storeForRequest } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "POST", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;

  try {
    const store = storeForRequest(request);
    const { auth, exists, changed } = await readAuthDocument(store);
    if (exists && changed) {
      await store.setDocument("auth", auth);
    }

    if (request.method === "GET") {
      await sendSessionPayload(store, response, request, auth);
      return;
    }

    if (request.method === "POST") {
      const body = (await readJsonBody(request)) || {};
      const action = String(body.action || "").trim();

      if (action === "signup") {
        const result = signUpManager(auth, body);
        await store.setDocument("auth", result.auth);
        response.setHeader("Set-Cookie", buildSessionCookie(result.token, request));
        await sendSessionPayload(store, response, request, result.auth, 201, { session: result.session, user: result.user });
        return;
      }

      if (action === "signin") {
        const result = signIn(auth, body);
        await store.setDocument("auth", result.auth);
        response.setHeader("Set-Cookie", buildSessionCookie(result.token, request));
        await sendSessionPayload(store, response, request, result.auth, 200, { session: result.session, user: result.user });
        return;
      }

      if (action === "accept-invite") {
        const result = acceptStaffInvite(auth, body);
        await store.setDocument("auth", result.auth);
        response.setHeader("Set-Cookie", buildSessionCookie(result.token, request));
        await sendSessionPayload(store, response, request, result.auth, 200, { session: result.session, user: result.user });
        return;
      }

      if (action === "signout") {
        const nextAuth = signOut(auth, request);
        await store.setDocument("auth", nextAuth);
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
        await store.setDocument("auth", nextAuth);
        await sendSessionPayload(store, response, request, nextAuth, 201);
        return;
      }

      if (action === "create-staff-invite") {
        const result = createStaffInvite(auth, user, body);
        await store.setDocument("auth", result.auth);
        await sendSessionPayload(store, response, request, result.auth, 201, null, { invite: result.invite });
        return;
      }

      if (action === "update-staff-access") {
        const nextAuth = updateStaffAccess(auth, user, body);
        await store.setDocument("auth", nextAuth);
        await sendSessionPayload(store, response, request, nextAuth);
        return;
      }

      if (action === "change-password") {
        const nextAuth = changePassword(auth, user, body, session);
        await store.setDocument("auth", nextAuth);
        await sendSessionPayload(store, response, request, nextAuth);
        return;
      }

      if (action === "suspend-staff") {
        const nextAuth = suspendStaff(auth, user, body);
        await store.setDocument("auth", nextAuth);
        await sendSessionPayload(store, response, request, nextAuth);
        return;
      }

      if (action === "reactivate-staff") {
        const nextAuth = reactivateStaff(auth, user, body);
        await store.setDocument("auth", nextAuth);
        await sendSessionPayload(store, response, request, nextAuth);
        return;
      }

      if (action === "delete-staff") {
        const nextAuth = deleteStaff(auth, user, body);
        await store.setDocument("auth", nextAuth);
        await sendSessionPayload(store, response, request, nextAuth);
        return;
      }

      const error = new Error("Unknown session action");
      error.statusCode = 400;
      throw error;
    }

    sendMethodNotAllowed(response, methods);
  } catch (error) {
    handleError(response, error);
  }
};

async function readAuthDocument(store) {
  const result = await store.getDocument("auth");
  const normalized = normalizeAuthDocument(result.value || {});
  return {
    auth: normalized.auth,
    exists: result.exists,
    changed: normalized.changed,
  };
}

async function sendSessionPayload(store, response, request, auth, statusCode = 200, resolvedOverride = null, extra = {}) {
  const resolved = resolvedOverride || resolveSession(auth, request);
  const stateResult = resolved.user ? await store.getDocument("state") : { value: null, exists: false };
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
