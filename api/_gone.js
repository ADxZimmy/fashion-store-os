// Phase 021 Release A: endpoints retired by the local-first pivot answer 410
// rather than disappearing, so a browser still running the pre-pivot bundle
// gets a definite, non-retryable answer instead of a 404 that reads like a
// routing fault. Release B deletes these files outright.
const { handleOptions, sendJson } = require("./_response");

function sendGone(request, response, detail) {
  if (handleOptions(request, response, ["OPTIONS"])) return;
  sendJson(response, 410, {
    ok: false,
    error: detail,
    retired: "Phase 021 moved business data onto the device. This endpoint no longer exists.",
  });
}

module.exports = { sendGone };
