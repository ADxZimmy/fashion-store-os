// Phase 021 step 5: transit inbox. Exercises the real core against the
// file-backed adapter, plus static checks on the client's pull-then-acknowledge
// ordering -- the property that decides whether a provider message can be lost.
const fs = require("fs");
const os = require("os");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const inbox = require(path.join(rootDir, "api/_inbox.js"));
const identity = require(path.join(rootDir, "api/_identity.js"));
const { openTestDatabase } = require(path.join(rootDir, "db/pglite.js"));
const appSource = fs.readFileSync(path.join(rootDir, "src/app.js"), "utf8");
const serverSource = fs.readFileSync(path.join(rootDir, "server.js"), "utf8");

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

async function expectError(label, promise, statusCode) {
  try {
    await promise;
    ok(label, false, "no error thrown");
    return null;
  } catch (error) {
    ok(label, error.statusCode === statusCode, `status ${error.statusCode}: ${error.message}`);
    return error;
  }
}

// One embedded Postgres per suite, emptied between scenarios: starting
// PGlite costs seconds, truncating costs milliseconds.
let testDb = null;
async function freshDb() {
  return testDb.reset();
}
let counter = 0;
function req(token = "") {
  counter += 1;
  return {
    headers: {
      cookie: token ? `fso_session=${encodeURIComponent(token)}` : "",
      "x-forwarded-for": `10.7.${Math.floor(counter / 250)}.${counter % 250}`,
    },
  };
}
const STRONG = "Str0ng!Passw0rd";

function message(overrides = {}) {
  return {
    channel: "WhatsApp",
    senderName: "Ada Obi",
    contact: "08030000000",
    message: "Do you make kaftans?",
    providerMessageId: "wamid.1",
    ...overrides,
  };
}

