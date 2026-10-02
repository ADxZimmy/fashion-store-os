// Identity action endpoint, rewritten for Phase 021 row-based identity.
// Responses carry identity only -- business state never rides a session
// payload under the local-first model. Every action dispatches through
// api/_identity_http.js, shared verbatim with the server.js dev mirror.
const { db } = require("./_db");
const { handleSessionAction } = require("./_identity_http");
const { handleError, handleOptions, readJsonBody, sendMethodNotAllowed } = require("./_response");

module.exports = async function handler(request, response) {
  const methods = ["POST", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (request.method !== "POST") {
    sendMethodNotAllowed(response, methods);
    return;
  }

  try {
    const body = (await readJsonBody(request)) || {};
    await handleSessionAction(db, request, response, body);
  } catch (error) {
    handleError(response, error);
  }
};
