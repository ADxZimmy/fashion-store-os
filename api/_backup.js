// Server side of the encrypted backup (Phase 021 step 4).
//
// This module deliberately knows nothing about what it is storing. It receives
// base64 ciphertext, a salt, and an IV, and hands the same back on request.
// The key is derived on the device from an owner passphrase that never leaves
// it, so a compromise here yields opaque blobs -- which is what keeps "the
// server holds identity only" true while still giving a lost device a way back.
const { requireManager } = require("./_identity");
const { clean, throwPublicError } = require("./_crypto");

// The serverless request ceiling is ~4.5MB and api/_response.js caps bodies at
// 5MB. Base64 inflates by a third, so this bounds the encoded payload rather
// than the plaintext. The client checks the same limit before uploading so the
// operator gets a message about their data size instead of a transport error.
const MAX_CIPHERTEXT_CHARS = 4 * 1024 * 1024;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

// Manager-only in both directions. A backup is the whole store's records, so
// restoring one is equivalent to reading everything -- staff access to a
// section does not imply access to the entire dataset, and overwriting the
// store's only backup should not be within reach of a suspended-tomorrow
// account.
async function readBackup(db, request) {
  const { store } = await requireManager(db, request);
  const row = await db.getBackup(store.id);
  if (!row) {
    return { status: 404, payload: { ok: false, error: "No backup has been saved for this store yet." } };
  }
  return {
    status: 200,
    payload: {
      ok: true,
      backup: {
        ciphertext: row.ciphertext,
        salt: row.salt,
        iv: row.iv,
        format: Number(row.format || 1),
        byteSize: Number(row.byte_size || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    },
  };
}

async function writeBackup(db, request, body) {
  const { account, store } = await requireManager(db, request);
  const ciphertext = clean(body.ciphertext);
  const salt = clean(body.salt);
  const iv = clean(body.iv);
  const format = Number(body.format || 1);

  if (!ciphertext || !salt || !iv) {
    throwPublicError("A backup needs ciphertext, a salt, and an IV.", 400);
  }
  // Shape validation only. The server cannot tell a real backup from noise --
  // that is the point -- so it checks the envelope is well formed and nothing
  // more.
  for (const [label, value] of [["ciphertext", ciphertext], ["salt", salt], ["iv", iv]]) {
    if (!BASE64_PATTERN.test(value)) {
      throwPublicError(`The backup ${label} is not valid base64.`, 400);
    }
  }
  if (format !== 1) {
    throwPublicError("Unsupported backup format.", 400);
  }
  if (ciphertext.length > MAX_CIPHERTEXT_CHARS) {
    throwPublicError(
      "This backup is too large to upload. Remove some stored images and try again, or use the local export file instead.",
      413,
    );
  }

  const now = new Date().toISOString();
  await db.putBackup({
    store_id: store.id,
    ciphertext,
    salt,
    iv,
    format,
    byte_size: ciphertext.length,
    created_by: account.id,
    created_at: now,
    updated_at: now,
  });

  return { status: 201, payload: { ok: true, savedAt: now, byteSize: ciphertext.length } };
}

async function removeBackup(db, request) {
  const { store } = await requireManager(db, request);
  await db.deleteBackup(store.id);
  return { status: 200, payload: { ok: true } };
}

module.exports = { MAX_CIPHERTEXT_CHARS, readBackup, removeBackup, writeBackup };
