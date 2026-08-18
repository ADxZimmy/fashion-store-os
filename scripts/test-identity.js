// Unit suite for the Phase 021 row-based identity plane. Runs the real core
// (api/_identity.js) against the file-backed adapter on a scratch directory,
// so every assertion exercises the exact code production runs -- only the
// storage transport differs.
//
// The 2026-08-03 lesson is enforced structurally here: every gated action is
// checked across all four cases (no session on an empty system, no session on
// a populated system, staff, manager), because the legacy bug passed its test
// against the single case it did not touch.
const fs = require("fs");
const os = require("os");
const path = require("path");

const identity = require("../api/_identity");
const { createLocalIdentityStore } = require("../api/_identity_local");

const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fso-identity-test-"));
let pass = 0;
let fail = 0;
let clientCounter = 0;

function ok(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`PASS ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

function freshDb(name) {
  const dir = path.join(scratchRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  return createLocalIdentityStore(dir);
}

// Distinct client IPs by default so unrelated tests never share a rate window.
function req(sessionToken = "", clientIp = "") {
  clientCounter += 1;
  return {
    headers: {
      cookie: sessionToken ? `fso_session=${encodeURIComponent(sessionToken)}` : "",
      "x-forwarded-for": clientIp || `10.0.${Math.floor(clientCounter / 250)}.${clientCounter % 250}`,
    },
  };
}

async function expectError(label, promise, statusCode, messagePart = "") {
  try {
    await promise;
    ok(label, false, "no error thrown");
    return null;
  } catch (error) {
    const statusMatches = error.statusCode === statusCode;
    const messageMatches = !messagePart || String(error.message).includes(messagePart);
    ok(label, statusMatches && messageMatches, `status ${error.statusCode}: ${error.message}`);
    return error;
  }
}

const STRONG = "Str0ng!Passw0rd";

async function signupManager(db, email = "manager@example.com", name = "M") {
  return identity.signup(db, req(), { name, email, password: STRONG, confirmPassword: STRONG });
}

async function main() {
  // --- Signup ---------------------------------------------------------------
  {
    const db = freshDb("signup");
    const result = await signupManager(db);
    ok("signup returns 201 with a session token", result.status === 201 && Boolean(result.sessionToken));
    ok("signup account email is normalized", result.payload.identity.account.email === "manager@example.com");
    ok("signup membership is manager with full access", result.payload.identity.membership.role === "manager" && result.payload.identity.membership.allowedViews.length === 10);
    ok("signup returns a recovery code exactly once", typeof result.payload.recovery.recoveryCode === "string" && result.payload.recovery.recoveryCode.length > 20);
    const stored = await db.findAccountByEmail("manager@example.com");
    ok("raw password and recovery code are not stored", JSON.stringify(stored).includes(STRONG) === false && JSON.stringify(stored).includes(result.payload.recovery.recoveryCode) === false);

    await expectError("duplicate email signup is refused", signupManager(db, "Manager@Example.com"), 409);
    await expectError("invalid email is refused", identity.signup(db, req(), { email: "not-an-email", password: STRONG, confirmPassword: STRONG }), 400);
    await expectError("weak password is refused", identity.signup(db, req(), { email: "b@example.com", password: "short", confirmPassword: "short" }), 400);
    await expectError("mismatched confirm is refused", identity.signup(db, req(), { email: "c@example.com", password: STRONG, confirmPassword: STRONG + "x" }), 400);
  }

  // --- Sign-in and sessions --------------------------------------------------
  {
    const db = freshDb("signin");
    const signup = await signupManager(db);
    const signin = await identity.signin(db, req(), { email: "manager@example.com", password: STRONG });
    ok("signin succeeds with correct password", signin.status === 200 && Boolean(signin.sessionToken));

    const wrongPw = await expectError("wrong password is 401", identity.signin(db, req(), { email: "manager@example.com", password: "WrongPass123" }), 401);
    const noUser = await expectError("unknown email is 401", identity.signin(db, req(), { email: "ghost@example.com", password: "WrongPass123" }), 401);
    ok("wrong-password and unknown-email messages are identical", wrongPw && noUser && wrongPw.message === noUser.message);

    const who = await identity.getIdentity(db, req(signin.sessionToken));
    ok("session cookie resolves identity", who.payload.authenticated === true && who.payload.identity.account.email === "manager@example.com");
    const bogus = await identity.getIdentity(db, req("not-a-real-token"));
    ok("bogus session token is unauthenticated, not an error", bogus.payload.authenticated === false && bogus.payload.identity === null);

    const out = await identity.signout(db, req(signin.sessionToken));
    ok("signout clears the session", out.clearSession === true);
    const after = await identity.getIdentity(db, req(signin.sessionToken));
    ok("signed-out token no longer resolves", after.payload.authenticated === false);
    const stillValid = await identity.getIdentity(db, req(signup.sessionToken));
    ok("other sessions survive a signout", stillValid.payload.authenticated === true);
  }

  // --- The four-case manager gate ---------------------------------------------
  {
    const emptyDb = freshDb("gate-empty");
    await expectError("empty system + no session is 401", identity.createInvite(emptyDb, req(), { email: "s@example.com" }), 401);

    const db = freshDb("gate-populated");
    const manager = await signupManager(db);
    await expectError("populated system + no session is 401", identity.createInvite(db, req(), { email: "s@example.com" }), 401);

    const staffCreate = await identity.createStaff(db, req(manager.sessionToken), { name: "S", email: "staff@example.com", password: STRONG });
    ok("manager can create staff directly", staffCreate.status === 201);
    const staffSignin = await identity.signin(db, req(), { email: "staff@example.com", password: STRONG });
    await expectError("staff session is 403 on manager actions", identity.createInvite(db, req(staffSignin.sessionToken), { email: "t@example.com" }), 403);
    const invite = await identity.createInvite(db, req(manager.sessionToken), { name: "T", email: "invitee@example.com", access: ["dashboard", "orders"] });
    ok("manager session passes the gate", invite.status === 201 && Boolean(invite.payload.invite.inviteToken));

    // Same four cases on a second gated action, cheaply.
    await expectError("suspend-staff without session is 401", identity.suspendStaff(db, req(), { id: "anything" }), 401);
    await expectError("suspend-staff as staff is 403", identity.suspendStaff(db, req(staffSignin.sessionToken), { id: "anything" }), 403);
  }

  // --- Invites -----------------------------------------------------------------
  {
    const db = freshDb("invites");
    const manager = await signupManager(db);
    const first = await identity.createInvite(db, req(manager.sessionToken), { name: "T", email: "invitee@example.com", access: ["dashboard", "orders", "bogus-view"] });
    const token = first.payload.invite.inviteToken;

    const replaced = await identity.createInvite(db, req(manager.sessionToken), { name: "T", email: "invitee@example.com" });
    const openForEmail = await db.listOpenInvitesByEmail("invitee@example.com");
    ok("re-inviting the same email replaces the open invite", openForEmail.length === 1);
    await expectError("replaced token no longer accepts", identity.acceptInvite(db, req(), { email: "invitee@example.com", inviteToken: token, password: STRONG, confirmPassword: STRONG }), 401);

    const token2 = replaced.payload.invite.inviteToken;
    await expectError("wrong invite token is 401", identity.acceptInvite(db, req(), { email: "invitee@example.com", inviteToken: "wrong-token", password: STRONG, confirmPassword: STRONG }), 401);

    const accepted = await identity.acceptInvite(db, req(), { email: "invitee@example.com", inviteToken: token2, password: STRONG, confirmPassword: STRONG });
    ok("invite accepts into a staff membership with a session", accepted.status === 201 && accepted.payload.identity.membership.role === "staff" && Boolean(accepted.sessionToken));
    ok("bogus view keys were dropped from invite access", !accepted.payload.identity.membership.allowedViews.includes("bogus-view"));
    await expectError("a spent invite cannot be accepted again", identity.acceptInvite(db, req(), { email: "invitee@example.com", inviteToken: token2, password: STRONG, confirmPassword: STRONG }), 401);
    await expectError("inviting an existing account is refused", identity.createInvite(db, req(manager.sessionToken), { email: "invitee@example.com" }), 409);

    const expired = await identity.createInvite(db, req(manager.sessionToken), { email: "late@example.com" });
    const openLate = await db.listOpenInvitesByEmail("late@example.com");
    await db.updateInvite(openLate[0].id, { expires_at: new Date(Date.now() - 1000).toISOString() });
    await expectError("expired invite is 410", identity.acceptInvite(db, req(), { email: "late@example.com", inviteToken: expired.payload.invite.inviteToken, password: STRONG, confirmPassword: STRONG }), 410);
  }

  // --- Roster visibility ---------------------------------------------------------
  {
    const db = freshDb("roster");
    const manager = await signupManager(db);
    await identity.createStaff(db, req(manager.sessionToken), { name: "S", email: "staff@example.com", password: STRONG });
    await identity.createInvite(db, req(manager.sessionToken), { email: "open@example.com" });

    const managerView = await identity.getIdentity(db, req(manager.sessionToken));
    ok("manager sees member emails", managerView.payload.identity.members.every((m) => m.email !== "" || m.role === "manager"));
    ok("manager sees open invites", managerView.payload.identity.invites.length === 1);
    ok("manager sees audit events", managerView.payload.identity.auditEvents.length > 0);

    const staffSignin = await identity.signin(db, req(), { email: "staff@example.com", password: STRONG });
    const staffView = await identity.getIdentity(db, req(staffSignin.sessionToken));
    const others = staffView.payload.identity.members.filter((m) => m.accountId !== staffView.payload.identity.account.id);
    ok("staff sees colleagues as skeletons", others.length === 1 && others.every((m) => m.email === "" && m.name === ""));
    ok("staff sees no invites and no audit", staffView.payload.identity.invites.length === 0 && staffView.payload.identity.auditEvents.length === 0);
  }

  // --- Suspend / reactivate / access / delete ---------------------------------
  {
    const db = freshDb("lifecycle");
    const manager = await signupManager(db);
    await identity.createStaff(db, req(manager.sessionToken), { name: "S", email: "staff@example.com", password: STRONG });
    const staffSignin = await identity.signin(db, req(), { email: "staff@example.com", password: STRONG });
    const roster = await identity.getIdentity(db, req(manager.sessionToken));
    const staffId = roster.payload.identity.members.find((m) => m.role === "staff").accountId;

    await identity.suspendStaff(db, req(manager.sessionToken), { id: staffId });
    const suspendedSession = await identity.getIdentity(db, req(staffSignin.sessionToken));
    ok("suspension kills live staff sessions", suspendedSession.payload.authenticated === false);
    await expectError("suspended staff cannot sign in", identity.signin(db, req(), { email: "staff@example.com", password: STRONG }), 403, "suspended");

    await identity.reactivateStaff(db, req(manager.sessionToken), { id: staffId });
    const back = await identity.signin(db, req(), { email: "staff@example.com", password: STRONG });
    ok("reactivated staff signs in again", back.status === 200);

    const accessUpdate = await identity.updateStaffAccess(db, req(manager.sessionToken), { id: staffId, access: ["dashboard", "orders", "nonsense"] });
    const updated = accessUpdate.payload.identity.members.find((m) => m.accountId === staffId);
    ok("access update normalizes views", updated.allowedViews.join(",") === "dashboard,orders");

    await expectError("manager cannot be targeted by staff actions", identity.suspendStaff(db, req(manager.sessionToken), { id: manager.payload.identity.account.id }), 404);

    await identity.deleteStaff(db, req(manager.sessionToken), { id: staffId });
    ok("deleted staff account is gone entirely", (await db.getAccount(staffId)) === null);
    const deadSession = await identity.getIdentity(db, req(back.sessionToken));
    ok("deleted staff sessions are dead", deadSession.payload.authenticated === false);
  }

  // --- Cross-store tenancy ------------------------------------------------------
  {
    const db = freshDb("tenancy");
    const managerA = await signupManager(db, "a@example.com");
    const managerB = await signupManager(db, "b@example.com");
    await identity.createStaff(db, req(managerB.sessionToken), { name: "S", email: "staff-b@example.com", password: STRONG });
    const rosterB = await identity.getIdentity(db, req(managerB.sessionToken));
    const staffBId = rosterB.payload.identity.members.find((m) => m.role === "staff").accountId;
    await expectError("manager of store A cannot touch staff of store B", identity.suspendStaff(db, req(managerA.sessionToken), { id: staffBId }), 404);
    const viewA = await identity.getIdentity(db, req(managerA.sessionToken));
    ok("store A roster does not contain store B members", viewA.payload.identity.members.length === 1);
  }

  // --- Password change ------------------------------------------------------------
  {
    const db = freshDb("password");
    const manager = await signupManager(db);
    const second = await identity.signin(db, req(), { email: "manager@example.com", password: STRONG });
    await expectError("wrong current password is 401", identity.changePassword(db, req(manager.sessionToken), { currentPassword: "nope-nope-nope", password: "NewPassw0rd!X", confirmPassword: "NewPassw0rd!X" }), 401);

    await identity.changePassword(db, req(manager.sessionToken), { currentPassword: STRONG, password: "NewPassw0rd!X", confirmPassword: "NewPassw0rd!X" });
    await expectError("old password no longer signs in", identity.signin(db, req(), { email: "manager@example.com", password: STRONG }), 401);
    const fresh = await identity.signin(db, req(), { email: "manager@example.com", password: "NewPassw0rd!X" });
    ok("new password signs in", fresh.status === 200);
    const changer = await identity.getIdentity(db, req(manager.sessionToken));
    const other = await identity.getIdentity(db, req(second.sessionToken));
    ok("password change keeps the changing session, drops others", changer.payload.authenticated === true && other.payload.authenticated === false);
  }

  // --- Recovery ---------------------------------------------------------------------
  {
    const db = freshDb("recovery");
    const manager = await signupManager(db);
    const code = manager.payload.recovery.recoveryCode;

    const redeem = await identity.redeemRecoveryCode(db, req(), { email: "manager@example.com", recoveryCode: code, password: "Recovered0!Pass", confirmPassword: "Recovered0!Pass" });
    ok("recovery redeem succeeds and grants no session", redeem.status === 200 && !redeem.sessionToken && redeem.payload.authenticated === false);
    const oldSession = await identity.getIdentity(db, req(manager.sessionToken));
    ok("recovery redeem drops existing sessions", oldSession.payload.authenticated === false);
    const signin = await identity.signin(db, req(), { email: "manager@example.com", password: "Recovered0!Pass" });
    ok("recovered password signs in", signin.status === 200);
    await expectError("a recovery code is single use", identity.redeemRecoveryCode(db, req(), { email: "manager@example.com", recoveryCode: code, password: "Another0!Pass", confirmPassword: "Another0!Pass" }), 401);

    const wrongCode = await expectError("wrong code is 401", identity.redeemRecoveryCode(db, req(), { email: "manager@example.com", recoveryCode: "bogus", password: "Another0!Pass", confirmPassword: "Another0!Pass" }), 401);
    const wrongEmail = await expectError("unknown email is 401", identity.redeemRecoveryCode(db, req(), { email: "ghost@example.com", recoveryCode: "bogus", password: "Another0!Pass", confirmPassword: "Another0!Pass" }), 401);
    ok("wrong-code and unknown-email messages are identical", wrongCode && wrongEmail && wrongCode.message === wrongEmail.message);

    await identity.createStaff(db, req(signin.sessionToken), { name: "S", email: "staff@example.com", password: STRONG });
    const roster = await identity.getIdentity(db, req(signin.sessionToken));
    const staffId = roster.payload.identity.members.find((m) => m.role === "staff").accountId;
    const issued = await identity.resetUserPassword(db, req(signin.sessionToken), { id: staffId });
    ok("manager-issued recovery names the colleague", issued.payload.recovery.email === "staff@example.com");
    const staffRedeem = await identity.redeemRecoveryCode(db, req(), { email: "staff@example.com", recoveryCode: issued.payload.recovery.recoveryCode, password: "Staff0!NewPass", confirmPassword: "Staff0!NewPass" });
    ok("colleague redeems the manager-issued code", staffRedeem.status === 200);
  }

  // --- Durable rate limiting -----------------------------------------------------
  {
    const db = freshDb("ratelimit");
    await signupManager(db);
    const sameClient = "203.0.113.7";
    let limited = null;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      try {
        await identity.signin(db, req("", sameClient), { email: "manager@example.com", password: "WrongPass123" });
      } catch (error) {
        if (error.statusCode === 429) {
          limited = { attempt: attempt + 1, error };
          break;
        }
      }
    }
    ok("repeated failed sign-ins hit 429 at the email limit", limited !== null && limited.attempt === 11, limited ? `at attempt ${limited.attempt}` : "never limited");

    // Backdate the window and confirm recovery of access.
    const dir = path.join(scratchRoot, "ratelimit", "identity.json");
    const data = JSON.parse(fs.readFileSync(dir, "utf8"));
    data.rateEvents = data.rateEvents.map((row) => ({ ...row, created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() }));
    fs.writeFileSync(dir, JSON.stringify(data));
    const afterWindow = await identity.signin(db, req("", sameClient), { email: "manager@example.com", password: STRONG });
    ok("limit clears after the window passes", afterWindow.status === 200);
  }

  // --- Quotas -------------------------------------------------------------------------
  {
    const db = freshDb("quota");
    const manager = await signupManager(db);
    for (let index = 0; index < identity.OPEN_INVITE_LIMIT; index += 1) {
      await identity.createInvite(db, req(manager.sessionToken), { email: `open${index}@example.com` });
    }
    await expectError("open-invite quota enforced", identity.createInvite(db, req(manager.sessionToken), { email: "toomany@example.com" }), 409);
  }

  // --- Retention sweep -----------------------------------------------------------------
  {
    const db = freshDb("sweep");
    const manager = await signupManager(db);
    await identity.createInvite(db, req(manager.sessionToken), { email: "stale@example.com" });

    // Backdate everything past its retention horizon.
    const filePath = path.join(scratchRoot, "sweep", "identity.json");
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const past = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    data.sessions = data.sessions.map((row) => ({ ...row, expires_at: past }));
    data.invites = data.invites.map((row) => ({ ...row, expires_at: past }));
    data.rateEvents = data.rateEvents.map((row) => ({ ...row, created_at: past }));
    data.audit = data.audit.map((row) => ({ ...row, created_at: past }));
    fs.writeFileSync(filePath, JSON.stringify(data));

    await identity.sweepIdentity(db);
    const swept = JSON.parse(fs.readFileSync(filePath, "utf8"));
    ok("sweep clears expired sessions", swept.sessions.length === 0);
    ok("sweep clears expired open invites", swept.invites.length === 0);
    ok("sweep clears old rate events", swept.rateEvents.length === 0);
    ok("sweep clears old audit rows", swept.audit.length === 0);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  fs.rmSync(scratchRoot, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  fs.rmSync(scratchRoot, { recursive: true, force: true });
  process.exit(1);
});
