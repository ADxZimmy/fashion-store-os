const { handleError, handleOptions, readJsonBody, sendJson, sendMethodNotAllowed } = require("./_response");
const { normalizeAuthDocument, requireSession } = require("./_auth");
const { getDocument, setDocument } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "PUT", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;

  try {
    const authResult = await getDocument("auth");
    const normalized = normalizeAuthDocument(authResult.value || {});
    if (authResult.exists && normalized.changed) {
      await setDocument("auth", normalized.auth);
    }
    requireSession(normalized.auth, request);

    if (request.method === "GET") {
      const result = await getDocument("state");
      sendJson(response, 200, { state: result.value, exists: result.exists });
      return;
    }

    if (request.method === "PUT") {
      await setDocument("state", await readJsonBody(request));
      sendJson(response, 200, { ok: true });
      return;
    }

    sendMethodNotAllowed(response, methods);
  } catch (error) {
    handleError(response, error);
  }
};
