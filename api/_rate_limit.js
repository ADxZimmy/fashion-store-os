// Workspace codes are deliberately short so a person can type them. A TTL alone
// does not make a short code safe -- 31^10 is large, but an unthrottled endpoint
// invites guessing regardless. This caps attempts per client.
//
// Deliberately in-memory. Serverless instances do not share this map, so it is a
// speed bump per instance rather than a global limit. That is the honest scope:
// it defeats a naive loop from one client, not a distributed attack. A durable
// limiter belongs in the storage layer if this ever needs to be a real control.

const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_TRACKED_CLIENTS = 5000;

const attempts = new Map();

function clientKey(request) {
  const headers = request?.headers || {};
  const forwarded = headers["x-forwarded-for"] || headers["X-Forwarded-For"] || "";
  const first = String(Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim();
  return first || request?.socket?.remoteAddress || "unknown";
}

function assertRedeemAllowed(request, now = Date.now()) {
  const key = clientKey(request);
  const record = attempts.get(key);

  if (!record || now - record.startedAt >= WINDOW_MS) {
    attempts.set(key, { startedAt: now, count: 1 });
    pruneIfNeeded(now);
    return;
  }

  record.count += 1;
  if (record.count > MAX_ATTEMPTS) {
    const error = new Error("Too many attempts. Wait a minute and try again.");
    error.statusCode = 429;
    throw error;
  }
}

// Bound the map so a long-lived instance cannot grow without limit.
function pruneIfNeeded(now) {
  if (attempts.size <= MAX_TRACKED_CLIENTS) return;
  for (const [key, record] of attempts) {
    if (now - record.startedAt >= WINDOW_MS) attempts.delete(key);
  }
}

function resetRateLimit() {
  attempts.clear();
}

module.exports = {
  MAX_ATTEMPTS,
  WINDOW_MS,
  assertRedeemAllowed,
  resetRateLimit,
};
