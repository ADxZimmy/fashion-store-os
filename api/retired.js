// The four endpoints Phase 021 retired (/api/state, /api/data, /api/inbound,
// /api/workspace-code) answer 410 from this one function: vercel.json
// rewrites each path here. Without a framework every file in api/ is its own
// function, the Hobby plan allows 12 per deployment, and four one-line stubs
// pushed Release A to 13. Release B deletes this file and the rewrites.
const { RETIRED_ENDPOINTS, retiredEndpointFor, sendGone } = require("./_gone");

module.exports = async function handler(request, response) {
  sendGone(request, response, RETIRED_ENDPOINTS[retiredEndpointFor(request)]);
};
