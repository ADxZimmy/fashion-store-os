const CHANNEL_SOURCES = ["WhatsApp", "Instagram", "Website", "Referral", "Walk-in"];
const FOLLOW_UP_STATUSES = ["Needs reply", "Awaiting details", "Quote sent", "Follow-up scheduled", "Closed"];
const ROUTING_STATUSES = ["New", "Routed to Inquiry", "Archived"];
const CONSENT_STATUSES = ["Unknown", "Opted in", "Opted out"];

function appendInboundMessage(state = {}, payload = {}) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const nextState = {
    ...state,
    channelMessages: normalizeChannelMessages(state.channelMessages),
  };
  const message = createInboundMessage(safePayload);
  nextState.channelMessages.unshift(message);
  return { state: nextState, message };
}

function createInboundMessage(payload = {}) {
  const message = normalizeChannelMessage({
    ...payload,
    id: clean(payload.id) || uid("msg"),
    routingStatus: payload.routingStatus || "New",
    receivedAt: payload.receivedAt || new Date().toISOString(),
  });

  if (!message.senderName && !message.contact) {
    const error = new Error("Sender name or contact is required");
    error.statusCode = 400;
    throw error;
  }

  if (!message.message && !message.desiredStyle) {
    const error = new Error("Message or desired garment is required");
    error.statusCode = 400;
    throw error;
  }

  return message;
}

function normalizeChannelMessages(messages = []) {
  return Array.isArray(messages)
    ? messages.map(normalizeChannelMessage).filter((message) => message.senderName || message.contact || message.message || message.desiredStyle)
    : [];
}

function normalizeChannelMessage(message = {}) {
  return {
    id: clean(message.id) || uid("msg"),
    channel: normalizeChoice(message.channel, CHANNEL_SOURCES, "WhatsApp"),
    senderName: clean(message.senderName || message.clientName || message.name),
    contact: clean(message.contact || message.phone || message.handle || message.email),
    message: clean(message.message || message.body),
    desiredStyle: clean(message.desiredStyle || message.garment || message.style),
    occasion: clean(message.occasion),
    deadline: clean(message.deadline),
    budget: numberValue(message.budget),
    followUpStatus: normalizeChoice(message.followUpStatus, FOLLOW_UP_STATUSES, "Needs reply"),
    routingStatus: normalizeChoice(message.routingStatus, ROUTING_STATUSES, "New"),
    notes: clean(message.notes),
    consentStatus: normalizeChoice(message.consentStatus || message.consent, CONSENT_STATUSES, "Unknown"),
    providerMessageId: clean(message.providerMessageId || message.providerId || message.externalId),
    deliveryStatus: clean(message.deliveryStatus) || "received",
    inquiryId: clean(message.inquiryId),
    receivedAt: clean(message.receivedAt) || new Date().toISOString(),
  };
}

function normalizeChoice(value, options, fallback) {
  const cleaned = clean(value);
  return options.find((option) => option.toLowerCase() === cleaned.toLowerCase()) || fallback;
}

function clean(value) {
  return String(value ?? "").trim();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

module.exports = {
  appendInboundMessage,
  createInboundMessage,
  normalizeChannelMessage,
  normalizeChannelMessages,
};
