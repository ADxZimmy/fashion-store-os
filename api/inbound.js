const { appendInboundMessage, normalizeChannelMessages } = require("./_inbound");
const { normalizeAuthDocument, requireSession } = require("./_auth");
const { handleError, handleOptions, readJsonBody, sendJson, sendMethodNotAllowed } = require("./_response");
const { getDocument, setDocument } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "POST", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;

  try {
    const authResult = await getDocument("auth");
    const normalized = normalizeAuthDocument(authResult.value || {});
    if (authResult.exists && normalized.changed) {
      await setDocument("auth", normalized.auth);
    }
    requireSession(normalized.auth, request);

    const result = await getDocument("state");
    const state = result.value || {};

    if (request.method === "GET") {
      sendJson(response, 200, {
        messages: normalizeChannelMessages(state.channelMessages),
        exists: result.exists,
      });
      return;
    }

    if (request.method === "POST") {
      const next = appendInboundMessage(state, await readJsonBody(request));
      await setDocument("state", next.state);
      sendJson(response, 201, { ok: true, message: next.message });
      return;
    }

    sendMethodNotAllowed(response, methods);
  } catch (error) {
    handleError(response, error);
  }
};
