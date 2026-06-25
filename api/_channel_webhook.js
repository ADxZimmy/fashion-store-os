const crypto = require("crypto");

function normalizeWebhookPayload(payload = {}) {
  const directMessages = directPayloads(payload).map((message) => normalizeDirectMessage(message, payload.provider || payload.source));
  const metaMessages = normalizeMetaMessages(payload);
  return [...directMessages, ...metaMessages].filter((message) => message.senderName || message.contact || message.message || message.desiredStyle);
}

function verifyWebhookSignature(rawBody, secret, signatureHeader) {
  const normalizedSecret = clean(secret);
  if (!normalizedSecret) {
    return { required: false, verified: false };
  }

  const provided = clean(signatureHeader).replace(/^sha256=/i, "");
  if (!provided) {
    throwWebhookError("Webhook signature is required.", 401);
  }

  const expected = crypto.createHmac("sha256", normalizedSecret).update(rawBody).digest("hex");
  const providedBuffer = Buffer.from(provided, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throwWebhookError("Webhook signature is invalid.", 401);
  }

  return { required: true, verified: true };
}

function verifyWebhookChallenge(searchParams, verifyToken) {
  const mode = searchParams.get("hub.mode") || searchParams.get("mode") || "";
  const token = searchParams.get("hub.verify_token") || searchParams.get("verify_token") || "";
  const challenge = searchParams.get("hub.challenge") || searchParams.get("challenge") || "";

  if (!challenge) return null;
  if (clean(verifyToken) && token !== verifyToken) {
    throwWebhookError("Webhook verification token is invalid.", 403);
  }
  if (mode && mode !== "subscribe") {
    throwWebhookError("Webhook verification mode is invalid.", 400);
  }
  return challenge;
}

function directPayloads(payload) {
  if (Array.isArray(payload.messages)) {
    return payload.messages.filter(looksLikeDirectMessage);
  }
  if (looksLikeDirectMessage(payload)) {
    return [payload];
  }
  return [];
}

function looksLikeDirectMessage(value) {
  return Boolean(value && typeof value === "object" && (
    value.senderName ||
    value.clientName ||
    value.contact ||
    value.phone ||
    value.handle ||
    value.email ||
    value.message ||
    value.body ||
    value.desiredStyle ||
    value.garment ||
    value.style
  ));
}

function normalizeDirectMessage(message, provider) {
  const channel = channelFrom(message.channel || provider);
  const notes = clean(message.notes);
  return {
    id: clean(message.id),
    channel,
    senderName: clean(message.senderName || message.clientName || message.name),
    contact: clean(message.contact || message.phone || message.handle || message.email),
    message: clean(message.message || message.body || message.text),
    desiredStyle: clean(message.desiredStyle || message.garment || message.style),
    occasion: clean(message.occasion),
    deadline: clean(message.deadline),
    budget: numberValue(message.budget),
    followUpStatus: clean(message.followUpStatus) || "Needs reply",
    routingStatus: clean(message.routingStatus) || "New",
    notes: appendNote(notes, `Webhook source: ${channel}`),
    receivedAt: clean(message.receivedAt) || new Date().toISOString(),
  };
}

function normalizeMetaMessages(payload) {
  const messages = [];
  const objectName = clean(payload.object).toLowerCase();

  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    for (const event of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const text = clean(event.message?.text || event.postback?.title || event.postback?.payload);
      if (!text) continue;
      messages.push({
        id: clean(event.message?.mid || event.id),
        channel: "Instagram",
        senderName: clean(event.sender?.username || event.sender?.id),
        contact: clean(event.sender?.id),
        message: text,
        desiredStyle: "",
        occasion: "",
        deadline: "",
        budget: 0,
        followUpStatus: "Needs reply",
        routingStatus: "New",
        notes: appendNote("", `Webhook source: Meta ${objectName || "messaging"}`),
        receivedAt: timestampToIso(event.timestamp),
      });
    }

    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      const value = change.value || {};
      const contactsById = contactMap(value.contacts);
      const channel = channelFrom(value.messaging_product || objectName || change.field);

      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const senderId = clean(message.from || message.sender?.id || message.recipient_id);
        const contact = contactsById.get(senderId) || {};
        const text = metaMessageText(message);
        if (!text) continue;
        messages.push({
          id: clean(message.id || message.mid),
          channel,
          senderName: clean(contact.name || message.sender?.username || senderId),
          contact: clean(contact.contact || senderId),
          message: text,
          desiredStyle: "",
          occasion: "",
          deadline: "",
          budget: 0,
          followUpStatus: "Needs reply",
          routingStatus: "New",
          notes: appendNote("", `Webhook source: Meta ${change.field || value.messaging_product || objectName || "message"}`),
          receivedAt: timestampToIso(message.timestamp),
        });
      }
    }
  }

  return messages;
}

function metaMessageText(message = {}) {
  return clean(
    message.text?.body ||
      message.text ||
      message.button?.text ||
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      message.image?.caption ||
      message.video?.caption ||
      message.document?.caption ||
      message.reaction?.emoji ||
      message.type,
  );
}

function contactMap(contacts = []) {
  const map = new Map();
  for (const contact of Array.isArray(contacts) ? contacts : []) {
    const id = clean(contact.wa_id || contact.id || contact.phone);
    if (!id) continue;
    map.set(id, {
      name: clean(contact.profile?.name || contact.name),
      contact: clean(contact.wa_id || contact.phone || contact.id),
    });
  }
  return map;
}

function channelFrom(value) {
  const text = clean(value).toLowerCase();
  if (text.includes("instagram") || text.includes("ig")) return "Instagram";
  if (text.includes("web")) return "Website";
  if (text.includes("referral")) return "Referral";
  if (text.includes("walk")) return "Walk-in";
  return "WhatsApp";
}

function timestampToIso(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return new Date().toISOString();
  const milliseconds = number > 9999999999 ? number : number * 1000;
  return new Date(milliseconds).toISOString();
}

function appendNote(existing, note) {
  return [clean(existing), clean(note)].filter(Boolean).join(" | ");
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function throwWebhookError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function clean(value) {
  return String(value ?? "").trim();
}

module.exports = {
  normalizeWebhookPayload,
  verifyWebhookChallenge,
  verifyWebhookSignature,
};
