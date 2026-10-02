// Transit inbox drain. GET returns the store's undelivered provider messages;
// POST acknowledges the ones the device has written to its own storage, which
// deletes them server-side. Two calls rather than one on purpose -- see
// api/_inbox.js for why duplicating beats losing.
const { acknowledgeMessages, pullMessages } = require("./_inbox");
const { db } = require("./_db");
const { handleError, handleOptions, readJsonBody, sendJson, sendMethodNotAllowed } = require("./_response");

module.exports = async function handler(request, response) {
  const methods = ["GET", "POST", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;

  try {
    if (request.method === "GET") {
      const result = await pullMessages(db, request);
      sendJson(response, result.status, result.payload);
      return;
    }
    if (request.method === "POST") {
      const body = (await readJsonBody(request)) || {};
      const result = await acknowledgeMessages(db, request, body);
      sendJson(response, result.status, result.payload);
      return;
    }
    sendMethodNotAllowed(response, methods);
  } catch (error) {
    handleError(response, error);
  }
};
