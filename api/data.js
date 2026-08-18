// Retired by Phase 021. Export became a local file download (there is no
// server copy of business data to export), and workspace deletion becomes
// account/store deletion against the identity tables in step 6. Answers 410
// in the meantime rather than pretending to work against the legacy
// document store, which the row-based identity plane no longer writes.
const { sendGone } = require("./_gone");

module.exports = async function handler(request, response) {
  sendGone(request, response, "Export and reset now happen on your device, in Settings.");
};
