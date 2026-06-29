const { handleError, handleOptions, readJsonBody, sendJson, sendMethodNotAllowed } = require("./_response");
const { normalizeAuthDocument, requireSession } = require("./_auth");
const { storeForRequest } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "PUT", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;

  try {
    const store = storeForRequest(request);
    const authResult = await store.getDocument("auth");
    const normalized = normalizeAuthDocument(authResult.value || {});
    if (authResult.exists && normalized.changed) {
      await store.setDocument("auth", normalized.auth);
    }
    requireSession(normalized.auth, request);

    if (request.method === "GET") {
      const result = await store.getDocument("state");
      sendJson(response, 200, { state: result.value, exists: result.exists });
      return;
    }

    if (request.method === "PUT") {
      await store.setDocument("state", await readJsonBody(request));
      sendJson(response, 200, { ok: true });
      return;
    }

    sendMethodNotAllowed(response, methods);
  } catch (error) {
    handleError(response, error);
  }
};
