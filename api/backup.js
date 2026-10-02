// Encrypted backup endpoint. GET returns the store's blob, PUT replaces it,
// DELETE removes it. The payload is opaque ciphertext in every direction; see
// api/_backup.js for why this is the one exception to "identity only".
const { readBackup, removeBackup, writeBackup } = require("./_backup");
const { db } = require("./_db");
const { handleError, handleOptions, readJsonBody, sendJson, sendMethodNotAllowed } = require("./_response");

module.exports = async function handler(request, response) {
  const methods = ["GET", "PUT", "DELETE", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;

  try {
    if (request.method === "GET") {
      const result = await readBackup(db, request);
      sendJson(response, result.status, result.payload);
      return;
    }
    if (request.method === "PUT") {
      const body = (await readJsonBody(request)) || {};
      const result = await writeBackup(db, request, body);
      sendJson(response, result.status, result.payload);
      return;
    }
    if (request.method === "DELETE") {
      const result = await removeBackup(db, request);
      sendJson(response, result.status, result.payload);
      return;
    }
    sendMethodNotAllowed(response, methods);
  } catch (error) {
    handleError(response, error);
  }
};
