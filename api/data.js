const { handleError, handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");
const { normalizeAuthDocument, requireManager, sanitizeAuth } = require("./_auth");
const { getDocument, getStorageSummary, removeDocuments, setDocument } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "DELETE", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (!["GET", "DELETE"].includes(request.method)) {
    sendMethodNotAllowed(response, methods);
    return;
  }

  try {
    const authResult = await getDocument("auth");
    const normalized = normalizeAuthDocument(authResult.value || {});
    if (authResult.exists && normalized.changed) {
      await setDocument("auth", normalized.auth);
    }
    const { user } = requireManager(normalized.auth, request);

    if (request.method === "GET") {
      const stateResult = await getDocument("state");
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

    await removeDocuments(["state", "auth"]);
    sendJson(response, 200, { ok: true });
  } catch (error) {
    handleError(response, error);
  }
};
