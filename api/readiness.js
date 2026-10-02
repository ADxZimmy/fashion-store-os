// Readiness: is this deployment configured to do its job, plus one real
// database round trip. Before Phase 021 this was configuration-only and stayed
// green through the 2026-07-30 outage, because it never asked the database
// anything.
//
// Checks are split into required and optional. Channel intake is optional
// until a provider is connected; the old version made every check required,
// which left readiness red for a reason that was not a fault.
const { databaseSummary, db } = require("./_db");
const { boundStoreId } = require("./_inbox");
const { handleError, handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");

module.exports = async function handler(request, response) {
  const methods = ["GET", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, methods);
    return;
  }

  try {
    const database = databaseSummary();
    let reachable = false;
    let reachDetail = "Not checked: database not configured";
    if (database.configured) {
      try {
        await db.probe();
        reachable = true;
        reachDetail = "Round trip succeeded";
      } catch (error) {
        reachDetail = error.publicMessage || "Round trip failed";
      }
    }

    const releaseOwner = String(process.env.FASHION_STORE_RELEASE_OWNER || "ADxZimmy").trim();
    const signatureRequired = process.env.CHANNEL_WEBHOOK_REQUIRE_SIGNATURE === "1";
    const inboxStore = boundStoreId();

    const checks = [
      {
        name: "database configured",
        required: true,
        ok: database.configured,
        detail: database.configured ? `Postgres host ${database.host}` : database.error,
      },
      { name: "database reachable", required: true, ok: reachable, detail: reachDetail },
      { name: "owner release lane", required: true, ok: releaseOwner === "ADxZimmy", detail: releaseOwner },
      {
        name: "webhook signatures required",
        required: false,
        ok: signatureRequired,
        detail: signatureRequired ? "Required" : "Optional until a channel provider is connected",
      },
      {
        name: "channel intake bound to a store",
        required: false,
        ok: Boolean(inboxStore),
        detail: inboxStore || "FASHION_STORE_INBOX_STORE_ID not set; provider webhooks are refused",
      },
    ];

    sendJson(response, 200, {
      ok: checks.filter((check) => check.required).every((check) => check.ok),
      mode: "production",
      storage: "postgres",
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    handleError(response, error);
  }
};
