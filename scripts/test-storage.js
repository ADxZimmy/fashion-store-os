// Phase 021 step 3: device storage. Exercises the real src/storage.js logic
// against an in-memory IndexedDB stand-in, so migration, recovery, coalescing,
// and quota handling are tested rather than assumed. The device holds the only
// copy of the shop's records now; these are the assertions standing between a
// storage bug and someone's business.
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const { createStorage } = require(path.join(rootDir, "src/storage.js"));
const appSource = fs.readFileSync(path.join(rootDir, "src/app.js"), "utf8");

let pass = 0;
let fail = 0;

function ok(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`PASS ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

// --- Minimal IndexedDB stand-in -------------------------------------------
// Models only what src/storage.js uses: open with an upgrade hook, and
// readonly/readwrite transactions over one object store. Faults are injectable
// so quota and abort paths are reachable, which a real browser will not do on
// demand.
function createFakeIndexedDB({ failWrites = 0, failOpen = false } = {}) {
  const data = new Map();
  let remainingWriteFailures = failWrites;

  function makeRequest(run) {
    const request = {};
    process.nextTick(() => {
      try {
        request.result = run();
        if (request.onsuccess) request.onsuccess();
      } catch (error) {
        request.error = error;
        if (request.onerror) request.onerror();
      }
    });
    return request;
  }

  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => {},
    transaction(_name, mode) {
      const tx = { error: null };
      const ops = [];
      tx.objectStore = () => ({
        get: (key) => makeRequest(() => (data.has(key) ? data.get(key) : undefined)),
        put: (value, key) => {
          ops.push(() => {
            if (mode === "readwrite" && remainingWriteFailures > 0) {
              remainingWriteFailures -= 1;
              const error = new Error("The quota has been exceeded.");
              error.name = "QuotaExceededError";
              throw error;
            }
            data.set(key, value);
          });
          return makeRequest(() => undefined);
        },
        delete: (key) => {
          ops.push(() => data.delete(key));
          return makeRequest(() => undefined);
        },
      });
      process.nextTick(() => {
        try {
          for (const op of ops) op();
          if (tx.oncomplete) tx.oncomplete();
        } catch (error) {
          tx.error = error;
          if (tx.onabort) tx.onabort();
          else if (tx.onerror) tx.onerror();
        }
      });
      return tx;
    },
  };

  return {
    open() {
      const request = {};
      process.nextTick(() => {
        if (failOpen) {
          request.error = new Error("Storage unavailable");
          if (request.onerror) request.onerror();
          return;
        }
        request.result = db;
        if (request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    },
    _data: data,
    _setWriteFailures(n) {
      remainingWriteFailures = n;
    },
  };
}

function createFakeLocalStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _map: map,
  };
}

const STORAGE_MANAGER = {
  persist: async () => true,
  persisted: async () => false,
  estimate: async () => ({ usage: 1234, quota: 5000000 }),
};

async function main() {
  // --- Empty device ---------------------------------------------------------
  {
    const idb = createFakeIndexedDB();
    const store = createStorage({ indexedDB: idb, localStorage: createFakeLocalStorage(), storageManager: STORAGE_MANAGER });
    const result = await store.load();
    ok("a fresh device loads nothing and says so", result.value === null && result.source === "empty");
  }

  // --- Save and reload ------------------------------------------------------
  {
    const idb = createFakeIndexedDB();
    const store = createStorage({ indexedDB: idb, localStorage: createFakeLocalStorage(), storageManager: STORAGE_MANAGER });
    await store.load();
    await store.save({ clients: [{ id: "c1", name: "Ada" }] });

    const reopened = createStorage({ indexedDB: idb, localStorage: createFakeLocalStorage(), storageManager: STORAGE_MANAGER });
    const result = await reopened.load();
    ok("saved records survive a reopen", result.value?.clients?.[0]?.name === "Ada" && result.source === "device");
  }

  // --- Migration from the pre-pivot localStorage blob ------------------------
  {
    const idb = createFakeIndexedDB();
    const legacy = createFakeLocalStorage({
      "fashion-studio-os-state-v1": JSON.stringify({ clients: [{ id: "c9", name: "Legacy" }] }),
    });
    const store = createStorage({ indexedDB: idb, localStorage: legacy, storageManager: STORAGE_MANAGER });
    const result = await store.load();
    ok("the pre-pivot localStorage blob is migrated", result.source === "migrated" && result.value.clients[0].name === "Legacy");
    ok("the old key is cleared only after the migration verifies", legacy.getItem("fashion-studio-os-state-v1") === null);

    const reopened = createStorage({ indexedDB: idb, localStorage: legacy, storageManager: STORAGE_MANAGER });
    const second = await reopened.load();
    ok("migration is not repeated on the next open", second.source === "device" && second.value.clients[0].name === "Legacy");
  }

  {
    // A migration that cannot be verified must keep the old copy.
    const idb = createFakeIndexedDB({ failWrites: 1 });
    const legacy = createFakeLocalStorage({
      "fashion-studio-os-state-v1": JSON.stringify({ clients: [{ id: "c9" }] }),
    });
    const store = createStorage({ indexedDB: idb, localStorage: legacy, storageManager: STORAGE_MANAGER });
    let threw = false;
    try {
      await store.load();
    } catch (error) {
      threw = true;
    }
    ok(
      "a failed migration never drops the old copy",
      legacy.getItem("fashion-studio-os-state-v1") !== null,
      threw ? "load threw" : "load returned",
    );
  }

  // --- Recovery from the last-known-good snapshot ----------------------------
  {
    const idb = createFakeIndexedDB();
    const store = createStorage({ indexedDB: idb, localStorage: createFakeLocalStorage(), storageManager: STORAGE_MANAGER });
    await store.load();
    await store.save({ clients: [{ id: "c1", name: "Good" }] });

    // Corrupt the live record, exactly as a bad write or a truncated value
    // would leave it. The backup slot is what this case exists for.
    idb._data.set("state:current", { json: "{not valid json", savedAt: Date.now(), version: 1 });

    const reopened = createStorage({ indexedDB: idb, localStorage: createFakeLocalStorage(), storageManager: STORAGE_MANAGER });
    const result = await reopened.load();
    ok("a corrupt record falls back to the recovery snapshot", result.source === "recovered" && result.value.clients[0].name === "Good");
    ok("the corrupt-record case is flagged for the caller", result.warning === "unreadable-current");
  }

  {
    // Recovery must not immediately overwrite the snapshot it just used.
    const idb = createFakeIndexedDB();
    const store = createStorage({ indexedDB: idb, localStorage: createFakeLocalStorage(), storageManager: STORAGE_MANAGER });
    await store.load();
    await store.save({ clients: [{ id: "keep", name: "Snapshot" }] });
    const snapshotBefore = idb._data.get("state:last-known-good").json;
    idb._data.set("state:current", { json: "broken", savedAt: Date.now(), version: 1 });
    const reopened = createStorage({ indexedDB: idb, localStorage: createFakeLocalStorage(), storageManager: STORAGE_MANAGER });
    await reopened.load();
    ok("recovering does not clobber the snapshot it recovered from", idb._data.get("state:last-known-good").json === snapshotBefore);
  }

  // --- Quota failure --------------------------------------------------------
  {
    const idb = createFakeIndexedDB();
    const store = createStorage({ indexedDB: idb, localStorage: createFakeLocalStorage(), storageManager: STORAGE_MANAGER });
    await store.load();
    await store.save({ clients: [{ id: "c1", name: "Before" }] });

    const failures = [];
    store.onFailure((info) => failures.push(info));
    idb._setWriteFailures(1);
    const result = await store.save({ clients: [{ id: "c2", name: "After" }] });

    ok("a quota failure is reported, not swallowed", failures.length === 1 && failures[0].quota === true);
    ok("save resolves with the failure rather than throwing", result.ok === false);
    const surviving = JSON.parse(idb._data.get("state:current").json);
    ok("the previous record survives a failed write", surviving.clients[0].name === "Before");

    // And the store keeps working once space is available.
    const after = await store.save({ clients: [{ id: "c3", name: "Recovered" }] });
    ok("writes resume after a failure clears", after.ok === true);
    ok("the recovered write landed", JSON.parse(idb._data.get("state:current").json).clients[0].name === "Recovered");
  }

  // --- Coalescing -----------------------------------------------------------
  {
    const idb = createFakeIndexedDB();
    const store = createStorage({ indexedDB: idb, localStorage: createFakeLocalStorage(), storageManager: STORAGE_MANAGER });
    await store.load();
    // Fire several saves without awaiting: the records are one document, so
    // the newest snapshot must win and no earlier one may land after it.
    store.save({ v: 1 });
    store.save({ v: 2 });
    const last = store.save({ v: 3 });
    await last;
    await store.flush();
    ok("concurrent saves coalesce to the newest snapshot", JSON.parse(idb._data.get("state:current").json).v === 3);
  }

  // --- Erase ----------------------------------------------------------------
  {
    const idb = createFakeIndexedDB();
    const legacy = createFakeLocalStorage({ "fashion-studio-os-state-v1": "{}" });
    const store = createStorage({ indexedDB: idb, localStorage: legacy, storageManager: STORAGE_MANAGER });
    await store.load();
    await store.save({ clients: [{ id: "c1" }] });
    await store.erase();
    ok("erase clears the live record", !idb._data.has("state:current"));
    ok("erase clears the recovery snapshot too", !idb._data.has("state:last-known-good"));
    ok("erase clears any legacy key", legacy.getItem("fashion-studio-os-state-v1") === null);
  }

  // --- Persistence and reporting -------------------------------------------
  {
    const idb = createFakeIndexedDB();
    const store = createStorage({ indexedDB: idb, localStorage: createFakeLocalStorage(), storageManager: STORAGE_MANAGER });
    const persistence = await store.requestPersistence();
    ok("persistent storage is requested", persistence.supported === true && persistence.persisted === true);

    const info = await store.describe();
    ok("usage is reported for the UI", info.usage === 1234 && info.quota === 5000000);

    const noManager = createStorage({ indexedDB: idb, localStorage: createFakeLocalStorage() });
    const none = await noManager.requestPersistence();
    ok("a browser without the storage manager degrades quietly", none.supported === false && none.persisted === false);
  }

  // --- Unopenable storage ---------------------------------------------------
  {
    const idb = createFakeIndexedDB({ failOpen: true });
    const store = createStorage({ indexedDB: idb, localStorage: createFakeLocalStorage(), storageManager: STORAGE_MANAGER });
    let threw = false;
    try {
      await store.load();
    } catch (error) {
      threw = true;
    }
    ok("an unopenable database surfaces as an error the app can handle", threw);
  }

  // --- App wiring (static) --------------------------------------------------
  const appCode = appSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("the app no longer writes records to localStorage", !/localStorage\.setItem\(STORAGE_KEY/.test(appCode));
  ok("the app no longer reads records from localStorage", !/localStorage\.getItem\(STORAGE_KEY/.test(appCode));
  ok("the app persists through the device store", /deviceStorage\.save\(state\)/.test(appCode));
  ok("the app requests persistent storage at boot", /requestPersistence\(\)/.test(appCode));
  ok("the app registers a storage failure handler", /deviceStorage\.onFailure\(/.test(appCode));
  ok("pending writes are flushed when the page hides", /visibilitychange[\s\S]{0,200}flush\(\)/.test(appCode));
  ok("erase clears the device store", /eraseLocalBusinessData[\s\S]{0,200}deviceStorage\.erase\(\)/.test(appCode));
  ok("a storage-unavailable browser is told plainly", /storageUnavailable/.test(appCode));
  ok("logo uploads are downscaled before storage", /logoToDataUrl/.test(appCode) && /LOGO_MAX_DIMENSION/.test(appCode));
  ok("the logo path is the one used by the profile form", /await logoToDataUrl\(logoFile\)/.test(appCode));
  ok("storage state is surfaced in settings", /renderDeviceStoragePanel/.test(appCode));
  ok("storage.js loads before app.js", fs.readFileSync(path.join(rootDir, "index.html"), "utf8").indexOf("src/storage.js") < fs.readFileSync(path.join(rootDir, "index.html"), "utf8").indexOf("src/app.js"));
  ok("storage.js ships in the build", fs.readFileSync(path.join(rootDir, "scripts/build.js"), "utf8").includes("src/storage.js"));
  ok("the shell worker precaches storage.js", fs.readFileSync(path.join(rootDir, "src/sw.js"), "utf8").includes("/src/storage.js"));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
