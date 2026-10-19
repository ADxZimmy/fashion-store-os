// Phase 021 Release A: endpoints retired by the local-first pivot answer 410
// rather than disappearing, so a browser still running the pre-pivot bundle
// gets a definite, non-retryable answer instead of a 404 that reads like a
// routing fault. Release B deletes this file, api/retired.js, and the
// rewrites in vercel.json that send the retired paths there.
const { handleOptions, sendJson } = require("./_response");

// One message per retired path. Shared by api/retired.js and the dev server,
// so local dev and production give the same answer for each path.
const RETIRED_ENDPOINTS = Object.freeze({
  // Business state lives on the device; there is no server copy to read or write.
  state: "Business data is stored on your device and is no longer synced to the server.",
  // Export became a local file download, and store deletion moved to the
  // delete-store action on /api/session.
  data: "Export and reset now happen on your device, in Settings.",
  // Manual channel intake was always client-side; provider messages go to the
  // transit inbox.
  inbound: "Channel messages are stored on your device. Use the app's intake form.",
  // Accounts are global, so signing in on the second device replaces codes.
  "workspace-code": "Workspace codes are retired. Sign in with your email and password on the other device.",
});

const GENERIC_DETAIL = "This endpoint was retired when business data moved onto the device.";

// Which retired endpoint a request was for. vercel.json rewrites each path to
// /api/retired?endpoint=<name>; the path itself is checked too, because a
// rewrite may hand the function either form of the URL.
function retiredEndpointFor(request) {
  let url;
  try {
    url = new URL(request.url || "/", "http://localhost");
  } catch (error) {
    return "";
  }
  const named = url.searchParams.get("endpoint") || "";
  if (Object.prototype.hasOwnProperty.call(RETIRED_ENDPOINTS, named)) return named;
  const fromPath = url.pathname.replace(/^\/api\//, "").replace(/\/+$/, "");
  return Object.prototype.hasOwnProperty.call(RETIRED_ENDPOINTS, fromPath) ? fromPath : "";
}

function sendGone(request, response, detail) {
  if (handleOptions(request, response, ["OPTIONS"])) return;
  sendJson(response, 410, {
    ok: false,
    error: detail || GENERIC_DETAIL,
    retired: "Phase 021 moved business data onto the device. This endpoint no longer exists.",
  });
}

module.exports = { GENERIC_DETAIL, RETIRED_ENDPOINTS, retiredEndpointFor, sendGone };
