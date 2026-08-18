// File-backed adapter for the row-based identity plane: server.js local dev
// and the test suite. Same interface and same row shapes (snake_case) as
// api/_identity_supabase.js so the core cannot tell them apart. Mirrors the
// SQL foreign-key cascades by hand: deleting an account removes its
// memberships and sessions.
const fs = require("fs");
const path = require("path");

const EMPTY = {
  accounts: [],
  stores: [],
  memberships: [],
  sessions: [],
  invites: [],
  rateEvents: [],
  audit: [],
};

function createLocalIdentityStore(dataDir) {
  const filePath = path.join(dataDir, "identity.json");

  function load() {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      return { ...structuredClone(EMPTY), ...parsed };
    } catch (error) {
      return structuredClone(EMPTY);
    }
  }

  function save(data) {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, filePath);
  }

  function mutate(fn) {
    const data = load();
    const result = fn(data);
    save(data);
    return result;
  }

  const sameEmail = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

  return {
    findAccountByEmail: async (email) => load().accounts.find((row) => sameEmail(row.email, email)) || null,
    getAccount: async (id) => load().accounts.find((row) => row.id === id) || null,
    getAccounts: async (ids) => {
      const wanted = new Set(ids);
      return load().accounts.filter((row) => wanted.has(row.id));
    },
    insertAccount: async (row) =>
      mutate((data) => {
        if (data.accounts.some((item) => sameEmail(item.email, row.email))) {
          const error = new Error("An account already exists for that email. Sign in instead.");
          error.statusCode = 409;
          throw error;
        }
        data.accounts.push(row);
      }),
    updateAccount: async (id, patch) =>
      mutate((data) => {
        const row = data.accounts.find((item) => item.id === id);
        if (row) Object.assign(row, patch);
      }),
    deleteAccount: async (id) =>
      mutate((data) => {
        data.accounts = data.accounts.filter((item) => item.id !== id);
        // FK cascade parity.
        data.memberships = data.memberships.filter((item) => item.account_id !== id);
        data.sessions = data.sessions.filter((item) => item.account_id !== id);
      }),

    insertStore: async (row) => mutate((data) => void data.stores.push(row)),
    getStore: async (id) => load().stores.find((row) => row.id === id) || null,
    deleteStore: async (id) =>
      mutate((data) => {
        data.stores = data.stores.filter((item) => item.id !== id);
        data.memberships = data.memberships.filter((item) => item.store_id !== id);
        data.invites = data.invites.filter((item) => item.store_id !== id);
      }),

    listMembershipsByAccount: async (accountId) => load().memberships.filter((row) => row.account_id === accountId),
    listMembershipsByStore: async (storeId) =>
      load()
        .memberships.filter((row) => row.store_id === storeId)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    getMembership: async (accountId, storeId) =>
      load().memberships.find((row) => row.account_id === accountId && row.store_id === storeId) || null,
    insertMembership: async (row) =>
      mutate((data) => {
        // Mirrors the (account_id, store_id) primary key.
        if (data.memberships.some((item) => item.account_id === row.account_id && item.store_id === row.store_id)) {
          const error = new Error("That account is already a member of this store.");
          error.statusCode = 409;
          throw error;
        }
        data.memberships.push(row);
      }),
    updateMembership: async (accountId, storeId, patch) =>
      mutate((data) => {
        const row = data.memberships.find((item) => item.account_id === accountId && item.store_id === storeId);
        if (row) Object.assign(row, patch);
      }),
    deleteMembership: async (accountId, storeId) =>
      mutate((data) => {
        data.memberships = data.memberships.filter(
          (item) => !(item.account_id === accountId && item.store_id === storeId),
        );
      }),
    countMembers: async (storeId) => load().memberships.filter((row) => row.store_id === storeId).length,

    findSessionByTokenHash: async (tokenHash, nowIso) =>
      load().sessions.find((row) => row.token_hash === tokenHash && row.expires_at > nowIso) || null,
    insertSession: async (row) => mutate((data) => void data.sessions.push(row)),
    deleteSessionByTokenHash: async (tokenHash) =>
      mutate((data) => {
        data.sessions = data.sessions.filter((item) => item.token_hash !== tokenHash);
      }),
    deleteSessionsForAccount: async (accountId, exceptSessionId = "") =>
      mutate((data) => {
        data.sessions = data.sessions.filter(
          (item) => item.account_id !== accountId || (exceptSessionId && item.id === exceptSessionId),
        );
      }),

    listOpenInvitesByEmail: async (email) =>
      load().invites.filter((row) => sameEmail(row.email, email) && !row.accepted_at),
    listOpenInvitesByStore: async (storeId) =>
      load().invites.filter((row) => row.store_id === storeId && !row.accepted_at),
    findOpenInvite: async (storeId, email) =>
      load().invites.find((row) => row.store_id === storeId && sameEmail(row.email, email) && !row.accepted_at) || null,
    countOpenInvites: async (storeId, nowIso) =>
      load().invites.filter(
        (row) => row.store_id === storeId && !row.accepted_at && (!nowIso || row.expires_at > nowIso),
      ).length,
    insertInvite: async (row) =>
      mutate((data) => {
        // Mirrors the partial unique index on (store_id, lower(email))
        // where accepted_at is null. Without it, a dev-only race produced two
        // live invites with two valid tokens where production would refuse.
        if (
          data.invites.some(
            (item) => item.store_id === row.store_id && sameEmail(item.email, row.email) && !item.accepted_at,
          )
        ) {
          const error = new Error("An invite for that email was just created. Refresh and try again.");
          error.statusCode = 409;
          throw error;
        }
        data.invites.push(row);
      }),
    updateInvite: async (id, patch) =>
      mutate((data) => {
        const row = data.invites.find((item) => item.id === id);
        if (row) Object.assign(row, patch);
      }),
    deleteInvite: async (id) =>
      mutate((data) => {
        data.invites = data.invites.filter((item) => item.id !== id);
      }),

    countRateEvents: async (scope, key, sinceIso) =>
      load().rateEvents.filter((row) => row.scope === scope && row.key === key && row.created_at >= sinceIso).length,
    insertRateEvent: async ({ scope, key }) =>
      mutate((data) => void data.rateEvents.push({ scope, key, created_at: new Date().toISOString() })),

    insertAudit: async (row) => mutate((data) => void data.audit.push(row)),
    listAudit: async (storeId, limit) =>
      load()
        .audit.filter((row) => row.store_id === storeId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, Number(limit) || 200),

    sweep: async ({ nowIso, rateCutoffIso, auditCutoffIso }) =>
      mutate((data) => {
        data.sessions = data.sessions.filter((row) => row.expires_at > nowIso);
        data.invites = data.invites.filter((row) => row.accepted_at || row.expires_at > nowIso);
        data.rateEvents = data.rateEvents.filter((row) => row.created_at >= rateCutoffIso);
        data.audit = data.audit.filter((row) => row.created_at >= auditCutoffIso);
        return { ok: true };
      }),
  };
}

module.exports = { createLocalIdentityStore };
