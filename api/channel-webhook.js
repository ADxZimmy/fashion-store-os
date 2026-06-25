const { normalizeWebhookPayload, verifyWebhookChallenge, verifyWebhookSignature } = require("./_channel_webhook");
const { appendInboundMessage, normalizeChannelMessages } = require("./_inbound");
const { handleError, handleOptions, readRawBody, sendJson, sendMethodNotAllowed } = require("./_response");
const { getDocument, setDocument } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "POST", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;

  try {
    if (request.method === "GET") {
      const url = new URL(request.url, `https://${request.headers.host || "localhost"}`);
      const challenge = verifyWebhookChallenge(url.searchParams, process.env.CHANNEL_WEBHOOK_VERIFY_TOKEN || "");
      if (challenge !== null) {
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(challenge);
        return;
      }

      const result = await getDocument("state");
      sendJson(response, 200, {
        ok: true,
        messages: normalizeChannelMessages(result.value?.channelMessages),
        exists: result.exists,
      });
      return;
    }

    if (request.method === "POST") {
      const rawBody = await readRawBody(request);
      verifyWebhookSignature(rawBody, process.env.CHANNEL_WEBHOOK_SECRET || "", request.headers["x-hub-signature-256"] || "");

      let payload;
      try {
        payload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
      } catch (error) {
        error.statusCode = 400;
        error.message = "Invalid JSON body";
        throw error;
      }

      const messages = normalizeWebhookPayload(payload);
      const result = await getDocument("state");
      let nextState = result.value || {};
      const accepted = [];

      for (const message of messages) {
        const next = appendInboundMessage(nextState, message);
        nextState = next.state;
        accepted.push(next.message);
      }

      if (accepted.length) {
        await setDocument("state", nextState);
      }

      sendJson(response, accepted.length ? 201 : 202, {
        ok: true,
        accepted: accepted.length,
        messages: accepted,
      });
      return;
    }

    sendMethodNotAllowed(response, methods);
  } catch (error) {
    handleError(response, error);
  }
};
