// Liveness: a real round trip to the database, not a configuration check.
//
// Answers 200 either way and reports state in the body, as it always has, so
// monitors can distinguish "the app is up but the database is not" from "the
// app is down". What a red result means changed with Phase 021: business
// records live on devices, so an unreachable database blocks sign-in, invites,
// recovery, backups, and the inbox -- while signed-in devices keep working.
const { databaseSummary, db } = require("./_db");
const { handleError, handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");

module.exports = async function handler(request, response) {
  const methods = ["GET", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, methods);
    return;
  }

  const summary = databaseSummary();
  try {
    await db.probe();
    sendJson(response, 200, {
      ok: true,
      storage: "postgres",
      databaseHost: summary.host,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error.statusCode === 503) {
      sendJson(response, 200, {
        ok: false,
        storage: "unconfigured",
        error: error.publicMessage || error.message,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (error.statusCode === 502) {
      sendJson(response, 200, {
        ok: false,
        storage: "database-unreachable",
        error: error.publicMessage || error.message,
        databaseHost: summary.host,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    handleError(response, error);
  }
};
