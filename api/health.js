const { handleError, handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");
const { getStorageSummary, probeStorage } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, methods);
    return;
  }

  try {
    const storage = await probeStorage();
    sendJson(response, 200, {
      ok: true,
      storage: "supabase",
      supabaseHost: storage.host,
      workspace: storage.workspace,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const storage = getStorageSummary();

    if (error.statusCode === 503) {
      sendJson(response, 200, {
        ok: false,
        storage: "unconfigured",
        error: error.message,
        workspace: storage.workspace,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (error.statusCode === 502) {
      sendJson(response, 200, {
        ok: false,
        storage: "supabase-unreachable",
        error: error.publicMessage || error.message,
        supabaseHost: storage.host,
        workspace: storage.workspace,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    handleError(response, error);
  }
};
