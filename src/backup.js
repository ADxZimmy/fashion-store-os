// Client-side backup encryption (Phase 021 step 4).
//
// The device is the only holder of the shop's plaintext records, so a lost or
// wiped device loses the business unless something durable exists elsewhere.
// That something is an opaque blob: AES-GCM over the serialized records, under
// a key derived from an owner passphrase with PBKDF2. The passphrase never
// leaves the device and is not recoverable from anything on the server, so a
// breach of Supabase yields ciphertext and a salt.
//
// WebCrypto only -- the project constrains new dependencies, and this needs no
// library. Written as an injectable factory so the round trip, wrong-passphrase
// rejection, and tamper detection are tested against real crypto in Node
// rather than asserted from the source text.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.FsoBackupFactory = api;
    const webcrypto = root.crypto;
    if (webcrypto && webcrypto.subtle) {
      root.FsoBackup = api.createBackupCrypto({ crypto: webcrypto });
    }
  }
})(typeof self !== "undefined" ? self : null, function () {
  const FORMAT = 1;
  // OWASP's PBKDF2-HMAC-SHA256 guidance. Higher than the server's password
  // hashing because this runs once per backup, not once per request, so the
  // cost lands on an action the operator initiated.
  const PBKDF2_ITERATIONS = 210000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;

  function createBackupCrypto({ crypto } = {}) {
    const subtle = crypto && crypto.subtle;

    function supported() {
      return Boolean(subtle);
    }

    function randomBytes(length) {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return bytes;
    }

    // Chunked so a multi-megabyte payload cannot blow the argument limit of
    // String.fromCharCode, which is how the naive one-liner fails -- only on
    // large stores, i.e. exactly the ones that need a backup most.
    function bytesToBase64(bytes) {
      let binary = "";
      const chunk = 0x8000;
      for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
      }
      return typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
    }

    function base64ToBytes(value) {
      const binary = typeof atob === "function" ? atob(value) : Buffer.from(value, "base64").toString("binary");
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }

    async function deriveKey(passphrase, saltBytes) {
      const material = await subtle.importKey("raw", new TextEncoder().encode(String(passphrase)), "PBKDF2", false, [
        "deriveKey",
      ]);
      return subtle.deriveKey(
        { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        material,
        { name: "AES-GCM", length: 256 },
        // Extractable so the derived key can be cached for automatic backups
        // without holding the passphrase. Recorded as an accepted trade-off:
        // anyone with device access can already read the plaintext records.
        true,
        ["encrypt", "decrypt"],
      );
    }

    async function exportKey(key) {
      return bytesToBase64(new Uint8Array(await subtle.exportKey("raw", key)));
    }

    async function importKey(base64) {
      return subtle.importKey("raw", base64ToBytes(base64), { name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
      ]);
    }

    // The store id is bound as additional authenticated data, so a blob lifted
    // from one store cannot be decrypted as another store's backup even with
    // the right passphrase.
    function aad(storeId) {
      return new TextEncoder().encode(`fso-backup:${String(storeId || "")}`);
    }

    // A key is only meaningful alongside the salt it was derived from: restore
    // re-derives from the envelope's salt, so sealing with a cached key must
    // record that key's original salt, not a fresh one. Getting this wrong
    // produces backups that no passphrase can open, so it is enforced rather
    // than documented.
    async function seal({ state, passphrase, key, salt, storeId }) {
      if (key && !salt) {
        throw new Error("Sealing with a cached key requires the salt it was derived from.");
      }
      const saltBytes = key ? base64ToBytes(salt) : randomBytes(SALT_BYTES);
      const ivBytes = randomBytes(IV_BYTES);
      const cryptoKey = key || (await deriveKey(passphrase, saltBytes));
      const plaintext = new TextEncoder().encode(JSON.stringify(state));
      const cipher = await subtle.encrypt(
        { name: "AES-GCM", iv: ivBytes, additionalData: aad(storeId) },
        cryptoKey,
        plaintext,
      );
      return {
        format: FORMAT,
        ciphertext: bytesToBase64(new Uint8Array(cipher)),
        salt: bytesToBase64(saltBytes),
        iv: bytesToBase64(ivBytes),
      };
    }

    async function open({ envelope, passphrase, key, storeId }) {
      if (Number(envelope.format || 1) !== FORMAT) {
        // Named explicitly so a format change never presents as "wrong
        // passphrase", which would send the operator chasing the wrong problem.
        const error = new Error("This backup was written by a newer version of the app.");
        error.code = "format";
        throw error;
      }
      const saltBytes = base64ToBytes(envelope.salt);
      const ivBytes = base64ToBytes(envelope.iv);
      const cryptoKey = key || (await deriveKey(passphrase, saltBytes));
      try {
        const plaintext = await subtle.decrypt(
          { name: "AES-GCM", iv: ivBytes, additionalData: aad(storeId) },
          cryptoKey,
          base64ToBytes(envelope.ciphertext),
        );
        return JSON.parse(new TextDecoder().decode(plaintext));
      } catch (error) {
        // AES-GCM authenticates, so a wrong passphrase and a tampered blob are
        // the same failure here: the tag does not verify. Deliberately one
        // message -- distinguishing them would tell an attacker whether their
        // guess was closer.
        const failure = new Error("That passphrase does not open this backup.");
        failure.code = "passphrase";
        throw failure;
      }
    }

    // A key cached for automatic backups carries its salt: the salt is what
    // ties the key to the envelopes it can open, and to the passphrase that
    // can re-derive it on another device.
    async function deriveCacheEntry(passphrase, storeId) {
      const saltBytes = randomBytes(SALT_BYTES);
      const salt = bytesToBase64(saltBytes);
      const key = await deriveKey(passphrase, saltBytes);
      return {
        key,
        salt,
        cached: { key: await exportKey(key), salt, storeId: String(storeId || "") },
      };
    }

    return {
      FORMAT,
      PBKDF2_ITERATIONS,
      supported,
      deriveKey,
      deriveCacheEntry,
      exportKey,
      importKey,
      seal,
      open,
      bytesToBase64,
      base64ToBytes,
    };
  }

  return { createBackupCrypto, FORMAT, PBKDF2_ITERATIONS };
});
