const { handleError, handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");
const { getSupabaseConfig } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, methods);
    return;
  }

  try {
    getSupabaseConfig();
    sendJson(response, 200, {
      ok: true,
      storage: "supabase",
      workspace: process.env.FASHION_STORE_WORKSPACE_ID || "default",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error.statusCode === 503) {
      sendJson(response, 200, {
        ok: false,
        storage: "unconfigured",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    handleError(response, error);
  }
};
