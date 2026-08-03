const { normalizeAuthDocument, requireManager } = require("./_auth");
const { handleError, handleOptions, readJsonBody, sendJson, sendMethodNotAllowed } = require("./_response");
const { storeForRequest } = require("./_store");
const { issueWorkspaceCode, redeemWorkspaceCode } = require("./_workspace_codes");
const { assertRedeemAllowed } = require("./_rate_limit");

module.exports = async function handler(request, response) {
  const methods = ["POST", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (request.method !== "POST") {
    sendMethodNotAllowed(response, methods);
    return;
  }

  try {
    const body = (await readJsonBody(request)) || {};
    const action = String(body.action || "").trim();

    // Redeem is unauthenticated by necessity: the caller is on a new device and
    // has no session for the workspace they are trying to reach. It returns a
    // workspace id and nothing else -- reading any data still requires signing
    // in afterwards.
    if (action === "redeem") {
      assertRedeemAllowed(request);
      const result = await redeemWorkspaceCode(body.code, "join");
      sendJson(response, 200, { ok: true, workspaceId: result.workspaceId });
      return;
    }

    if (action === "create") {
      const store = storeForRequest(request);
      const authResult = await store.getDocument("auth");
      const normalized = normalizeAuthDocument(authResult.value || {});
      if (authResult.exists && normalized.changed) {
        await store.setDocument("auth", normalized.auth);
      }
      const { user } = requireManager(normalized.auth, request);
      // requireManager is what keeps a code from ever pointing at a workspace
      // with no manager, so joining can never hand someone an unclaimed
      // workspace that signup would then let them take over.
      const issued = await issueWorkspaceCode(store.workspace, "join", user?.id);
      sendJson(response, 201, {
        ok: true,
        workspaceCode: issued.workspaceCode,
        expiresAt: issued.expiresAt,
      });
      return;
    }

    const error = new Error("Unknown workspace code action");
    error.statusCode = 400;
    throw error;
  } catch (error) {
    handleError(response, error);
  }
};
