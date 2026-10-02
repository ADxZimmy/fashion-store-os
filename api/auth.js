// Identity read endpoint: the signed-in viewer's account, store, membership,
// and role-scoped roster. Rewritten for Phase 021 row-based identity.
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
