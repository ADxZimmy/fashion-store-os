const { appendInboundMessage, normalizeChannelMessage, normalizeChannelMessages } = require("./_inbound");

const DEFAULT_WEBHOOK_MAX_MESSAGES = 25;

function appendWebhookMessages(state = {}, messages = [], options = {}) {
  const maxMessages = maxMessageCount(options.maxMessages);
  let nextState = {
    ...state,
    channelMessages: normalizeChannelMessages(state.channelMessages),
    channelDeliveryEvents: normalizeChannelDeliveryEvents(state.channelDeliveryEvents),
  };
  const accepted = [];
  const duplicates = [];
  const rejected = [];
  const seen = new Set(nextState.channelMessages.map(messageFingerprint));

  for (const message of Array.isArray(messages) ? messages.slice(0, maxMessages) : []) {
    const normalized = normalizeChannelMessage(message);
    const fingerprint = messageFingerprint(normalized);
    if (seen.has(fingerprint)) {
      duplicates.push(normalized);
      nextState = appendChannelDeliveryEvent(nextState, normalized, "duplicate", "Message already exists in intake queue");
      continue;
    }

    try {
      const next = appendInboundMessage(nextState, normalized);
      nextState = appendChannelDeliveryEvent(next.state, next.message, "accepted", "Message accepted into intake queue");
      accepted.push(next.message);
      seen.add(fingerprint);
    } catch (error) {
      rejected.push({ message: normalized, reason: error.message || "Message rejected" });
      nextState = appendChannelDeliveryEvent(nextState, normalized, "rejected", error.message || "Message rejected");
    }
  }

  const overflow = Math.max(0, (Array.isArray(messages) ? messages.length : 0) - maxMessages);
  if (overflow) {
    nextState = appendChannelDeliveryEvent(nextState, {}, "rejected", `${overflow} messages skipped by webhook batch limit`);
  }

  return { state: nextState, accepted, duplicates, rejected, overflow };
}

function appendChannelDeliveryEvent(state = {}, message = {}, status, detail) {
  const events = normalizeChannelDeliveryEvents(state.channelDeliveryEvents);
  events.unshift({
    id: `delivery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    status,
    detail,
    channel: message.channel || "",
    providerMessageId: message.providerMessageId || message.id || "",
    contact: message.contact || "",
    createdAt: new Date().toISOString(),
  });
  return {
    ...state,
    channelDeliveryEvents: events.slice(0, 200),
  };
}

function normalizeChannelDeliveryEvents(events = []) {
  return (Array.isArray(events) ? events : [])
    .map((event) => ({
      id: String(event.id || "").trim() || `delivery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      status: String(event.status || "accepted").trim(),
      detail: String(event.detail || "").trim(),
      channel: String(event.channel || "").trim(),
      providerMessageId: String(event.providerMessageId || "").trim(),
      contact: String(event.contact || "").trim(),
      createdAt: String(event.createdAt || "").trim() || new Date().toISOString(),
    }))
    .filter((event) => event.status)
    .slice(0, 200);
}

function messageFingerprint(message = {}) {
  const providerId = clean(message.providerMessageId || message.id);
  if (providerId) {
    return `${clean(message.channel).toLowerCase()}|${providerId.toLowerCase()}`;
  }
  return [
    clean(message.channel).toLowerCase(),
    clean(message.contact).toLowerCase(),
    clean(message.message).toLowerCase(),
    clean(message.receivedAt).slice(0, 10),
  ].join("|");
}

function maxMessageCount(value) {
  const number = Number(value || DEFAULT_WEBHOOK_MAX_MESSAGES);
  if (!Number.isFinite(number) || number < 1) return DEFAULT_WEBHOOK_MAX_MESSAGES;
  return Math.min(Math.floor(number), 100);
}

function clean(value) {
  return String(value ?? "").trim();
}

module.exports = {
  appendWebhookMessages,
  normalizeChannelDeliveryEvents,
};
