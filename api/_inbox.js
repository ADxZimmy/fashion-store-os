// Transit inbox (Phase 021 step 5).
//
// Provider webhooks are the only business-data write path that cannot start on
// a device, so the server has to catch them somewhere. It catches them here and
// holds them only until a signed-in device pulls them: rows are deleted on
// pull, and anything undelivered expires. The server is a relay, never the
// durable copy -- that stays the device, with the encrypted backup behind it.
const { requireAuth } = require("./_identity");
const { clean, throwPublicError, uid } = require("./_crypto");

// Long enough that a shop closed for a week still collects its messages, short
// enough that the relay does not quietly become storage.
const INBOX_TTL_SECONDS = 60 * 60 * 24 * 14;
const DEFAULT_BATCH_LIMIT = 25;
const MAX_BATCH_LIMIT = 100;
const MAX_PULL = 200;

// Which store a provider's messages belong to. Providers cannot say, and this
// phase deliberately supports one bound store (multi-store routing is excluded
// from Phase 021 scope), so it is named explicitly by configuration. When it is
// unset the webhook refuses loudly rather than guessing a store or silently
// dropping messages -- a wrong guess would leak one shop's enquiries to
// another, and a silent drop is invisible data loss.
function boundStoreId() {
  return clean(process.env.FASHION_STORE_INBOX_STORE_ID);
}

function requireBoundStore() {
  const storeId = boundStoreId();
  if (!storeId) {
    const error = new Error("No store is bound for channel intake.");
    error.statusCode = 503;
    error.publicMessage = "Channel intake is not configured.";
    throw error;
  }
  return storeId;
}

// Ported from the pre-pivot in-document dedup (api/_channel_intake.js), which
// scanned the state document to build this set. It is now a unique index, so
// the same provider retry is refused by the database rather than by whichever
// request happened to look first.
function messageFingerprint(message = {}) {
  const providerId = clean(message.providerMessageId || message.id);
  if (providerId) {
    return `${clean(message.channel).toLowerCase()}|${providerId.toLowerCase()}`;
  }
  return [
    clean(message.channel).toLowerCase(),
    clean(message.contact).toLowerCase(),
    clean(message.message).toLowerCase(),
    clean(message.receivedAt).slice(0, 10),
  ].join("|");
}

function batchLimit(value) {
  const number = Number(value || DEFAULT_BATCH_LIMIT);
  if (!Number.isFinite(number) || number < 1) return DEFAULT_BATCH_LIMIT;
  return Math.min(Math.floor(number), MAX_BATCH_LIMIT);
}

// Called by the webhook handler after signature verification.
async function acceptMessages(db, messages, options = {}) {
  const storeId = requireBoundStore();
  const store = await db.getStore(storeId);
  if (!store) {
    const error = new Error(`Bound intake store ${storeId} does not exist.`);
    error.statusCode = 503;
    error.publicMessage = "Channel intake is not configured.";
    throw error;
  }

  const limit = batchLimit(options.maxMessages);
  const list = Array.isArray(messages) ? messages : [];
  const batch = list.slice(0, limit);
  const overflow = Math.max(0, list.length - batch.length);

  const now = Date.now();
  const accepted = [];
  const duplicates = [];
  const rejected = [];

  for (const message of batch) {
    const payload = message && typeof message === "object" ? message : {};
    // Minimal viability check, mirroring the pre-pivot createInboundMessage:
    // a message with no sender and no content is not routable by anyone.
    const hasSender = Boolean(clean(payload.senderName) || clean(payload.contact));
    const hasContent = Boolean(clean(payload.message) || clean(payload.desiredStyle));
    if (!hasSender || !hasContent) {
      rejected.push({ reason: "Sender and message content are required" });
      continue;
    }

    const receivedAt = clean(payload.receivedAt) || new Date(now).toISOString();
    // Fingerprint from what the provider actually sent, before an id is
    // generated. Fingerprinting afterwards would fold that generated id into
    // the key and make every message unique, silently disabling content-based
    // dedup for exactly the providers that send no message id of their own.
    const fingerprint = messageFingerprint({ ...payload, receivedAt });
    const normalized = { ...payload, receivedAt, id: clean(payload.id) || uid("msg") };

    try {
      const inserted = await db.insertInboxMessage({
        id: uid("inbox"),
        store_id: storeId,
        fingerprint,
        payload: normalized,
        received_at: receivedAt,
        expires_at: new Date(now + INBOX_TTL_SECONDS * 1000).toISOString(),
      });
      if (inserted === false) {
        duplicates.push(fingerprint);
      } else {
        accepted.push(normalized);
      }
    } catch (error) {
      // A unique-index violation is the retry case, not a failure.
      if (error.statusCode === 409 || error.storageStatus === 409) {
        duplicates.push(fingerprint);
        continue;
      }
      throw error;
    }
  }

  return { accepted, duplicates, rejected, overflow };
}

// A signed-in device drains the inbox. Any member may pull: inbound enquiries
// are the working queue, and gating them to managers would leave staff unable
// to do the job the queue exists for.
async function pullMessages(db, request) {
  const { store } = await requireAuth(db, request);
  const rows = await db.listInboxMessages(store.id, MAX_PULL);
  return {
    status: 200,
    payload: {
      ok: true,
      messages: rows.map((row) => ({ inboxId: row.id, receivedAt: row.received_at, message: row.payload })),
    },
  };
}

// Deletion is a separate call so a device only discards what it has actually
// written to its own storage. Pull-then-delete can duplicate on a crash
// between the two, which the client's own dedup absorbs; pull-and-delete in
// one step would lose messages instead, and a lost enquiry is worse than a
// repeated one.
async function acknowledgeMessages(db, request, body) {
  const { store } = await requireAuth(db, request);
  const ids = Array.isArray(body.inboxIds) ? body.inboxIds.map(clean).filter(Boolean) : [];
  if (!ids.length) {
    throwPublicError("No messages were named for acknowledgement.", 400);
  }
  if (ids.length > MAX_PULL) {
    throwPublicError("Too many messages in one acknowledgement.", 400);
  }
  const removed = await db.deleteInboxMessages(store.id, ids);
  return { status: 200, payload: { ok: true, removed: Number(removed || ids.length) } };
}

module.exports = {
  INBOX_TTL_SECONDS,
  MAX_PULL,
  acceptMessages,
  acknowledgeMessages,
  boundStoreId,
  messageFingerprint,
  pullMessages,
};
