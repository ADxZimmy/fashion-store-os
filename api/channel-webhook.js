// Provider webhook intake, rewritten for Phase 021 step 5.
//
// The handshake and HMAC verification are unchanged -- those were never the
// problem. What changed is the landing spot: messages used to be written into
// a per-workspace state document, which under local-first does not exist.
// They now go to the transit inbox, where a signed-in device drains them.
const { acceptMessages } = require("./_inbox");
const { normalizeWebhookPayload, requireWebhookSignatureConfig, verifyWebhookChallenge, verifyWebhookSignature } = require("./_channel_webhook");
const { db } = require("./_db");
const { handleError, handleOptions, readRawBody, sendJson, sendMethodNotAllowed } = require("./_response");

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
      const intake = await acceptMessages(db, messages, { maxMessages: process.env.CHANNEL_WEBHOOK_MAX_MESSAGES });

      // 201 when something new was queued, 202 when the delivery was
      // understood but added nothing (all duplicates, or all unroutable).
      // Providers treat both as success and stop retrying, which is correct:
      // a retry would not change the outcome.
      sendJson(response, intake.accepted.length ? 201 : 202, {
        ok: true,
        accepted: intake.accepted.length,
        duplicates: intake.duplicates.length,
        rejected: intake.rejected.length + intake.overflow,
      });
      return;
    }

    sendMethodNotAllowed(response, methods);
  } catch (error) {
    handleError(response, error);
  }
};
