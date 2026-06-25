const {
  buildClearSessionCookie,
  buildSessionCookie,
  createStaff,
  deleteStaff,
  normalizeAuthDocument,
  requireSession,
  resolveSession,
  sanitizeAuth,
  signIn,
  signOut,
  signUpManager,
  updateStaffAccess,
} = require("./_auth");
const { handleError, handleOptions, readJsonBody, sendJson, sendMethodNotAllowed } = require("./_response");
const { getDocument, setDocument } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "POST", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;

  try {
    const { auth, exists, changed } = await readAuthDocument();
    if (exists && changed) {
      await setDocument("auth", auth);
    }

    if (request.method === "GET") {
      await sendSessionPayload(response, request, auth);
      return;
    }

    if (request.method === "POST") {
      const body = (await readJsonBody(request)) || {};
      const action = String(body.action || "").trim();

      if (action === "signup") {
        const result = signUpManager(auth, body);
        await setDocument("auth", result.auth);
        response.setHeader("Set-Cookie", buildSessionCookie(result.token, request));
        await sendSessionPayload(response, request, result.auth, 201, { session: result.session, user: result.user });
        return;
      }

      if (action === "signin") {
        const result = signIn(auth, body);
        await setDocument("auth", result.auth);
        response.setHeader("Set-Cookie", buildSessionCookie(result.token, request));
        await sendSessionPayload(response, request, result.auth, 200, { session: result.session, user: result.user });
        return;
      }

      if (action === "signout") {
        const nextAuth = signOut(auth, request);
        await setDocument("auth", nextAuth);
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

      const { user } = requireSession(auth, request);

      if (action === "create-staff") {
        const nextAuth = createStaff(auth, user, body);
        await setDocument("auth", nextAuth);
        await sendSessionPayload(response, request, nextAuth, 201);
        return;
      }

      if (action === "update-staff-access") {
        const nextAuth = updateStaffAccess(auth, user, body);
        await setDocument("auth", nextAuth);
        await sendSessionPayload(response, request, nextAuth);
        return;
      }

      if (action === "delete-staff") {
        const nextAuth = deleteStaff(auth, user, body);
        await setDocument("auth", nextAuth);
        await sendSessionPayload(response, request, nextAuth);
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

async function readAuthDocument() {
  const result = await getDocument("auth");
  const normalized = normalizeAuthDocument(result.value || {});
  return {
    auth: normalized.auth,
    exists: result.exists,
    changed: normalized.changed,
  };
}

async function sendSessionPayload(response, request, auth, statusCode = 200, resolvedOverride = null) {
  const resolved = resolvedOverride || resolveSession(auth, request);
  const stateResult = resolved.user ? await getDocument("state") : { value: null, exists: false };
  sendJson(response, statusCode, {
    ok: true,
    authenticated: Boolean(resolved.user),
    auth: sanitizeAuth(auth, resolved.user?.id || ""),
    state: stateResult.value,
    stateExists: stateResult.exists,
    sessionExpiresAt: resolved.session?.expiresAt || "",
  });
}
