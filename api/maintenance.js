// Daily maintenance, run by Vercel Cron (vercel.json).
//
// This replaced /api/keepalive, whose only purpose was issuing a query so the
// Supabase free tier would not pause the project. It paused anyway, twice,
// which is why the database moved to Neon. Neon scales idle compute to zero
// and wakes it on the next query, so nothing needs keeping alive. What still
// needs a daily schedule is retention: expired sessions and invites, day-old
// rate-limit events, 90-day-old audit rows, and undelivered inbox messages.
//
// Unlike /api/health this answers non-2xx on failure, so a broken sweep or an
// unreachable database surfaces as a failed cron run instead of a silent 200.
const crypto = require("crypto");
const { sweepIdentity } = require("./_identity");
const { databaseSummary, db } = require("./_db");
const { handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is
// set on the project. When it is unset the route stays open, matching the
// previous keepalive behaviour.
function isAuthorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  const provided = Buffer.from(String(request.headers.authorization || ""));
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

module.exports = async function handler(request, response) {
  const methods = ["GET", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, methods);
    return;
  }
  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: "Unauthorized" });
    return;
  }

  const summary = databaseSummary();
  try {
    const sweep = await sweepIdentity(db);
    sendJson(response, 200, {
      ok: true,
      storage: "postgres",
      databaseHost: summary.host,
      sweep,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("daily maintenance failed", error);
    sendJson(response, error.statusCode === 503 ? 503 : 502, {
      ok: false,
      storage: error.statusCode === 503 ? "unconfigured" : "database-unreachable",
      error: error.publicMessage || "Maintenance failed",
      databaseHost: summary.host,
      timestamp: new Date().toISOString(),
    });
  }
};
