const crypto = require("crypto");
const { sweepIdentity } = require("./_identity");
const identityDb = require("./_identity_supabase");
const { handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");
const { getStorageSummary, probeStorage } = require("./_store");

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set
// on the project. When it is unset the route stays open, matching /api/health.
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

  // probeStorage issues a real Supabase REST query. That query is the point of
  // this route: it counts as project activity and resets the free-tier pause
  // timer. Unlike /api/health this returns a non-2xx when the probe fails, so a
  // dead database surfaces as a failed cron invocation instead of a silent 200.
  try {
    const storage = await probeStorage();
    // Phase 021: the daily cron doubles as the retention sweep for the
    // identity tables -- expired sessions and invites, day-old rate-limit
    // events, 90-day-old audit rows. Best effort: a sweep failure must not
    // turn a healthy keepalive into a failed cron run, so it logs instead.
    let sweep = null;
    try {
      sweep = await sweepIdentity(identityDb);
    } catch (sweepError) {
      console.error("identity sweep failed", sweepError);
      sweep = { ok: false, error: sweepError.publicMessage || sweepError.message };
    }
    sendJson(response, 200, {
      ok: true,
      storage: "supabase",
      supabaseHost: storage.host,
      workspace: storage.workspace,
      sweep,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("keepalive probe failed", error);
    const storage = getStorageSummary();
    sendJson(response, 503, {
      ok: false,
      storage: error.statusCode === 503 ? "unconfigured" : "supabase-unreachable",
      error: error.publicMessage || error.message,
      supabaseHost: storage.host,
      workspace: storage.workspace,
      timestamp: new Date().toISOString(),
    });
  }
};
