// Device storage for Fashion Store OS business records (Phase 021 step 3).
//
// Before the pivot this was one localStorage string and the server held the
// durable copy. Now the device IS the durable copy, so this layer has to earn
// that: IndexedDB instead of the ~5MB localStorage quota, persistent-storage
// permission so the browser stops treating the shop's records as evictable
// cache, a last-known-good snapshot so a bad write cannot take the dataset
// with it, and failures that reach the operator instead of vanishing.
//
// Written as an injectable factory rather than against globals so the decision
// logic -- migration, coalescing, backup rotation, recovery -- is testable
// without a browser. The browser wires the real drivers at the bottom.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.FsoStorageFactory = api;
    // Real drivers, when running in a browser.
    if (root.indexedDB) {
      root.FsoStorage = api.createStorage({
        indexedDB: root.indexedDB,
        localStorage: root.localStorage,
        storageManager: root.navigator && root.navigator.storage,
      });
    }
  }
})(typeof self !== "undefined" ? self : null, function () {
  const DB_NAME = "fashion-studio-os";
  const DB_VERSION = 1;
  const STORE_NAME = "records";
  const CURRENT_KEY = "state:current";
  const BACKUP_KEY = "state:last-known-good";
  // The pre-pivot localStorage key. Read once, migrated, then removed.
  const LEGACY_STATE_KEY = "fashion-studio-os-state-v1";
  // How long before a successful write is also promoted to the backup slot.
  // Short enough that the recovery point is never far behind, long enough that
  // routine edits are one write, not two.
  const BACKUP_INTERVAL_MS = 1000 * 60 * 10;

  function createStorage({ indexedDB, localStorage, storageManager } = {}) {
    let dbPromise = null;
    let backupWrittenAt = 0;
    let writing = null;
    let pending = null;
    let onError = null;

    function openDb() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        let request;
        try {
          request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (error) {
          reject(error);
          return;
        }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not open device storage"));
        request.onblocked = () => reject(new Error("Device storage is blocked by another tab"));
      }).catch((error) => {
        // Reset so a later attempt can retry rather than being stuck on a
        // rejected promise for the life of the page.
        dbPromise = null;
        throw error;
      });
      return dbPromise;
    }

    function readRecord(key) {
      return openDb().then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const request = tx.objectStore(STORE_NAME).get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error("Read failed"));
          }),
      );
    }

    function writeRecord(key, record) {
      return openDb().then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).put(record, key);
            tx.oncomplete = () => resolve();
            // A quota failure aborts the whole transaction, which is why the
            // existing record survives it -- the reason this is IndexedDB and
            // not a second localStorage key.
            tx.onerror = () => reject(tx.error || new Error("Write failed"));
            tx.onabort = () => reject(tx.error || new Error("Write aborted"));
          }),
      );
    }

    function deleteRecord(key) {
      return openDb().then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("Delete failed"));
          }),
      );
    }

    function parseRecord(record) {
      if (!record || typeof record.json !== "string") return null;
      try {
        return JSON.parse(record.json);
      } catch (error) {
        return null;
      }
    }

    function readLegacy() {
      if (!localStorage) return null;
      try {
        const raw = localStorage.getItem(LEGACY_STATE_KEY);
        if (!raw) return null;
        return { raw, value: JSON.parse(raw) };
      } catch (error) {
        return null;
      }
    }

    function clearLegacy() {
      if (!localStorage) return;
      try {
        localStorage.removeItem(LEGACY_STATE_KEY);
      } catch (error) {
        // nothing to clear
      }
    }

    // Resolves what to open the app with, in strict order of preference:
    // the current record, the last-known-good copy, the pre-pivot
    // localStorage blob, then nothing.
    async function load() {
      let source = "empty";
      let value = null;
      let warning = "";

      const current = await readRecord(CURRENT_KEY);
      value = parseRecord(current);
      if (value) {
        source = "device";
      } else {
        if (current) {
          // A record exists but will not parse. This is the case the backup
          // slot exists for.
          warning = "unreadable-current";
        }
        const backup = await readRecord(BACKUP_KEY);
        const recovered = parseRecord(backup);
        if (recovered) {
          value = recovered;
          source = "recovered";
        }
      }

      if (!value) {
        const legacy = readLegacy();
        if (legacy) {
          // Migrate, verify, and only then drop the old key -- a failed
          // migration must not lose the records it was moving.
          await writeRecord(CURRENT_KEY, { json: legacy.raw, savedAt: Date.now(), version: 1 });
          const verify = parseRecord(await readRecord(CURRENT_KEY));
          if (verify) {
            clearLegacy();
            value = verify;
            source = "migrated";
          } else {
            value = legacy.value;
            source = "legacy";
            warning = "migration-unverified";
          }
        }
      }

      // Seed the recovery point with whatever successfully loaded, so a bad
      // write later in this session has something known-good behind it.
      if (value && source !== "recovered") {
        try {
          await writeRecord(BACKUP_KEY, { json: JSON.stringify(value), savedAt: Date.now(), version: 1 });
          backupWrittenAt = Date.now();
        } catch (error) {
          // Not fatal: the app still opens, it just has no recovery point yet.
          console.warn("Could not write the recovery snapshot.", error);
        }
      } else if (source === "recovered") {
        backupWrittenAt = Date.now();
      }

      return { value, source, warning };
    }

    // Serializes immediately so the snapshot is the caller's point in time,
    // then writes. Concurrent calls coalesce to the newest snapshot: the
    // records are one document, so an older pending write has no value.
    function save(state) {
      let json;
      try {
        json = JSON.stringify(state);
      } catch (error) {
        report(error, "serialize");
        return Promise.reject(error);
      }

      if (writing) {
        pending = json;
        return writing;
      }

      writing = runWrite(json);
      return writing;
    }

    async function runWrite(json) {
      let payload = json;
      try {
        while (payload) {
          await writeRecord(CURRENT_KEY, { json: payload, savedAt: Date.now(), version: 1 });
          if (Date.now() - backupWrittenAt > BACKUP_INTERVAL_MS) {
            // The value just written round-tripped, so it is known-good and
            // safe to promote as the recovery point.
            try {
              await writeRecord(BACKUP_KEY, { json: payload, savedAt: Date.now(), version: 1 });
              backupWrittenAt = Date.now();
            } catch (error) {
              console.warn("Could not refresh the recovery snapshot.", error);
            }
          }
          payload = pending;
          pending = null;
        }
        return { ok: true };
      } catch (error) {
        pending = null;
        report(error, "write");
        return { ok: false, error };
      } finally {
        writing = null;
      }
    }

    function report(error, phase) {
      const quota =
        error &&
        (error.name === "QuotaExceededError" ||
          error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
          /quota/i.test(error.message || ""));
      if (typeof onError === "function") {
        onError({ error, phase, quota: Boolean(quota) });
      }
    }

    // Kick any queued write immediately. Called when the page is being hidden
    // or closed: writes are already issued eagerly, so this only matters for a
    // snapshot that arrived while another write was in flight.
    function flush() {
      return writing || Promise.resolve({ ok: true });
    }

    async function erase() {
      clearLegacy();
      await deleteRecord(CURRENT_KEY);
      await deleteRecord(BACKUP_KEY);
      backupWrittenAt = 0;
    }

    // Without this the browser treats the shop's only copy of its records as
    // evictable cache, discardable under storage pressure.
    async function requestPersistence() {
      if (!storageManager || typeof storageManager.persist !== "function") {
        return { supported: false, persisted: false };
      }
      try {
        const already = typeof storageManager.persisted === "function" ? await storageManager.persisted() : false;
        if (already) return { supported: true, persisted: true };
        const granted = await storageManager.persist();
        return { supported: true, persisted: Boolean(granted) };
      } catch (error) {
        return { supported: true, persisted: false, error };
      }
    }

    async function describe() {
      const info = { supported: Boolean(storageManager), persisted: false, usage: 0, quota: 0 };
      if (!storageManager) return info;
      try {
        if (typeof storageManager.persisted === "function") info.persisted = await storageManager.persisted();
        if (typeof storageManager.estimate === "function") {
          const estimate = await storageManager.estimate();
          info.usage = Number(estimate.usage || 0);
          info.quota = Number(estimate.quota || 0);
        }
      } catch (error) {
        // Reporting only; leave the zeros.
      }
      return info;
    }

    return {
      load,
      save,
      flush,
      erase,
      requestPersistence,
      describe,
      onFailure(handler) {
        onError = handler;
      },
      keys: { DB_NAME, STORE_NAME, CURRENT_KEY, BACKUP_KEY, LEGACY_STATE_KEY },
    };
  }

  return { createStorage, BACKUP_INTERVAL_MS };
});
