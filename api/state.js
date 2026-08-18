// Retired by Phase 021. Business state lives on the device; there is no
// server copy to read or write. Answers 410 through Release A so a stale
// client stops trying, and is deleted in Release B.
const { sendGone } = require("./_gone");

module.exports = async function handler(request, response) {
  sendGone(request, response, "Business data is stored on your device and is no longer synced to the server.");
};
