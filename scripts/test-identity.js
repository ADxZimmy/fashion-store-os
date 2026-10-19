// Unit suite for the Phase 021 row-based identity plane. Runs the real core
// (api/_identity.js) through the production SQL adapter (api/_identity_pg.js)
// on PGlite, a real Postgres embedded in-process. The SQL these assertions
// exercise is the SQL Neon runs; only the driver underneath differs.
//
// The 2026-08-03 lesson is enforced structurally here: every gated action is
// checked across all four cases (no session on an empty system, no session on
// a populated system, staff, manager), because the legacy bug passed its test
// against the single case it did not touch.
const identity = require("../api/_identity");
const { openTestDatabase } = require("../db/pglite");

let testDb = null;
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

// Each scenario starts from empty tables. One database serves the whole
// suite because starting PGlite costs seconds and truncating costs
// milliseconds.
async function freshDb() {
  return testDb.reset();
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
    const db = await freshDb();
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
    const db = await freshDb();
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
    const db = await freshDb();
    const gated = [
      ["create-staff", (r, b) => identity.createStaff(r, b, { name: "X", email: "x@example.com", password: STRONG })],
      ["create-staff-invite", (r, b) => identity.createInvite(r, b, { email: "y@example.com" })],
      ["cancel-staff-invite", (r, b) => identity.cancelInvite(r, b, { id: "invite-x" })],
      ["update-staff-access", (r, b) => identity.updateStaffAccess(r, b, { id: "staff-x", access: ["dashboard"] })],
      ["suspend-staff", (r, b) => identity.suspendStaff(r, b, { id: "staff-x" })],
      ["reactivate-staff", (r, b) => identity.reactivateStaff(r, b, { id: "staff-x" })],
      ["delete-staff", (r, b) => identity.deleteStaff(r, b, { id: "staff-x" })],
      ["reset-user-password", (r, b) => identity.resetUserPassword(r, b, { id: "staff-x" })],
    ];

    // Case 1, before any account exists: the empty system. This is the case
    // the 2026-08-03 bug lived in, so it runs for every gated action.
    await expectError("empty system + no session is 401", identity.createInvite(db, req(), { email: "s@example.com" }), 401);
    for (const [label, call] of gated) {
      await expectError(`${label}: empty system + no session is 401`, call(db, req()), 401);
    }
    // create-recovery-code is auth-gated rather than manager-gated.
    await expectError("create-recovery-code without a session is 401", identity.createRecoveryCode(db, req()), 401);

    const manager = await signupManager(db);
    await expectError("populated system + no session is 401", identity.createInvite(db, req(), { email: "s@example.com" }), 401);

    const staffCreate = await identity.createStaff(db, req(manager.sessionToken), { name: "S", email: "staff@example.com", password: STRONG });
    ok("manager can create staff directly", staffCreate.status === 201);
    const staffSignin = await identity.signin(db, req(), { email: "staff@example.com", password: STRONG });
    await expectError("staff session is 403 on manager actions", identity.createInvite(db, req(staffSignin.sessionToken), { email: "t@example.com" }), 403);
    const invite = await identity.createInvite(db, req(manager.sessionToken), { name: "T", email: "invitee@example.com", access: ["dashboard", "orders"] });
    ok("manager session passes the gate", invite.status === 201 && Boolean(invite.payload.invite.inviteToken));

    // Cases 2 and 3 for every manager-gated action, not just the one that
    // happened to be tested. resetUserPassword is the sharpest: unlike the
    // staff-only actions it can target a fellow manager, so a gate regression
    // there would be staff-to-manager account takeover. A suite that checked
    // only createInvite would stay green through exactly that.
    for (const [label, call] of gated) {
      await expectError(`${label}: populated + no session is 401`, call(db, req()), 401);
      await expectError(`${label}: staff session is 403`, call(db, req(staffSignin.sessionToken)), 403);
    }

    // A manager cannot be targeted through reset-user-password from a staff
    // session even by id -- verified above by the 403 -- and the manager path
    // itself still resolves the right target.
    const rosterNow = await identity.getIdentity(db, req(manager.sessionToken));
    const staffAccountId = rosterNow.payload.identity.members.find((m) => m.role === "staff").accountId;
    const issuedForStaff = await identity.resetUserPassword(db, req(manager.sessionToken), { id: staffAccountId });
    ok("manager reset-user-password targets the named colleague", issuedForStaff.payload.recovery.email === "staff@example.com");
  }

  // --- Secret containment -------------------------------------------------------
  {
    // No response may ever carry hash material. Checked across every payload
    // shape, since composeIdentity feeds all of them.
    const db = await freshDb();
    const manager = await signupManager(db);
    await identity.createStaff(db, req(manager.sessionToken), { name: "S", email: "staff@example.com", password: STRONG });
    const invite = await identity.createInvite(db, req(manager.sessionToken), { email: "invitee@example.com" });
    const staffSignin = await identity.signin(db, req(), { email: "staff@example.com", password: STRONG });
    const recovery = await identity.createRecoveryCode(db, req(manager.sessionToken));

    const accounts = await testDb.sql("select password_hash, password_salt, recovery_code_hash from fashion_store_os_accounts");
    const sessions = await testDb.sql("select token_hash from fashion_store_os_sessions");
    const invites = await testDb.sql("select token_hash from fashion_store_os_invites");
    const secrets = [
      ...accounts.map((a) => a.password_hash),
      ...accounts.map((a) => a.password_salt),
      ...accounts.map((a) => a.recovery_code_hash),
      ...sessions.map((row) => row.token_hash),
      ...invites.map((row) => row.token_hash),
    ].filter(Boolean);

    const payloads = JSON.stringify([
      manager.payload,
      invite.payload,
      staffSignin.payload,
      recovery.payload,
      (await identity.getIdentity(db, req(manager.sessionToken))).payload,
      (await identity.getIdentity(db, req(staffSignin.sessionToken))).payload,
    ]);
    const leaked = secrets.filter((secret) => payloads.includes(secret));
    ok("no password, recovery, session, or invite hash appears in any payload", leaked.length === 0, leaked.join(","));
    ok("payloads never carry raw password fields", !payloads.includes(STRONG));
  }

  // --- Hostile input on the session cookie and action dispatch -----------------
  {
    const db = await freshDb();
    const manager = await signupManager(db);

    // A malformed percent-sequence in an unrelated cookie used to throw
    // URIError out of every identity endpoint -- including signout, so the
    // browser could not clear the bad cookie and stayed bricked.
    const badCookie = { headers: { cookie: "promo=50%off; fso_session=abc", "x-forwarded-for": "10.9.9.9" } };
    const resolved = await identity.getIdentity(db, badCookie);
    ok("a malformed sibling cookie yields unauthenticated, not an error", resolved.payload.authenticated === false);

    const validWithNeighbour = {
      headers: {
        cookie: `promo=50%off; fso_session=${encodeURIComponent(manager.sessionToken)}`,
        "x-forwarded-for": "10.9.9.10",
      },
    };
    const stillWorks = await identity.getIdentity(db, validWithNeighbour);
    ok("a valid session survives a malformed neighbouring cookie", stillWorks.payload.authenticated === true);

    // Inherited Object.prototype keys must not resolve as handlers.
    const { handleSessionAction } = require("../api/_identity_http");
    for (const action of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      const captured = { statusCode: 0, body: null, headers: {} };
      const fakeResponse = {
        setHeader(key, value) { captured.headers[key] = value; },
        end(payload) { captured.body = payload; },
        set statusCode(value) { captured.statusCode = value; },
        get statusCode() { return captured.statusCode; },
      };
      await handleSessionAction(db, req(), fakeResponse, { action });
      ok(`action "${action}" is rejected as unknown`, captured.statusCode === 400 && String(captured.body).includes("Unknown action"));
    }
  }

  // --- Invites -----------------------------------------------------------------
  {
    const db = await freshDb();
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
    const db = await freshDb();
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
    const db = await freshDb();
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
    const db = await freshDb();
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
    const db = await freshDb();
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
    const db = await freshDb();
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
    const db = await freshDb();
    await signupManager(db);
    const attacker = "203.0.113.7";
    let limited = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        await identity.signin(db, req("", attacker), { email: "manager@example.com", password: "WrongPass123" });
      } catch (error) {
        if (error.statusCode === 429) {
          limited = { attempt: attempt + 1 };
          break;
        }
      }
    }
    ok("repeated failed sign-ins from one client hit 429", limited !== null && limited.attempt === 11, limited ? `at attempt ${limited.attempt}` : "never limited");

    // The lockout must be the attacker's problem, not the owner's. This is
    // the regression the pure-email limit caused: 10 wrong guesses from any
    // address locked the real owner out of their own account.
    const owner = await identity.signin(db, req("", "198.51.100.4"), { email: "manager@example.com", password: STRONG });
    ok("owner still signs in from their own client while an attacker is throttled", owner.status === 200);

    await testDb.sql("update fashion_store_os_rate_limit_events set created_at = $1", [
      new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    ]);
    const afterWindow = await identity.signin(db, req("", attacker), { email: "manager@example.com", password: STRONG });
    ok("limit clears after the window passes", afterWindow.status === 200);
  }

  {
    // Successful sign-ins must not consume the email budget, or a busy day
    // self-locks the account.
    const db = await freshDb();
    await signupManager(db);
    let allOk = true;
    for (let index = 0; index < 20; index += 1) {
      try {
        await identity.signin(db, req("", `192.0.2.${index + 1}`), { email: "manager@example.com", password: STRONG });
      } catch (error) {
        allOk = false;
        break;
      }
    }
    ok("20 successful sign-ins never self-throttle", allOk);
  }

  {
    // A stolen session must not be an unlimited password-guessing oracle.
    const db = await freshDb();
    const manager = await signupManager(db);
    let limited = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        await identity.changePassword(db, req(manager.sessionToken), { currentPassword: `guess-${attempt}`, password: "NewPassw0rd!X", confirmPassword: "NewPassw0rd!X" });
      } catch (error) {
        if (error.statusCode === 429) { limited = true; break; }
      }
    }
    ok("change-password current-password guessing is throttled", limited);
  }

  // --- Quotas -------------------------------------------------------------------------
  {
    const db = await freshDb();
    const manager = await signupManager(db);
    for (let index = 0; index < identity.OPEN_INVITE_LIMIT; index += 1) {
      await identity.createInvite(db, req(manager.sessionToken), { email: `open${index}@example.com` });
    }
    await expectError("open-invite quota enforced", identity.createInvite(db, req(manager.sessionToken), { email: "toomany@example.com" }), 409);

    // Expired invites are hidden from the manager, so they must not hold
    // quota -- otherwise the lockout has nothing on screen to cancel.
    await testDb.sql("update fashion_store_os_invites set expires_at = $1", [new Date(Date.now() - 1000).toISOString()]);
    const afterExpiry = await identity.createInvite(db, req(manager.sessionToken), { email: "now-allowed@example.com" });
    ok("expired invites do not consume the invite quota", afterExpiry.status === 201);
  }

  {
    // Cancelling an invite frees its slot.
    const db = await freshDb();
    const manager = await signupManager(db);
    const invite = await identity.createInvite(db, req(manager.sessionToken), { email: "cancelme@example.com" });
    const view = await identity.getIdentity(db, req(manager.sessionToken));
    const inviteId = view.payload.identity.invites[0].id;
    const cancelled = await identity.cancelInvite(db, req(manager.sessionToken), { id: inviteId });
    ok("manager can cancel an open invite", cancelled.status === 200 && cancelled.payload.identity.invites.length === 0);
    await expectError("a cancelled invite cannot be accepted", identity.acceptInvite(db, req(), { email: "cancelme@example.com", inviteToken: invite.payload.invite.inviteToken, password: STRONG, confirmPassword: STRONG }), 401);
    await expectError("cancelling an unknown invite is 404", identity.cancelInvite(db, req(manager.sessionToken), { id: "invite-nope" }), 404);
  }

  // --- Partial-write recovery (fault injection) ------------------------------------
  {
    // A killed function or a storage blip between insertAccount and
    // insertMembership used to leave an orphan account that permanently
    // bricked the email: signup 409'd, signin 401'd, and nothing could remove
    // it. The local adapter cannot fail on its own, so faults are injected.
    const db = await freshDb();
    const failing = { ...db, insertStore: async () => { const e = new Error("simulated storage failure"); e.statusCode = 502; throw e; } };
    await expectError("signup surfaces the storage failure", identity.signup(failing, req(), { email: "victim@example.com", password: STRONG, confirmPassword: STRONG }), 502);
    ok("compensation removed the half-built account", (await db.findAccountByEmail("victim@example.com")) === null);

    const retry = await identity.signup(db, req(), { email: "victim@example.com", password: STRONG, confirmPassword: STRONG });
    ok("the email is still usable after a failed signup", retry.status === 201);
  }

  {
    // The harder case: the process dies before compensation can run, so the
    // orphan persists. Signup must adopt it rather than 409 forever.
    const db = await freshDb();
    await db.insertAccount({
      id: "user-orphan", email: "orphan@example.com", name: "orphan",
      password_hash: "dead", password_salt: "dead", password_iterations: 120000, password_digest: "sha256",
      recovery_code_hash: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    await expectError("an orphan account cannot sign in", identity.signin(db, req(), { email: "orphan@example.com", password: STRONG }), 401);
    const adopted = await identity.signup(db, req(), { email: "orphan@example.com", password: STRONG, confirmPassword: STRONG });
    ok("signup adopts a membership-less orphan instead of 409", adopted.status === 201 && adopted.payload.identity.membership.role === "manager");
    const signin = await identity.signin(db, req(), { email: "orphan@example.com", password: STRONG });
    ok("the adopted account signs in normally", signin.status === 200);
    const matching = await testDb.sql("select count(*)::int as count from fashion_store_os_accounts where lower(email) = 'orphan@example.com'");
    ok("adoption reuses the row rather than duplicating the email", matching[0].count === 1);
  }

  {
    // A live account must never be adoptable -- that would be account takeover.
    const db = await freshDb();
    await signupManager(db, "live@example.com");
    await expectError("signup cannot adopt an account that has a membership", identity.signup(db, req(), { email: "live@example.com", password: "Attacker0!Pass", confirmPassword: "Attacker0!Pass" }), 409);
    const stillOwner = await identity.signin(db, req(), { email: "live@example.com", password: STRONG });
    ok("the real owner's password still works after the takeover attempt", stillOwner.status === 200);
  }

  // --- Store deletion (Phase 021 step 6) ----------------------------------------------
  {
    const db = await freshDb();
    const count = async (sql, params = []) => (await testDb.sql(sql, params))[0].count;

    // All four gate cases, starting from the empty system the 2026-08-03 bug
    // lived in.
    await expectError("delete-store on an empty system with no session is 401", identity.deleteStore(db, req(), { currentPassword: STRONG }), 401);

    const doomed = await signupManager(db, "doomed@example.com");
    const doomedStore = doomed.payload.identity.store.id;
    const survivor = await signupManager(db, "survivor@example.com");
    const survivorStore = survivor.payload.identity.store.id;

    await expectError("delete-store with no session is 401", identity.deleteStore(db, req(), { currentPassword: STRONG }), 401);
    await identity.createStaff(db, req(doomed.sessionToken), { name: "S", email: "doomed-staff@example.com", password: STRONG });
    const staff = await identity.signin(db, req(), { email: "doomed-staff@example.com", password: STRONG });
    await expectError("staff cannot delete the store", identity.deleteStore(db, req(staff.sessionToken), { currentPassword: STRONG }), 403);
    await expectError("a wrong password does not delete the store", identity.deleteStore(db, req(doomed.sessionToken), { currentPassword: "not-the-password" }), 401);
    ok("a refused delete leaves the store in place", (await count("select count(*)::int as count from fashion_store_os_stores where id = $1", [doomedStore])) === 1);

    // Give the doomed store something in every dependent table.
    await identity.createInvite(db, req(doomed.sessionToken), { email: "pending@example.com" });
    await db.putBackup({
      store_id: doomedStore, ciphertext: "QUJD", salt: "c2FsdA==", iv: "aXY=", format: 1, byte_size: 4,
      created_by: doomed.payload.identity.account.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    await db.insertInboxMessage({
      id: "inbox-doomed", store_id: doomedStore, fingerprint: "whatsapp|m1", payload: { message: "hi" },
      received_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    // And one account that also belongs to the surviving store: deleting the
    // doomed store must not take it. v1's API cannot create this, so it is
    // inserted directly to prove the guard rather than assume it.
    const now = new Date().toISOString();
    await db.insertAccount({ id: "user-shared", email: "shared@example.com", name: "Shared", password_hash: "x", password_salt: "y", created_at: now, updated_at: now });
    await db.insertMembership({ account_id: "user-shared", store_id: doomedStore, role: "staff", status: "active", allowed_views: ["dashboard"], created_at: now, updated_at: now });
    await db.insertMembership({ account_id: "user-shared", store_id: survivorStore, role: "staff", status: "active", allowed_views: ["dashboard"], created_at: now, updated_at: now });

    const deleted = await identity.deleteStore(db, req(doomed.sessionToken), { currentPassword: STRONG });
    ok("a manager can delete the store with their password", deleted.status === 200 && deleted.payload.storeDeleted === true);
    ok("deleting the store ends the caller's session", deleted.clearSession === true);

    const inStore = (table, column = "store_id") => count(`select count(*)::int as count from ${table} where ${column} = $1`, [doomedStore]);
    ok("the store row is gone", (await inStore("fashion_store_os_stores", "id")) === 0);
    ok("its memberships are gone", (await inStore("fashion_store_os_memberships")) === 0);
    ok("its invites are gone", (await inStore("fashion_store_os_invites")) === 0);
    ok("its encrypted backup is gone", (await inStore("fashion_store_os_backups")) === 0);
    ok("its undelivered inbox messages are gone", (await inStore("fashion_store_os_inbox_messages")) === 0);
    ok("its audit trail is gone", (await inStore("fashion_store_os_identity_audit")) === 0);
    ok(
      "accounts that belonged only to it are gone",
      (await count("select count(*)::int as count from fashion_store_os_accounts where lower(email) in ('doomed@example.com', 'doomed-staff@example.com')")) === 0,
    );
    ok(
      "their sessions are gone",
      (await identity.getIdentity(db, req(doomed.sessionToken))).payload.authenticated === false &&
        (await identity.getIdentity(db, req(staff.sessionToken))).payload.authenticated === false,
    );
    ok("an account that also belongs to another store survives", (await count("select count(*)::int as count from fashion_store_os_accounts where id = 'user-shared'")) === 1);
    ok("its other membership survives", (await count("select count(*)::int as count from fashion_store_os_memberships where account_id = 'user-shared'")) === 1);
    const survivorView = await identity.getIdentity(db, req(survivor.sessionToken));
    ok("another store is untouched", survivorView.payload.authenticated === true && survivorView.payload.identity.store.id === survivorStore);

    await expectError("the deleted manager can no longer sign in", identity.signin(db, req(), { email: "doomed@example.com", password: STRONG }), 401);
    const reused = await signupManager(db, "doomed@example.com");
    ok("the deleted email can sign up again as a new store", reused.status === 201 && reused.payload.identity.store.id !== doomedStore);
  }

  // --- Retention sweep -----------------------------------------------------------------
  {
    const db = await freshDb();
    const manager = await signupManager(db);
    await identity.createInvite(db, req(manager.sessionToken), { email: "stale@example.com" });

    // Backdate everything past its retention horizon.
    const past = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    await testDb.sql("update fashion_store_os_sessions set expires_at = $1", [past]);
    await testDb.sql("update fashion_store_os_invites set expires_at = $1", [past]);
    await testDb.sql("update fashion_store_os_rate_limit_events set created_at = $1", [past]);
    await testDb.sql("update fashion_store_os_identity_audit set created_at = $1", [past]);

    await identity.sweepIdentity(db);
    const remaining = async (table) => (await testDb.sql(`select count(*)::int as count from ${table}`))[0].count;
    ok("sweep clears expired sessions", (await remaining("fashion_store_os_sessions")) === 0);
    ok("sweep clears expired open invites", (await remaining("fashion_store_os_invites")) === 0);
    ok("sweep clears old rate events", (await remaining("fashion_store_os_rate_limit_events")) === 0);
    ok("sweep clears old audit rows", (await remaining("fashion_store_os_identity_audit")) === 0);
    ok("sweep keeps live accounts and stores", (await remaining("fashion_store_os_accounts")) === 1 && (await remaining("fashion_store_os_stores")) === 1);
  }

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
