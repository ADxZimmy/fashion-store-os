// The one storage adapter for the server side (identity, backups, inbox),
// written as SQL against Postgres. Production runs it over Neon's HTTP driver
// (api/_db.js); the local dev server and every test run it over PGlite, a
// real Postgres embedded in-process.
//
// It replaces two adapters: the Supabase one, which had zero test coverage
// because nothing could exercise PostgREST locally, and a file-backed fake
// for dev and tests, which drifted from the Supabase one in ways the step 1
// review had to catch (case sensitivity, unique constraints). One adapter
// with one SQL dialect leaves nothing to drift: the code the tests prove is
// the code production runs.
//
// Row shapes stay snake_case with ISO-string timestamps, exactly the contract
// api/_identity.js was written against, so the core is unchanged by the move.

const T = {
  accounts: "fashion_store_os_accounts",
  stores: "fashion_store_os_stores",
  memberships: "fashion_store_os_memberships",
  sessions: "fashion_store_os_sessions",
  invites: "fashion_store_os_invites",
  rateEvents: "fashion_store_os_rate_limit_events",
  audit: "fashion_store_os_identity_audit",
  backups: "fashion_store_os_backups",
  inbox: "fashion_store_os_inbox_messages",
};

// Columns each update may touch. Patches come from the core, not from
// requests, but column names are interpolated into SQL, so an unknown key is a
// programming error that fails loudly instead of reaching the query text.
const UPDATABLE = {
  accounts: new Set([
    "email",
    "name",
    "password_hash",
    "password_salt",
    "password_iterations",
    "password_digest",
    "password_updated_at",
    "recovery_code_hash",
    "recovery_issued_at",
    "recovery_redeemed_at",
    "last_sign_in_at",
    "updated_at",
  ]),
  memberships: new Set(["role", "status", "allowed_views", "suspended_at", "updated_at"]),
  invites: new Set(["name", "role", "allowed_views", "accepted_at", "expires_at"]),
};
const JSON_COLUMNS = new Set(["allowed_views", "payload"]);

const ACCOUNT_COLUMNS = [
  "id",
  "email",
  "name",
  "password_hash",
  "password_salt",
  "password_iterations",
  "password_digest",
  "password_updated_at",
  "recovery_code_hash",
  "recovery_issued_at",
  "recovery_redeemed_at",
  "last_sign_in_at",
  "created_at",
  "updated_at",
];