async function main() {
  const originalEnv = process.env.FASHION_STORE_INBOX_STORE_ID;

  // --- No bound store: refuse loudly rather than guess or drop --------------
  {
    const db = await freshDb();
    delete process.env.FASHION_STORE_INBOX_STORE_ID;
    const error = await expectError("an unbound store refuses intake with 503", inbox.acceptMessages(db, [message()]), 503);
    ok("the refusal does not leak configuration detail", error.publicMessage === "Channel intake is not configured.");
    ok("boundStoreId reports nothing configured", inbox.boundStoreId() === "");
  }

  // --- Bound to a store that does not exist ---------------------------------
  {
    const db = await freshDb();
    process.env.FASHION_STORE_INBOX_STORE_ID = "store-does-not-exist";
    await expectError("a bound store that does not exist refuses intake", inbox.acceptMessages(db, [message()]), 503);
  }

  // --- Accept, pull, acknowledge -------------------------------------------
  {
    const db = await freshDb();
    const manager = await identity.signup(db, req(), { email: "m@example.com", password: STRONG, confirmPassword: STRONG });
    const storeId = manager.payload.identity.store.id;
    process.env.FASHION_STORE_INBOX_STORE_ID = storeId;

    const accepted = await inbox.acceptMessages(db, [message()]);
    ok("a signed webhook message is accepted", accepted.accepted.length === 1 && accepted.duplicates.length === 0);

    const pulled = await inbox.pullMessages(db, req(manager.sessionToken));
    ok("a signed-in device pulls the message", pulled.payload.messages.length === 1);
    ok("the pulled message carries its inbox id for acknowledgement", Boolean(pulled.payload.messages[0].inboxId));
    ok("the payload survives the relay intact", pulled.payload.messages[0].message.message === "Do you make kaftans?");

    // Pulling again before acknowledgement must return it again: that is what
    // makes a crash between storing and acknowledging safe.
    const pulledAgain = await inbox.pullMessages(db, req(manager.sessionToken));
    ok("an unacknowledged message is still available on the next pull", pulledAgain.payload.messages.length === 1);

    await inbox.acknowledgeMessages(db, req(manager.sessionToken), {
      inboxIds: [pulled.payload.messages[0].inboxId],
    });
    const afterAck = await inbox.pullMessages(db, req(manager.sessionToken));
    ok("acknowledgement removes the message from the server", afterAck.payload.messages.length === 0);
  }

  // --- Provider retries -----------------------------------------------------
  {
    const db = await freshDb();
    const manager = await identity.signup(db, req(), { email: "m@example.com", password: STRONG, confirmPassword: STRONG });
    process.env.FASHION_STORE_INBOX_STORE_ID = manager.payload.identity.store.id;

    await inbox.acceptMessages(db, [message()]);
    const retry = await inbox.acceptMessages(db, [message()]);
    ok("a provider retry is a duplicate, not a second message", retry.accepted.length === 0 && retry.duplicates.length === 1);

    const pulled = await inbox.pullMessages(db, req(manager.sessionToken));
    ok("only one copy is queued after a retry", pulled.payload.messages.length === 1);

    // Same content with no provider id falls back to the content fingerprint.
    const noId = message({ providerMessageId: "", id: "" });
    await inbox.acceptMessages(db, [noId]);
    const retryNoId = await inbox.acceptMessages(db, [noId]);
    ok("messages without a provider id dedup on content", retryNoId.duplicates.length === 1);
  }

  // --- Validation and batching ---------------------------------------------
  {
    const db = await freshDb();
    const manager = await identity.signup(db, req(), { email: "m@example.com", password: STRONG, confirmPassword: STRONG });
    process.env.FASHION_STORE_INBOX_STORE_ID = manager.payload.identity.store.id;

    const noSender = await inbox.acceptMessages(db, [message({ senderName: "", contact: "" })]);
    ok("a message with no sender is rejected", noSender.rejected.length === 1 && noSender.accepted.length === 0);

    const noContent = await inbox.acceptMessages(db, [message({ message: "", desiredStyle: "", providerMessageId: "x1" })]);
    ok("a message with no content is rejected", noContent.rejected.length === 1);

    const batch = Array.from({ length: 30 }, (_, index) => message({ providerMessageId: `batch-${index}` }));
    const limited = await inbox.acceptMessages(db, batch, { maxMessages: 10 });
    ok("a batch is capped", limited.accepted.length === 10 && limited.overflow === 20);
  }

  // --- Access -------------------------------------------------------------
  {
    const db = await freshDb();
    const manager = await identity.signup(db, req(), { email: "m@example.com", password: STRONG, confirmPassword: STRONG });
    process.env.FASHION_STORE_INBOX_STORE_ID = manager.payload.identity.store.id;
    await inbox.acceptMessages(db, [message()]);

    await expectError("pulling without a session is 401", inbox.pullMessages(db, req()), 401);
    await expectError("acknowledging without a session is 401", inbox.acknowledgeMessages(db, req(), { inboxIds: ["x"] }), 401);

    // Staff must be able to work the queue: gating inbound enquiries to
    // managers would leave staff unable to do the job the queue exists for.
    await identity.createStaff(db, req(manager.sessionToken), { name: "S", email: "s@example.com", password: STRONG });
    const staff = await identity.signin(db, req(), { email: "s@example.com", password: STRONG });
    const staffPull = await inbox.pullMessages(db, req(staff.sessionToken));
    ok("staff can pull the store's messages", staffPull.payload.messages.length === 1);

    await expectError("an empty acknowledgement is refused", inbox.acknowledgeMessages(db, req(staff.sessionToken), { inboxIds: [] }), 400);
    await expectError(
      "an oversized acknowledgement is refused",
      inbox.acknowledgeMessages(db, req(staff.sessionToken), { inboxIds: Array.from({ length: inbox.MAX_PULL + 1 }, (_, i) => `id-${i}`) }),
      400,
    );
  }

  // --- Cross-store isolation ------------------------------------------------
  {
    const db = await freshDb();
    const a = await identity.signup(db, req(), { email: "a@example.com", password: STRONG, confirmPassword: STRONG });
    const b = await identity.signup(db, req(), { email: "b@example.com", password: STRONG, confirmPassword: STRONG });
    process.env.FASHION_STORE_INBOX_STORE_ID = a.payload.identity.store.id;
    await inbox.acceptMessages(db, [message()]);

    const bPull = await inbox.pullMessages(db, req(b.sessionToken));
    ok("another store sees none of the bound store's messages", bPull.payload.messages.length === 0);

    // And B cannot acknowledge A's messages away.
    const aPull = await inbox.pullMessages(db, req(a.sessionToken));
    await inbox.acknowledgeMessages(db, req(b.sessionToken), { inboxIds: [aPull.payload.messages[0].inboxId] });
    const aStill = await inbox.pullMessages(db, req(a.sessionToken));
    ok("one store cannot acknowledge another store's messages", aStill.payload.messages.length === 1);
  }

  // --- Expiry sweep ---------------------------------------------------------
  {
    const db = await freshDb();
    const manager = await identity.signup(db, req(), { email: "m@example.com", password: STRONG, confirmPassword: STRONG });
    process.env.FASHION_STORE_INBOX_STORE_ID = manager.payload.identity.store.id;
    await inbox.acceptMessages(db, [message()]);

    await testDb.sql("update fashion_store_os_inbox_messages set expires_at = $1", [new Date(Date.now() - 1000).toISOString()]);

    await identity.sweepIdentity(db);
    const afterSweep = await inbox.pullMessages(db, req(manager.sessionToken));
    ok("undelivered messages expire via the daily sweep", afterSweep.payload.messages.length === 0);
  }

  if (originalEnv === undefined) delete process.env.FASHION_STORE_INBOX_STORE_ID;
  else process.env.FASHION_STORE_INBOX_STORE_ID = originalEnv;

  // --- Client and server wiring (static) -----------------------------------
  const appCode = appSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const serverCode = serverSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  ok("the client pulls the inbox", /pullInbox/.test(appCode));
  // The ordering property: local storage must succeed before anything is
  // acknowledged, or a message is deleted server-side that no device holds.
  const pullBody = appCode.slice(appCode.indexOf("async function pullInbox"), appCode.indexOf("function inboxFingerprint"));
  ok("records are persisted before acknowledgement", pullBody.indexOf("persistLocalState()") < pullBody.indexOf("method: \"POST\""));
  ok("a failed save aborts the acknowledgement", /if \(!stored\)[\s\S]{0,200}return;/.test(pullBody));
  ok("the client dedups pulled messages", /inboxFingerprint/.test(appCode));
  ok("a pull triggers a backup of the new records", /scheduleAutoBackup\(\)/.test(pullBody));
  ok("the client offers a manual check", /check-messages/.test(appCode));
  ok("the webhook no longer writes a state document", !/setDocument\("state"/.test(serverCode) && !/appendWebhookMessages/.test(serverCode));
  ok("the dev server mirrors the inbox routes", /\/api\/inbox/.test(serverCode) && /pullMessages/.test(serverCode) && /acknowledgeMessages/.test(serverCode));
  ok("the retired inbound helpers are gone", !fs.existsSync(path.join(rootDir, "api/_inbound.js")) && !fs.existsSync(path.join(rootDir, "api/_channel_intake.js")));
  ok("signature verification is unchanged", fs.readFileSync(path.join(rootDir, "api/channel-webhook.js"), "utf8").includes("verifyWebhookSignature"));
  ok("the webhook writes to the inbox", fs.readFileSync(path.join(rootDir, "api/channel-webhook.js"), "utf8").includes("acceptMessages"));

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
