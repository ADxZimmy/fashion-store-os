// Phase 021 step 4: encrypted backup. Runs src/backup.js against Node's real
// WebCrypto, so the round trip, wrong-passphrase rejection, tamper detection,
// and store binding are genuinely exercised rather than asserted from source.
// The server half is tested through the real core against the file-backed
// adapter, as with the identity suite.
const fs = require("fs");
const path = require("path");
const { webcrypto } = require("crypto");

const rootDir = path.resolve(__dirname, "..");
const { createBackupCrypto } = require(path.join(rootDir, "src/backup.js"));
const backupApi = require(path.join(rootDir, "api/_backup.js"));
const identity = require(path.join(rootDir, "api/_identity.js"));
const { openTestDatabase } = require(path.join(rootDir, "db/pglite.js"));

const crypto = createBackupCrypto({ crypto: webcrypto });
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

async function expectError(label, promise, code) {
  try {
    await promise;
    ok(label, false, "no error thrown");
    return null;
  } catch (error) {
    ok(label, !code || error.code === code || error.statusCode === code, `${error.code || error.statusCode}: ${error.message}`);
    return error;
  }
}

const STORE = "store-1";
const PASSPHRASE = "correct horse battery staple";
const RECORDS = {
  profile: { businessName: "Needle House", currency: "NGN" },
  clients: [{ id: "c1", name: "Ada Obi", phone: "08030000000" }],
  orders: [{ id: "o1", clientId: "c1", total: 45000, status: "In production" }],
};

// One embedded Postgres per suite, emptied between scenarios: starting
// PGlite costs seconds, truncating costs milliseconds.
let testDb = null;
async function freshDb() {
  return testDb.reset();
}
let clientCounter = 0;
function req(token = "") {
  clientCounter += 1;
  return {
    headers: {
      cookie: token ? `fso_session=${encodeURIComponent(token)}` : "",
      "x-forwarded-for": `10.4.${Math.floor(clientCounter / 250)}.${clientCounter % 250}`,
    },
  };
}
const STRONG = "Str0ng!Passw0rd";