function createPgIdentityStore({ query }) {
  if (typeof query !== "function") {
    throw new Error("createPgIdentityStore needs a query(text, params) function");
  }

  async function rows(text, params = []) {
    const result = await query(text, params);
    return result.map(normalizeRow);
  }

  async function one(text, params = []) {
    const result = await rows(text, params);
    return result[0] || null;
  }

  // Inserts only the columns the row actually carries, so table defaults
  // apply to anything the caller left out rather than being overwritten with
  // null.
  async function insert(table, columns, row, conflictMessage) {
    const present = columns.filter((column) => row[column] !== undefined);
    const values = present.map((column) => toParam(column, row[column]));
    const placeholders = present.map((column, index) =>
      JSON_COLUMNS.has(column) ? `$${index + 1}::jsonb` : `$${index + 1}`,
    );
    try {
      await query(`insert into ${table} (${present.join(", ")}) values (${placeholders.join(", ")})`, values);
    } catch (error) {
      if (conflictMessage && isUniqueViolation(error)) throw conflict(conflictMessage);
      throw error;
    }
  }

  async function update(table, allowed, patch, whereSql, whereParams) {
    const keys = Object.keys(patch).filter((key) => patch[key] !== undefined);
    if (!keys.length) return;
    for (const key of keys) {
      if (!allowed.has(key)) throw new Error(`Column ${key} is not updatable on ${table}`);
    }
    const sets = keys.map((key, index) =>
      JSON_COLUMNS.has(key) ? `${key} = $${index + 1}::jsonb` : `${key} = $${index + 1}`,
    );
    const params = keys.map((key) => toParam(key, patch[key]));
    const shiftedWhere = whereSql.replace(/\$(\d+)/g, (match, n) => `$${Number(n) + keys.length}`);
    await query(`update ${table} set ${sets.join(", ")} where ${shiftedWhere}`, [...params, ...whereParams]);
  }

  async function count(text, params) {
    const result = await query(text, params);
    return Number(result[0]?.count || 0);
  }

  return {
    // --- Accounts -------------------------------------------------------
    // lower() on both sides matches the unique index and makes lookups
    // case-insensitive by construction, rather than relying on every caller
    // remembering to lowercase -- the divergence the step 1 review flagged.
    findAccountByEmail: (email) => one(`select * from ${T.accounts} where lower(email) = lower($1) limit 1`, [email]),
    getAccount: (id) => one(`select * from ${T.accounts} where id = $1`, [id]),
    getAccounts: (ids) =>
      ids.length
        ? rows(`select * from ${T.accounts} where id in (select jsonb_array_elements_text($1::jsonb))`, [JSON.stringify(ids)])
        : Promise.resolve([]),
    insertAccount: (row) =>
      insert(T.accounts, ACCOUNT_COLUMNS, row, "An account already exists for that email. Sign in instead."),
    updateAccount: (id, patch) => update(T.accounts, UPDATABLE.accounts, patch, "id = $1", [id]),
    // Memberships and sessions cascade by foreign key.
    deleteAccount: (id) => query(`delete from ${T.accounts} where id = $1`, [id]),

    // --- Stores ---------------------------------------------------------
    insertStore: (row) => insert(T.stores, ["id", "name", "created_by", "created_at", "updated_at"], row),
    getStore: (id) => one(`select * from ${T.stores} where id = $1`, [id]),
    deleteStore: (id) => query(`delete from ${T.stores} where id = $1`, [id]),

    // --- Memberships ----------------------------------------------------
    listMembershipsByAccount: (accountId) =>
      rows(`select * from ${T.memberships} where account_id = $1 order by created_at asc`, [accountId]),
    listMembershipsByStore: (storeId) =>
      rows(`select * from ${T.memberships} where store_id = $1 order by created_at asc`, [storeId]),
    getMembership: (accountId, storeId) =>
      one(`select * from ${T.memberships} where account_id = $1 and store_id = $2`, [accountId, storeId]),
    insertMembership: (row) =>
      insert(
        T.memberships,
        ["account_id", "store_id", "role", "status", "allowed_views", "suspended_at", "created_at", "updated_at"],
        row,
        "That account is already a member of this store.",
      ),
    updateMembership: (accountId, storeId, patch) =>
      update(T.memberships, UPDATABLE.memberships, patch, "account_id = $1 and store_id = $2", [accountId, storeId]),
    deleteMembership: (accountId, storeId) =>
      query(`delete from ${T.memberships} where account_id = $1 and store_id = $2`, [accountId, storeId]),
    countMembers: (storeId) => count(`select count(*)::int as count from ${T.memberships} where store_id = $1`, [storeId]),

    // --- Sessions -------------------------------------------------------
    // The expiry filter lives in the query, so an expired session is never
    // found at all -- there is no separate expiry branch to get wrong.
    findSessionByTokenHash: (tokenHash, nowIso) =>
      one(`select * from ${T.sessions} where token_hash = $1 and expires_at > $2`, [tokenHash, nowIso]),
    insertSession: (row) => insert(T.sessions, ["id", "account_id", "token_hash", "created_at", "expires_at"], row),
    deleteSessionByTokenHash: (tokenHash) => query(`delete from ${T.sessions} where token_hash = $1`, [tokenHash]),
    deleteSessionsForAccount: (accountId, exceptSessionId = "") =>
      query(`delete from ${T.sessions} where account_id = $1 and ($2 = '' or id <> $2)`, [accountId, exceptSessionId || ""]),

    // --- Invites --------------------------------------------------------
    listOpenInvitesByEmail: (email) =>
      rows(`select * from ${T.invites} where lower(email) = lower($1) and accepted_at is null`, [email]),
    listOpenInvitesByStore: (storeId) =>
      rows(`select * from ${T.invites} where store_id = $1 and accepted_at is null order by created_at asc`, [storeId]),
    findOpenInvite: (storeId, email) =>
      one(`select * from ${T.invites} where store_id = $1 and lower(email) = lower($2) and accepted_at is null`, [storeId, email]),
    // Live invites only when a time is given: an expired invite is hidden from
    // the manager, so it must not hold quota either.
    countOpenInvites: (storeId, nowIso) =>
      nowIso
        ? count(`select count(*)::int as count from ${T.invites} where store_id = $1 and accepted_at is null and expires_at > $2`, [storeId, nowIso])
        : count(`select count(*)::int as count from ${T.invites} where store_id = $1 and accepted_at is null`, [storeId]),
    insertInvite: (row) =>
      insert(
        T.invites,
        ["id", "store_id", "email", "name", "role", "allowed_views", "token_hash", "created_by", "created_at", "expires_at", "accepted_at"],
        row,
        "An invite for that email was just created. Refresh and try again.",
      ),
    updateInvite: (id, patch) => update(T.invites, UPDATABLE.invites, patch, "id = $1", [id]),
    deleteInvite: (id) => query(`delete from ${T.invites} where id = $1`, [id]),

    // --- Rate limiting --------------------------------------------------
    countRateEvents: (scope, key, sinceIso) =>
      count(`select count(*)::int as count from ${T.rateEvents} where scope = $1 and key = $2 and created_at >= $3`, [scope, key, sinceIso]),
    // Timestamped from the application clock, the same clock the core uses to
    // compute the window, so an attempt is always counted inside its own
    // window regardless of any skew between app and database servers.
    insertRateEvent: ({ scope, key }) =>
      query(`insert into ${T.rateEvents} (scope, key, created_at) values ($1, $2, $3)`, [scope, key, new Date().toISOString()]),

    // --- Audit ----------------------------------------------------------
    insertAudit: (row) =>
      insert(
        T.audit,
        ["id", "store_id", "type", "actor_account_id", "actor_email", "target_account_id", "target_email", "detail", "created_at"],
        row,
      ),
    listAudit: (storeId, limit) =>
      rows(`select * from ${T.audit} where store_id = $1 order by created_at desc limit $2`, [storeId, Number(limit) || 200]),

    // --- Encrypted backups ----------------------------------------------
    getBackup: (storeId) => one(`select * from ${T.backups} where store_id = $1`, [storeId]),
    putBackup: (row) =>
      query(
        `insert into ${T.backups} (store_id, ciphertext, salt, iv, format, byte_size, created_by, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (store_id) do update set
           ciphertext = excluded.ciphertext,
           salt = excluded.salt,
           iv = excluded.iv,
           format = excluded.format,
           byte_size = excluded.byte_size,
           created_by = excluded.created_by,
           updated_at = excluded.updated_at`,
        [row.store_id, row.ciphertext, row.salt, row.iv, row.format, row.byte_size, row.created_by, row.created_at, row.updated_at],
      ),
    deleteBackup: (storeId) => query(`delete from ${T.backups} where store_id = $1`, [storeId]),

    // --- Transit inbox --------------------------------------------------
    // The unique index on (store_id, fingerprint) makes a provider retry a
    // no-op; returning nothing is how a duplicate reports itself.
    insertInboxMessage: async (row) => {
      const result = await query(
        `insert into ${T.inbox} (id, store_id, fingerprint, payload, received_at, expires_at)
         values ($1, $2, $3, $4::jsonb, $5, $6)
         on conflict (store_id, fingerprint) do nothing
         returning id`,
        [row.id, row.store_id, row.fingerprint, JSON.stringify(row.payload), row.received_at, row.expires_at],
      );
      return result.length > 0;
    },
    listInboxMessages: (storeId, limit) =>
      rows(`select * from ${T.inbox} where store_id = $1 order by received_at asc limit $2`, [storeId, Number(limit) || 200]),
    deleteInboxMessages: async (storeId, ids) => {
      if (!ids.length) return 0;
      const result = await query(
        `delete from ${T.inbox} where store_id = $1 and id in (select jsonb_array_elements_text($2::jsonb)) returning id`,
        [storeId, JSON.stringify(ids)],
      );
      return result.length;
    },

    // --- Retention, run by the daily maintenance cron --------------------
    sweep: async ({ nowIso, rateCutoffIso, auditCutoffIso }) => {
      await query(`delete from ${T.sessions} where expires_at <= $1`, [nowIso]);
      await query(`delete from ${T.invites} where expires_at <= $1 and accepted_at is null`, [nowIso]);
      await query(`delete from ${T.rateEvents} where created_at < $1`, [rateCutoffIso]);
      await query(`delete from ${T.audit} where created_at < $1`, [auditCutoffIso]);
      await query(`delete from ${T.inbox} where expires_at <= $1`, [nowIso]);
      return { ok: true };
    },

    // Liveness for /api/health: a real round trip, not a configuration check.
    probe: async () => {
      await query("select 1 as ok", []);
      return { ok: true };
    },
  };
}

function toParam(column, value) {
  if (value === undefined) return null;
  if (JSON_COLUMNS.has(column)) return JSON.stringify(value ?? null);
  return value;
}

// Both drivers hand timestamptz back as Date objects; the core compares ISO
// strings, so normalize here once rather than at every call site.
function normalizeRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

function isUniqueViolation(error) {
  return Boolean(error && error.code === "23505");
}

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

module.exports = { createPgIdentityStore, TABLES: T };
