// Production database access: Neon Postgres over its HTTP driver.
//
// The client is created on first use rather than at module load, so loading
// an endpoint never requires DATABASE_URL to be set. Health and readiness can
// then report "unconfigured" as a fact instead of crashing on import.
//
// Vercel's Neon integration provisions DATABASE_URL; POSTGRES_URL is accepted
// as a fallback because the same integration also sets it.
const { neon } = require("@neondatabase/serverless");
const { createPgIdentityStore } = require("./_identity_pg");

let sql = null;

function connectionString() {
  return String(process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();
}

function databaseSummary() {
  const url = connectionString();
  if (!url) return { configured: false, host: "", error: "DATABASE_URL is not set" };
  try {
    const parsed = new URL(url);
    if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
      return { configured: false, host: "", error: "DATABASE_URL is not a Postgres connection string" };
    }
    // Host only: never the user, password, or query string.
    return { configured: true, host: parsed.hostname, error: "" };
  } catch (error) {
    return { configured: false, host: "", error: "DATABASE_URL is not a valid URL" };
  }
}

function client() {
  if (sql) return sql;
  const summary = databaseSummary();
  if (!summary.configured) {
    const error = new Error(summary.error);
    error.statusCode = 503;
    error.publicMessage = "The database is not configured.";
    throw error;
  }
  sql = neon(connectionString());
  return sql;
}

// Errors carrying a SQLSTATE come from Postgres itself and pass through
// untouched: the adapter needs the code to turn a unique violation into a 409.
// Anything else failed before Postgres answered -- DNS, network, or a cold
// start that never completed -- and becomes a 502 with a message that does not
// leak connection details.
function classify(error) {
  if (error && typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)) return error;
  if (error && error.statusCode) return error;
  const wrapped = new Error(`Database request failed: ${error?.message || "unknown error"}`);
  wrapped.statusCode = 502;
  wrapped.publicMessage = "The database is unreachable.";
  wrapped.cause = error;
  return wrapped;
}

const driver = {
  async query(text, params = []) {
    try {
      return await client().query(text, params);
    } catch (error) {
      throw classify(error);
    }
  },
  async transaction(statements) {
    try {
      const db = client();
      return await db.transaction(statements.map(([text, params]) => db.query(text, params || [])));
    } catch (error) {
      throw classify(error);
    }
  },
};

const db = createPgIdentityStore({ query: driver.query, transaction: driver.transaction });

module.exports = { databaseSummary, db, driver };
