const { normalizeAuthDocument, resolveSession, sanitizeAuth } = require("./_auth");
const { handleError, handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");
const { getDocument, setDocument } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;

  try {
    if (request.method === "GET") {
      const result = await getDocument("auth");
      const normalized = normalizeAuthDocument(result.value || {});
      if (result.exists && normalized.changed) {
        await setDocument("auth", normalized.auth);
      }
      const resolved = resolveSession(normalized.auth, request);
      sendJson(response, 200, {
        auth: sanitizeAuth(normalized.auth, resolved.user?.id || ""),
        authenticated: Boolean(resolved.user),
        exists: result.exists || normalized.auth.users.length > 0,
      });
      return;
    }

    sendMethodNotAllowed(response, methods);
  } catch (error) {
    handleError(response, error);
  }
};
