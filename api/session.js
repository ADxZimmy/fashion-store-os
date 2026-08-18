const {
  acceptStaffInvite,
  buildClearSessionCookie,
  buildSessionCookie,
  changePassword,
  createRecoveryCode,
  createStaff,
  createStaffInvite,
  deleteStaff,
  normalizeAuthDocument,
  reactivateStaff,
  redeemRecoveryCode,
  requireSession,
  resetUserPassword,
  resolveSession,
  sanitizeAuth,
  sanitizeInvite,
  signIn,
  signOut,
  signUpManager,
  suspendStaff,
  updateStaffAccess,
} = require("./_auth");
const { handleError, handleOptions, readJsonBody, sendJson, sendMethodNotAllowed } = require("./_response");
const { storeForRequest, storeForWorkspace } = require("./_store");
const { issueWorkspaceCode, redeemWorkspaceCode, splitCombinedInvite } = require("./_workspace_codes");

module.exports = async function handler(request, response) {
  const methods = ["GET", "POST", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;

  try {
    const store = storeForRequest(request);
    const { auth, exists, changed } = await readAuthDocument(store);
    if (exists && changed) {
      await store.setDocument("auth", auth);
    }

    if (request.method === "GET") {
      await sendSessionPayload(store, response, request, auth);
      return;
    }

    if (request.method === "POST") {
      const body = (await readJsonBody(request)) || {};
      const action = String(body.action || "").trim();

      if (action === "signup") {
        const result = signUpManager(auth, body);
        await store.setDocument("auth", result.auth);
        response.setHeader("Set-Cookie", buildSessionCookie(result.token, request));
        await sendSessionPayload(store, response, request, result.auth, 201, { session: result.session, user: result.user }, {
          recovery: { recoveryCode: result.recoveryCode },
        });
        return;
      }

      if (action === "signin") {
        const result = signIn(auth, body);
        await store.setDocument("auth", result.auth);
        response.setHeader("Set-Cookie", buildSessionCookie(result.token, request));
        await sendSessionPayload(store, response, request, result.auth, 200, { session: result.session, user: result.user });
        return;
      }

      if (action === "accept-invite") {
        // An invite is handed to someone who opens the app on their own device,
        // which sits in its own empty workspace. The combined invite string
        // carries a workspace code so the invite can be resolved against the
        // workspace that issued it rather than the one this browser happens to
        // be in. Without this the invite only works in the manager's browser.
        const combined = splitCombinedInvite(body.inviteCode || body.code || "");
        let inviteStore = store;
        let inviteAuth = auth;
        let joinedWorkspaceId = "";

        if (combined.workspaceCode) {
          const redeemed = await redeemWorkspaceCode(combined.workspaceCode, "invite");
          joinedWorkspaceId = redeemed.workspaceId;
          inviteStore = storeForWorkspace(joinedWorkspaceId);
          const invited = await inviteStore.getDocument("auth");
          inviteAuth = normalizeAuthDocument(invited.value || {}).auth;
        }

        const result = acceptStaffInvite(inviteAuth, {
          ...body,
          inviteToken: combined.inviteToken || body.inviteToken || body.token,
        });
        await inviteStore.setDocument("auth", result.auth);
        response.setHeader("Set-Cookie", buildSessionCookie(result.token, request));
        await sendSessionPayload(inviteStore, response, request, result.auth, 200, { session: result.session, user: result.user }, {
          // The client adopts this so every later request carries the right
          // x-workspace-id header.
          joinedWorkspaceId,
        });
        return;
      }

      // Unauthenticated by necessity: the caller cannot sign in, which is why
      // they are here. Deliberately issues no session and sets no cookie, so
      // the client must authenticate with the new password afterwards.
      if (action === "redeem-recovery-code") {
        const result = redeemRecoveryCode(auth, body);
        await store.setDocument("auth", result.auth);
        sendJson(response, 200, {
          ok: true,
          authenticated: false,
          auth: sanitizeAuth(result.auth),
          state: null,
          stateExists: false,
          passwordReset: true,
        });
        return;
      }

      if (action === "signout") {
        const nextAuth = signOut(auth, request);
        await store.setDocument("auth", nextAuth);
        response.setHeader("Set-Cookie", buildClearSessionCookie(request));
        sendJson(response, 200, {
          ok: true,
          authenticated: false,
          auth: sanitizeAuth(nextAuth),
          state: null,
          stateExists: false,
        });
        return;
      }

      const { session, user } = requireSession(auth, request);

      if (action === "create-staff") {
        const nextAuth = createStaff(auth, user, body);
        await store.setDocument("auth", nextAuth);
        await sendSessionPayload(store, response, request, nextAuth, 201);
        return;
      }

      if (action === "create-staff-invite") {
        const result = createStaffInvite(auth, user, body);
        await store.setDocument("auth", result.auth);
        // Pair the invite with a workspace code so it can be accepted from the
        // invitee's own device. Without this the invite is only redeemable in
        // the manager's browser, because acceptStaffInvite looks for the user
        // inside whatever workspace the request header resolves to.
        //
        // Degrade rather than fail if the code cannot be issued -- most likely
        // because the Phase 019 migration has not been applied yet. Deploying
        // this code ahead of the migration then leaves invites working exactly
        // as they did before instead of returning a storage error.
        //
        // createStaffInvite has already called assertManager, so user is a real
        // manager by this point. Do not soften this back to user?.id -- that idiom
        // is what hid the missing gate on the join path in api/workspace-code.js.
        let workspaceCode = "";
        try {
          const issued = await issueWorkspaceCode(store.workspace, "invite", user.id);
          workspaceCode = issued.workspaceCode;
        } catch (codeError) {
          console.error("Workspace code issue failed; returning a same-device invite", codeError);
        }
        const invite = sanitizeInvite(
          result.auth.users.find((item) => item.email === result.invite.email) || {},
          result.inviteToken,
          workspaceCode,
        );
        await sendSessionPayload(store, response, request, result.auth, 201, null, { invite });
        return;
      }

      if (action === "update-staff-access") {
        const nextAuth = updateStaffAccess(auth, user, body);
        await store.setDocument("auth", nextAuth);
        await sendSessionPayload(store, response, request, nextAuth);
        return;
      }

      if (action === "create-recovery-code") {
        const result = createRecoveryCode(auth, user);
        await store.setDocument("auth", result.auth);
        await sendSessionPayload(store, response, request, result.auth, 201, null, { recovery: result.recovery });
        return;
      }

      if (action === "reset-user-password") {
        const result = resetUserPassword(auth, user, body);
        await store.setDocument("auth", result.auth);
        await sendSessionPayload(store, response, request, result.auth, 201, null, { recovery: result.recovery });
        return;
      }

      if (action === "change-password") {
        const nextAuth = changePassword(auth, user, body, session);
        await store.setDocument("auth", nextAuth);
        await sendSessionPayload(store, response, request, nextAuth);
        return;
      }

      if (action === "suspend-staff") {
        const nextAuth = suspendStaff(auth, user, body);
        await store.setDocument("auth", nextAuth);
        await sendSessionPayload(store, response, request, nextAuth);
        return;
      }

      if (action === "reactivate-staff") {
        const nextAuth = reactivateStaff(auth, user, body);
        await store.setDocument("auth", nextAuth);
        await sendSessionPayload(store, response, request, nextAuth);
        return;
      }

      if (action === "delete-staff") {
        const nextAuth = deleteStaff(auth, user, body);
        await store.setDocument("auth", nextAuth);
        await sendSessionPayload(store, response, request, nextAuth);
        return;
      }

      const error = new Error("Unknown session action");
      error.statusCode = 400;
      throw error;
    }

    sendMethodNotAllowed(response, methods);
  } catch (error) {
    handleError(response, error);
  }
};

async function readAuthDocument(store) {
  const result = await store.getDocument("auth");
  const normalized = normalizeAuthDocument(result.value || {});
  return {
    auth: normalized.auth,
    exists: result.exists,
    changed: normalized.changed,
  };
}

async function sendSessionPayload(store, response, request, auth, statusCode = 200, resolvedOverride = null, extra = {}) {
  const resolved = resolvedOverride || resolveSession(auth, request);
  const stateResult = resolved.user ? await store.getDocument("state") : { value: null, exists: false };
  sendJson(response, statusCode, {
    ok: true,
    authenticated: Boolean(resolved.user),
    auth: sanitizeAuth(auth, resolved.user?.id || ""),
    state: stateResult.value,
    stateExists: stateResult.exists,
    sessionExpiresAt: resolved.session?.expiresAt || "",
    ...extra,
  });
}
