const { handleError, handleOptions, readJsonBody, sendJson, sendMethodNotAllowed } = require("./_response");
const { getDocument, setDocument } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "PUT", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;

  try {
    if (request.method === "GET") {
      const result = await getDocument("auth");
      sendJson(response, 200, { auth: result.value, exists: result.exists });
      return;
    }

    if (request.method === "PUT") {
      await setDocument("auth", await readJsonBody(request));
      sendJson(response, 200, { ok: true });
      return;
    }

    sendMethodNotAllowed(response, methods);
  } catch (error) {
    handleError(response, error);
  }
};
