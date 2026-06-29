const { handleError, handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");
const { normalizeAuthDocument, requireManager, sanitizeAuth } = require("./_auth");
const { getStorageSummary, storeForRequest } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "DELETE", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (!["GET", "DELETE"].includes(request.method)) {
    sendMethodNotAllowed(response, methods);
    return;
  }

  try {
    const store = storeForRequest(request);
    const authResult = await store.getDocument("auth");
    const normalized = normalizeAuthDocument(authResult.value || {});
    if (authResult.exists && normalized.changed) {
      await store.setDocument("auth", normalized.auth);
    }
    const { user } = requireManager(normalized.auth, request);

    if (request.method === "GET") {
      const stateResult = await store.getDocument("state");
      sendJson(response, 200, {
        ok: true,
        exportedAt: new Date().toISOString(),
        storage: getStorageSummary(),
        state: stateResult.value,
        stateExists: stateResult.exists,
        auth: sanitizeAuth(normalized.auth, user.id),
        authExists: authResult.exists || normalized.auth.users.length > 0,
      });
      return;
    }

    await store.removeDocuments(["state", "auth"]);
    sendJson(response, 200, { ok: true });
  } catch (error) {
    handleError(response, error);
  }
};
