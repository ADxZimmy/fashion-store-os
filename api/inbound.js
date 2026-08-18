// Retired by Phase 021. The app's manual channel intake was always
// client-side (this endpoint had no frontend caller); provider messages move
// to the transit inbox in step 5. Deleted in Release B.
const { sendGone } = require("./_gone");

module.exports = async function handler(request, response) {
  sendGone(request, response, "Channel messages are stored on your device. Use the app's intake form.");
};
