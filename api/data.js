const { handleError, handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");
const { removeDocuments } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["DELETE", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (request.method !== "DELETE") {
    sendMethodNotAllowed(response, methods);
    return;
  }

  try {
    await removeDocuments(["state", "auth"]);
    sendJson(response, 200, { ok: true });
  } catch (error) {
    handleError(response, error);
  }
};