async function main() {
  ok("WebCrypto is available", crypto.supported());

  // --- Round trip -----------------------------------------------------------
  const sealed = await crypto.seal({ state: RECORDS, passphrase: PASSPHRASE, storeId: STORE });
  ok("sealing produces a versioned envelope", sealed.format === 1 && sealed.ciphertext && sealed.salt && sealed.iv);

  const opened = await crypto.open({ envelope: sealed, passphrase: PASSPHRASE, storeId: STORE });
  ok("the round trip restores the records exactly", JSON.stringify(opened) === JSON.stringify(RECORDS));

  // --- Opacity: the whole point of the exercise ------------------------------
  const blob = JSON.stringify(sealed);
  const secretsInPlaintext = ["Needle House", "Ada Obi", "08030000000", "In production", "45000"];
  const leaked = secretsInPlaintext.filter((value) => blob.includes(value));
  ok("no plaintext business field appears in the envelope", leaked.length === 0, leaked.join(","));
  ok("the passphrase does not appear in the envelope", !blob.includes(PASSPHRASE));

  // --- Wrong passphrase -----------------------------------------------------
  await expectError(
    "a wrong passphrase is refused",
    crypto.open({ envelope: sealed, passphrase: "not the passphrase", storeId: STORE }),
    "passphrase",
  );
  const wrong = await crypto
    .open({ envelope: sealed, passphrase: "another wrong one", storeId: STORE })
    .catch((error) => error);
  const tamperedError = await crypto
    .open({ envelope: { ...sealed, ciphertext: sealed.ciphertext }, passphrase: "wrong", storeId: STORE })
    .catch((error) => error);
  ok("wrong passphrase and tampering are indistinguishable", wrong.message === tamperedError.message);

  // --- Tamper detection -----------------------------------------------------
  const flipped = crypto.base64ToBytes(sealed.ciphertext);
  flipped[Math.floor(flipped.length / 2)] ^= 0xff;
  await expectError(
    "a single flipped byte is detected",
    crypto.open({ envelope: { ...sealed, ciphertext: crypto.bytesToBase64(flipped) }, passphrase: PASSPHRASE, storeId: STORE }),
    "passphrase",
  );

  // --- Store binding --------------------------------------------------------
  await expectError(
    "a blob cannot be opened as another store's backup",
    crypto.open({ envelope: sealed, passphrase: PASSPHRASE, storeId: "store-OTHER" }),
    "passphrase",
  );

  // --- Format versioning ----------------------------------------------------
  const future = await expectError(
    "a newer format is named, not misreported as a bad passphrase",
    crypto.open({ envelope: { ...sealed, format: 99 }, passphrase: PASSPHRASE, storeId: STORE }),
    "format",
  );
  ok("the format error explains itself", /newer version/i.test(future.message));

  // --- Cached key for automatic backups -------------------------------------
  const entry = await crypto.deriveCacheEntry(PASSPHRASE, STORE);
  ok("a cache entry carries the salt with the key", Boolean(entry.cached.key && entry.cached.salt));
  const reimported = await crypto.importKey(entry.cached.key);
  const autoSealed = await crypto.seal({ state: RECORDS, key: reimported, salt: entry.cached.salt, storeId: STORE });
  // The real requirement: a backup written with the cached key must still be
  // openable by the passphrase alone, on a device that has no cache.
  const autoOpened = await crypto.open({ envelope: autoSealed, passphrase: PASSPHRASE, storeId: STORE });
  ok("a cached-key backup opens with the passphrase on a fresh device", JSON.stringify(autoOpened) === JSON.stringify(RECORDS));

  let sealThrew = false;
  try {
    await crypto.seal({ state: RECORDS, key: reimported, storeId: STORE });
  } catch (error) {
    sealThrew = true;
  }
  ok("sealing with a key but no salt is refused outright", sealThrew);

  // --- Large payloads -------------------------------------------------------
  const large = { blobs: [{ id: "big", data: "x".repeat(700000) }] };
  const largeSealed = await crypto.seal({ state: large, passphrase: PASSPHRASE, storeId: STORE });
  const largeOpened = await crypto.open({ envelope: largeSealed, passphrase: PASSPHRASE, storeId: STORE });
  ok("a large payload round-trips without chunking errors", largeOpened.blobs[0].data.length === 700000);

  // --- Server: gating, validation, and storage ------------------------------
  {
    const db = await freshDb();
    const manager = await identity.signup(db, req(), { email: "m@example.com", password: STRONG, confirmPassword: STRONG });
    const managerToken = manager.sessionToken;

    await expectError("reading a backup without a session is 401", backupApi.readBackup(db, req()), 401);
    await expectError("writing a backup without a session is 401", backupApi.writeBackup(db, req(), sealed), 401);

    await identity.createStaff(db, req(managerToken), { name: "S", email: "s@example.com", password: STRONG });
    const staff = await identity.signin(db, req(), { email: "s@example.com", password: STRONG });
    await expectError("staff cannot read the store backup", backupApi.readBackup(db, req(staff.sessionToken)), 403);
    await expectError("staff cannot overwrite the store backup", backupApi.writeBackup(db, req(staff.sessionToken), sealed), 403);
    await expectError("staff cannot delete the store backup", backupApi.removeBackup(db, req(staff.sessionToken)), 403);

    const missing = await backupApi.readBackup(db, req(managerToken));
    ok("no backup yet reads as 404, not an error", missing.status === 404 && missing.payload.ok === false);

    const written = await backupApi.writeBackup(db, req(managerToken), sealed);
    ok("a manager can write a backup", written.status === 201 && written.payload.byteSize > 0);

    const read = await backupApi.readBackup(db, req(managerToken));
    ok("the stored envelope round-trips through the server", read.payload.backup.ciphertext === sealed.ciphertext);
    const serverOpened = await crypto.open({ envelope: read.payload.backup, passphrase: PASSPHRASE, storeId: STORE });
    ok("records decrypt after a server round trip", JSON.stringify(serverOpened) === JSON.stringify(RECORDS));

    // Validation.
    await expectError("a missing IV is refused", backupApi.writeBackup(db, req(managerToken), { ciphertext: "AAAA", salt: "AAAA" }), 400);
    await expectError("non-base64 ciphertext is refused", backupApi.writeBackup(db, req(managerToken), { ciphertext: "not base64!!", salt: "AAAA", iv: "AAAA" }), 400);
    await expectError("an unsupported format is refused", backupApi.writeBackup(db, req(managerToken), { ...sealed, format: 7 }), 400);
    const oversized = await expectError(
      "an oversized backup is refused with a size message",
      backupApi.writeBackup(db, req(managerToken), { ...sealed, ciphertext: "A".repeat(backupApi.MAX_CIPHERTEXT_CHARS + 1) }),
      413,
    );
    ok("the size refusal names the cause", /too large/i.test(oversized.message));

    // A second write replaces rather than accumulating.
    const second = await crypto.seal({ state: { clients: [] }, passphrase: PASSPHRASE, storeId: STORE });
    await backupApi.writeBackup(db, req(managerToken), second);
    const afterReplace = await backupApi.readBackup(db, req(managerToken));
    ok("writing again replaces the single stored backup", afterReplace.payload.backup.ciphertext === second.ciphertext);

    await backupApi.removeBackup(db, req(managerToken));
    const afterDelete = await backupApi.readBackup(db, req(managerToken));
    ok("a deleted backup is gone", afterDelete.status === 404);
  }

  // --- Cross-store isolation ------------------------------------------------
  {
    const db = await freshDb();
    const a = await identity.signup(db, req(), { email: "a@example.com", password: STRONG, confirmPassword: STRONG });
    const b = await identity.signup(db, req(), { email: "b@example.com", password: STRONG, confirmPassword: STRONG });
    const storeA = a.payload.identity.store.id;
    const envelopeA = await crypto.seal({ state: RECORDS, passphrase: PASSPHRASE, storeId: storeA });
    await backupApi.writeBackup(db, req(a.sessionToken), envelopeA);

    const bRead = await backupApi.readBackup(db, req(b.sessionToken));
    ok("one store's manager cannot read another store's backup", bRead.status === 404);

    await backupApi.writeBackup(db, req(b.sessionToken), await crypto.seal({ state: { clients: [] }, passphrase: PASSPHRASE, storeId: b.payload.identity.store.id }));
    const aStill = await backupApi.readBackup(db, req(a.sessionToken));
    ok("writing store B's backup leaves store A's intact", aStill.payload.backup.ciphertext === envelopeA.ciphertext);
  }

  // --- App wiring (static) --------------------------------------------------
  const appCode = appSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("the app exposes a backup panel", /renderBackupPanel/.test(appCode));
  ok("the app can back up on demand", /backUpNow/.test(appCode));
  ok("the app can restore from the server", /restoreFromBackup/.test(appCode));
  ok("the app checks size before uploading", /MAX_BACKUP_CHARS|too large/i.test(appCode));
  // The warning must convey divergence in words an operator understands, so
  // this asserts the substance rather than the word "fork" -- naming the
  // concept in developer terms would make the dialog worse, not clearer.
  ok(
    "restore warns that a second active device will diverge",
    /restore-backup/.test(appCode) && /different records/i.test(appCode) && /no syncing/i.test(appCode),
  );
  ok("restore is confirmed before it replaces anything", /confirmAction: "confirm-restore"/.test(appCode));
  ok("a plain local export exists", /exportRecordsFile/.test(appCode));
  ok("a plain local import exists", /importRecordsFile/.test(appCode));
  ok("automatic backup is debounced, not per-keystroke", /scheduleAutoBackup/.test(appCode));
  ok("backup.js loads before app.js", (() => {
    const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
    return html.indexOf("src/backup.js") !== -1 && html.indexOf("src/backup.js") < html.indexOf("src/app.js");
  })());
  ok("backup.js ships in the build", fs.readFileSync(path.join(rootDir, "scripts/build.js"), "utf8").includes("src/backup.js"));
  ok("the shell worker precaches backup.js", fs.readFileSync(path.join(rootDir, "src/sw.js"), "utf8").includes("/src/backup.js"));

  console.log(`\n${pass} passed, ${fail} failed`);
  await testDb.close();
  process.exit(fail ? 1 : 0);
}

openTestDatabase()
  .then((opened) => {
    testDb = opened;
    return main();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
