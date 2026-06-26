const { appendWebhookMessages } = require("./_channel_intake");
const { normalizeWebhookPayload, requireWebhookSignatureConfig, verifyWebhookChallenge, verifyWebhookSignature } = require("./_channel_webhook");
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

      sendJson(response, 200, {
        ok: true,
        accepts: "POST",
        verification: "Send hub.challenge and matching verify token to complete provider setup.",
      });
      return;
    }

    if (request.method === "POST") {
      const rawBody = await readRawBody(request);
      const secret = process.env.CHANNEL_WEBHOOK_SECRET || "";
      requireWebhookSignatureConfig(secret, process.env.CHANNEL_WEBHOOK_REQUIRE_SIGNATURE === "1");
      verifyWebhookSignature(
        rawBody,
        secret,
        request.headers["x-hub-signature-256"] || request.headers["x-fashion-signature"] || "",
      );

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
      const intake = appendWebhookMessages(result.value || {}, messages, {
        maxMessages: process.env.CHANNEL_WEBHOOK_MAX_MESSAGES,
      });

      if (intake.accepted.length || intake.duplicates.length || intake.rejected.length || intake.overflow) {
        await setDocument("state", intake.state);
      }

      sendJson(response, intake.accepted.length ? 201 : 202, {
        ok: true,
        accepted: intake.accepted.length,
        duplicates: intake.duplicates.length,
        rejected: intake.rejected.length + intake.overflow,
        messages: intake.accepted,
      });
      return;
    }

    sendMethodNotAllowed(response, methods);
  } catch (error) {
    handleError(response, error);
  }
};
