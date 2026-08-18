// Retired by Phase 021. Workspace codes existed to move a device-bound
// workspace id between browsers; accounts are global now, so signing in on
// the second device replaces the whole mechanism. Deleted in Release B along
// with the fashion_store_os_workspace_codes table.
const { sendGone } = require("./_gone");

module.exports = async function handler(request, response) {
  sendGone(request, response, "Workspace codes are retired. Sign in with your email and password on the other device.");
};
