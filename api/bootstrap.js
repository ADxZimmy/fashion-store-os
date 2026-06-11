const { handleError, handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");
const { getDocument } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, methods);
    return;
  }

  try {
    const [stateResult, authResult] = await Promise.all([
      getDocument("state"),
      getDocument("auth"),
    ]);
    sendJson(response, 200, {
      state: stateResult.value,
      stateExists: stateResult.exists,
      auth: authResult.value,
      authExists: authResult.exists,
    });
  } catch (error) {
    handleError(response, error);
  }
};
