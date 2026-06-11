const BODY_LIMIT = 1024 * 1024 * 5;

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return null;

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    error.statusCode = 400;
    error.message = "Invalid JSON body";
    throw error;
  }
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function sendMethodNotAllowed(response, methods) {
  response.setHeader("Allow", methods.join(", "));
  sendJson(response, 405, { error: "Method not allowed" });
}

function handleOptions(request, response, methods) {
  if (request.method !== "OPTIONS") return false;
  response.statusCode = 204;
  response.setHeader("Allow", methods.join(", "));
  response.end();
  return true;
}

function handleError(response, error) {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 503 ? error.message : statusCode >= 500 ? "Internal server error" : error.message;
  console.error(error);
  sendJson(response, statusCode, { error: message });
}

module.exports = {
  handleError,
  handleOptions,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
};
