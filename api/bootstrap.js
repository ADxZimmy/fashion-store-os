// App-open endpoint, rewritten for Phase 021: an identity/session check and
// nothing else. Business state lives on the device now; the trust direction
// flipped, so an unauthenticated answer here must never cause the client to
// touch local data -- it only locks the UI.
const { db } = require("./_db");
const { handleIdentityGet } = require("./_identity_http");
const { handleError, handleOptions, sendMethodNotAllowed } = require("./_response");

module.exports = async function handler(request, response) {
  const methods = ["GET", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, methods);
    return;
  }

  try {
    await handleIdentityGet(db, request, response);
  } catch (error) {
    handleError(response, error);
  }
};
