const { handleError, handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");
const { normalizeAuthDocument, resolveSession, sanitizeAuth } = require("./_auth");
const { storeForRequest } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, methods);
    return;
  }

  try {
    const store = storeForRequest(request);
    const [stateResult, authResult] = await Promise.all([
      store.getDocument("state"),
      store.getDocument("auth"),
    ]);
    const normalized = normalizeAuthDocument(authResult.value || {});
    if (authResult.exists && normalized.changed) {
      await store.setDocument("auth", normalized.auth);
    }
    const resolved = resolveSession(normalized.auth, request);
    const canReadState = !normalized.auth.users.length || Boolean(resolved.user);
    sendJson(response, 200, {
      state: canReadState ? stateResult.value : null,
      stateExists: stateResult.exists,
      auth: sanitizeAuth(normalized.auth, resolved.user?.id || ""),
      authExists: authResult.exists || normalized.auth.users.length > 0,
      authenticated: Boolean(resolved.user),
      stateLocked: !canReadState && stateResult.exists,
    });
  } catch (error) {
    handleError(response, error);
  }
};
