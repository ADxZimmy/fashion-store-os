const { handleError, handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");
const { normalizeAuthDocument, requireManager } = require("./_auth");
const { getDocument, removeDocuments, setDocument } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["DELETE", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (request.method !== "DELETE") {
    sendMethodNotAllowed(response, methods);
    return;
  }

  try {
    const authResult = await getDocument("auth");
    const normalized = normalizeAuthDocument(authResult.value || {});
    if (authResult.exists && normalized.changed) {
      await setDocument("auth", normalized.auth);
    }
    requireManager(normalized.auth, request);
    await removeDocuments(["state", "auth"]);
    sendJson(response, 200, { ok: true });
  } catch (error) {
    handleError(response, error);
  }
};
