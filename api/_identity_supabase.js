// Supabase adapter for the row-based identity plane. Same PostgREST transport
// as the legacy document store (api/_store.js supabaseRequest) with the
// service-role key; these tables revoke anon/authenticated entirely.
const { supabaseRequest } = require("./_store");

const T = {
  accounts: "/fashion_store_os_accounts",
  stores: "/fashion_store_os_stores",
  memberships: "/fashion_store_os_memberships",
  sessions: "/fashion_store_os_sessions",
  invites: "/fashion_store_os_invites",
  rateEvents: "/fashion_store_os_rate_limit_events",
  audit: "/fashion_store_os_identity_audit",
};

const MINIMAL = { Prefer: "return=minimal" };
const WRITE_OK = [200, 201, 204];

function q(value) {
  return encodeURIComponent(String(value));
}

async function rows(pathAndQuery) {
  const result = await supabaseRequest("GET", pathAndQuery);
  return Array.isArray(result) ? result : [];
}

async function one(pathAndQuery) {
  const result = await rows(`${pathAndQuery}&limit=1`);
  return result[0] || null;
}

async function insert(table, row, { conflictMessage } = {}) {
  try {
    await supabaseRequest("POST", table, [row], MINIMAL, WRITE_OK);
  } catch (error) {
    if (conflictMessage && error.storageStatus === 409) {
      const conflict = new Error(conflictMessage);
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

async function update(pathAndQuery, patch) {
  await supabaseRequest("PATCH", pathAndQuery, patch, MINIMAL, WRITE_OK);
}

async function remove(pathAndQuery) {
  await supabaseRequest("DELETE", pathAndQuery, undefined, MINIMAL, [200, 202, 204]);
}

module.exports = {
  // Accounts. Emails are lowercased before storage, so eq matches are exact.
  findAccountByEmail: (email) => one(`${T.accounts}?email=eq.${q(email)}&select=*`),
  getAccount: (id) => one(`${T.accounts}?id=eq.${q(id)}&select=*`),
  getAccounts: async (ids) => {
    if (!ids.length) return [];
    const list = ids.map((id) => `"${String(id).replace(/"/g, "")}"`).join(",");
    return rows(`${T.accounts}?id=in.(${list})&select=*`);
  },
  insertAccount: (row) =>
    insert(T.accounts, row, { conflictMessage: "An account already exists for that email. Sign in instead." }),
  updateAccount: (id, patch) => update(`${T.accounts}?id=eq.${q(id)}`, patch),
  deleteAccount: (id) => remove(`${T.accounts}?id=eq.${q(id)}`),

  // Stores.
  insertStore: (row) => insert(T.stores, row),
  getStore: (id) => one(`${T.stores}?id=eq.${q(id)}&select=*`),
  deleteStore: (id) => remove(`${T.stores}?id=eq.${q(id)}`),

  // Memberships.
  listMembershipsByAccount: (accountId) => rows(`${T.memberships}?account_id=eq.${q(accountId)}&select=*`),
  listMembershipsByStore: (storeId) => rows(`${T.memberships}?store_id=eq.${q(storeId)}&select=*&order=created_at.asc`),
  getMembership: (accountId, storeId) =>
    one(`${T.memberships}?account_id=eq.${q(accountId)}&store_id=eq.${q(storeId)}&select=*`),
  insertMembership: (row) =>
    insert(T.memberships, row, { conflictMessage: "That account is already a member of this store." }),
  updateMembership: (accountId, storeId, patch) =>
    update(`${T.memberships}?account_id=eq.${q(accountId)}&store_id=eq.${q(storeId)}`, patch),
  deleteMembership: (accountId, storeId) =>
    remove(`${T.memberships}?account_id=eq.${q(accountId)}&store_id=eq.${q(storeId)}`),
  countMembers: async (storeId) => (await rows(`${T.memberships}?store_id=eq.${q(storeId)}&select=account_id`)).length,

  // Sessions. The expiry filter lives in the query, so an expired session is
  // simply never found -- no separate expiry branch to get wrong.
  findSessionByTokenHash: (tokenHash, nowIso) =>
    one(`${T.sessions}?token_hash=eq.${q(tokenHash)}&expires_at=gt.${q(nowIso)}&select=*`),
  insertSession: (row) => insert(T.sessions, row),
  deleteSessionByTokenHash: (tokenHash) => remove(`${T.sessions}?token_hash=eq.${q(tokenHash)}`),
  deleteSessionsForAccount: (accountId, exceptSessionId = "") =>
    remove(
      exceptSessionId
        ? `${T.sessions}?account_id=eq.${q(accountId)}&id=neq.${q(exceptSessionId)}`
        : `${T.sessions}?account_id=eq.${q(accountId)}`,
    ),

  // Invites.
  listOpenInvitesByEmail: (email) => rows(`${T.invites}?email=eq.${q(email)}&accepted_at=is.null&select=*`),
  listOpenInvitesByStore: (storeId) => rows(`${T.invites}?store_id=eq.${q(storeId)}&accepted_at=is.null&select=*`),
  findOpenInvite: (storeId, email) =>
    one(`${T.invites}?store_id=eq.${q(storeId)}&email=eq.${q(email)}&accepted_at=is.null&select=*`),
  // nowIso filters to live invites; expired rows must not hold quota.
  countOpenInvites: async (storeId, nowIso) =>
    (await rows(
      `${T.invites}?store_id=eq.${q(storeId)}&accepted_at=is.null${nowIso ? `&expires_at=gt.${q(nowIso)}` : ""}&select=id`,
    )).length,
  insertInvite: (row) =>
    insert(T.invites, row, { conflictMessage: "An invite for that email was just created. Refresh and try again." }),
  updateInvite: (id, patch) => update(`${T.invites}?id=eq.${q(id)}`, patch),
  deleteInvite: (id) => remove(`${T.invites}?id=eq.${q(id)}`),

  // Rate-limit events. Counted by fetching ids within the window -- windows
  // hold at most a few dozen rows by construction, so no count header needed.
  countRateEvents: async (scope, key, sinceIso) =>
    (await rows(`${T.rateEvents}?scope=eq.${q(scope)}&key=eq.${q(key)}&created_at=gte.${q(sinceIso)}&select=scope`)).length,
  insertRateEvent: ({ scope, key }) => insert(T.rateEvents, { scope, key }),

  // Audit.
  insertAudit: (row) => insert(T.audit, row),
  listAudit: (storeId, limit) =>
    rows(`${T.audit}?store_id=eq.${q(storeId)}&select=*&order=created_at.desc&limit=${Number(limit) || 200}`),

  // Retention, run by the keepalive cron.
  sweep: async ({ nowIso, rateCutoffIso, auditCutoffIso }) => {
    await remove(`${T.sessions}?expires_at=lte.${q(nowIso)}`);
    await remove(`${T.invites}?expires_at=lte.${q(nowIso)}&accepted_at=is.null`);
    await remove(`${T.rateEvents}?created_at=lt.${q(rateCutoffIso)}`);
    await remove(`${T.audit}?created_at=lt.${q(auditCutoffIso)}`);
    return { ok: true };
  },
};
