const STORAGE_KEY = "fashion-studio-os-state-v1";
const VIEW_KEY = "fashion-studio-os-view-v1";
const AUTH_KEY = "fashion-studio-os-auth-v1";
const WORKSPACE_KEY = "fashion-studio-os-workspace-v1";
const API_BOOTSTRAP_PATH = "/api/bootstrap";
const API_STATE_PATH = "/api/state";
const API_SESSION_PATH = "/api/session";
const API_DATA_PATH = "/api/data";
const MIN_PASSWORD_LENGTH = 8;
const TEAM_LIMIT = 25;
let deviceWorkspaceId = "";

const app = document.getElementById("app");
const toast = document.getElementById("toast");

const defaultTheme = {
  primary: "#F5F1E8",
  accent: "#C45A2A",
  sidebar: "#050505",
  success: "#3F4A2D",
  warning: "#C45A2A",
  background: "#050505",
  surface: "#111111",
  surfaceElevated: "#1A1A1A",
  textPrimary: "#F5F1E8",
  textMuted: "#B8B8B8",
  border: "rgba(245, 241, 232, 0.12)",
  sand: "#D8C3A5",
  warmSurface: "#6F4A2F",
  backgroundMode: "dark",
};

const neutralTheme = {
  primary: "#2f6f73",
  accent: "#c9863a",
  sidebar: "#17323a",
  success: "#2f8f5b",
  warning: "#b7791f",
  background: "#f6f3ee",
  surface: "#ffffff",
  surfaceElevated: "#f1eee8",
  textPrimary: "#1d2327",
  textMuted: "#667176",
  border: "#dcd5ca",
  sand: "#f1eee8",
  warmSurface: "#e9dfd0",
  backgroundMode: "light",
};

const commonMeasurements = [
  "Shoulder",
  "Chest/Bust",
  "Waist",
  "Hip",
  "Neck",
  "Sleeve length",
  "Round sleeve/bicep",
  "Wrist",
  "Top length",
  "Shirt length",
  "Dress length",
  "Trouser length",
  "Inseam",
  "Thigh",
  "Knee",
  "Ankle",
  "Agbada length",
  "Cap/head measurement",
];

const inquiryStatuses = ["New", "Contacted", "Quoted", "Confirmed", "Declined", "Converted to Order"];
const channelSources = ["WhatsApp", "Instagram", "Website", "Referral", "Walk-in"];
const channelFollowUpStatuses = ["Needs reply", "Awaiting details", "Quote sent", "Follow-up scheduled", "Closed"];
const channelRoutingStatuses = ["New", "Routed to Inquiry", "Archived"];
const channelConsentStatuses = ["Unknown", "Opted in", "Opted out"];
const staffStatuses = ["active", "invited", "suspended"];
const orderFollowUpStatuses = ["No follow-up", "Deposit reminder", "Fitting reminder", "Collection reminder", "Closed"];
const paymentMethods = ["Cash", "Bank transfer", "POS/card", "Mobile money", "Other"];
const fittingTypes = ["Initial fitting", "First fitting", "Adjustment fitting", "Final fitting", "Pickup fitting"];
const fittingStatuses = ["Scheduled", "Completed", "Missed", "Rescheduled"];
const managerReviewStatuses = ["Not requested", "Review requested", "Changes requested", "Approved"];
const handoffMethods = ["Collection", "Delivery", "Dispatch rider", "Pickup by representative"];
const inventoryAdjustmentReasons = ["Restock", "Correction", "Damage", "Supplier return", "Manual count", "Other"];
const productionSteps = [
  "Consultation",
  "Measurement Taken",
  "Design Confirmed",
  "Materials Reserved",
  "Cutting",
  "Sewing",
  "First Fitting",
  "Adjustments",
  "Finishing",
  "Quality Check",
  "Ready",
  "Delivered/Collected",
];

const navItems = [
  ["dashboard", "dashboard", "Dashboard"],
  ["inquiries", "inquiries", "CRM Inbox"],
  ["clients", "clients", "Clients"],
  ["measurements", "measurements", "Measurements"],
  ["orders", "orders", "Garment Orders"],
  ["recipes", "recipes", "Style Recipes"],
  ["inventory", "inventory", "Material Reserve"],
  ["production", "production", "Production Flow"],
  ["reports", "reports", "Reports"],
  ["settings", "settings", "Settings"],
];

let state = loadState();
let auth = loadAuth();
let currentView = localStorage.getItem(VIEW_KEY) || "dashboard";
let authMode = auth.users.length ? "signin" : "signup";
let selectedClientId = state.clients[0]?.id || "";
let draftOrderStyleId = state.styles[0]?.id || "";
let modalState = null;
let mobileNavOpen = false;
let toastTimer;
let backendReady = false;
let storageMode = "loading";
let storageMessage = "Getting your workspace ready";
let syncFailureAnnounced = false;
let lastInviteResult = null;
// Recovery codes are returned by the server exactly once. Hold the value only
// long enough to show it, then clear it — it is never persisted client-side.
let lastRecoveryResult = null;

renderLoading();
initializeApp();

async function initializeApp() {
  const snapshot = await loadBackendSnapshot();

  if (snapshot) {
    const localStateExists = Boolean(localStorage.getItem(STORAGE_KEY));

    // The server session (HttpOnly cookie) is the single source of truth for
    // auth. A stale local session pointer must never keep the app "signed in".
    const authenticated = Boolean(snapshot.authenticated);
    state = snapshot.stateLocked || !authenticated
      ? createSeedState()
      : normalizeState(snapshot.state || loadState());
    auth = normalizeAuth(snapshot.auth || loadAuth());
    if (!authenticated) {
      auth.sessionUserId = "";
    }
    if (snapshot.stateLocked || !authenticated) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      persistLocalState();
    }
    persistLocalAuth();

    if (authenticated && !snapshot.stateExists && localStateExists) {
      void saveBackendData(API_STATE_PATH, state);
    }
  }

  authMode = auth.users.length ? "signin" : "signup";
  selectedClientId = state.clients[0]?.id || "";
  draftOrderStyleId = state.styles[0]?.id || "";
  if (isDevHost()) {
    window.loadStudioDemo = loadStudioDemo;
  }
  render();
}

// Per-device tenancy: each browser keeps its own random workspace id and sends
// it on every API call (x-workspace-id), so each device gets an isolated cloud
// workspace and devices never share data.
function getWorkspaceId() {
  if (deviceWorkspaceId) return deviceWorkspaceId;
  try {
    const existing = localStorage.getItem(WORKSPACE_KEY);
    if (existing && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(existing)) {
      deviceWorkspaceId = existing;
      return deviceWorkspaceId;
    }
  } catch (error) {
    // localStorage unavailable; fall back to a volatile per-session id
  }
  deviceWorkspaceId = generateWorkspaceId();
  try {
    localStorage.setItem(WORKSPACE_KEY, deviceWorkspaceId);
  } catch (error) {
    // ignore persistence failure; the volatile id still isolates this session
  }
  return deviceWorkspaceId;
}

function generateWorkspaceId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `ws-${window.crypto.randomUUID()}`;
    }
  } catch (error) {
    // fall through to a Math.random id
  }
  let random = "";
  while (random.length < 32) {
    random += Math.random().toString(36).slice(2);
  }
  return `ws-${random.slice(0, 40)}`;
}

function apiHeaders(extra = {}) {
  return { Accept: "application/json", "x-workspace-id": getWorkspaceId(), ...extra };
}

async function loadBackendSnapshot() {
  if (window.location.protocol === "file:") {
    storageMode = "local";
    storageMessage = "Saved on this device";
    return null;
  }

  try {
    const response = await fetch(API_BOOTSTRAP_PATH, {
      headers: apiHeaders(),
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }
    const snapshot = await response.json();
    backendReady = true;
    storageMode = "server";
    storageMessage = "All changes saved";
    syncFailureAnnounced = false;
    return snapshot;
  } catch (error) {
    console.warn("Fashion Store OS backend unavailable. Using local browser storage.", error);
    backendReady = false;
    storageMode = "local";
    storageMessage = "Saved on this device";
    return null;
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return normalizeState(JSON.parse(saved));
    }
  } catch (error) {
    console.warn("Could not read saved Fashion Studio OS state.", error);
  }
  return createSeedState();
}

function loadAuth() {
  try {
    const saved = localStorage.getItem(AUTH_KEY);
    if (saved) {
      return normalizeAuth(JSON.parse(saved));
    }
  } catch (error) {
    console.warn("Could not read saved Studio OS access data.", error);
  }
  return normalizeAuth();
}

function normalizeAuth(nextAuth = {}) {
  const users = Array.isArray(nextAuth.users)
    ? nextAuth.users
        .map((user) => ({
          id: user.id || uid("user"),
          name: clean(user.name),
          email: clean(user.email).toLowerCase(),
          password: String(user.password || ""),
          role: user.role === "staff" ? "staff" : "manager",
          status: user.role === "staff" ? normalizeChoice(user.status, staffStatuses, "active") : "active",
          access: normalizeAccess(user.access),
          createdAt: user.createdAt || isoDate(0),
          updatedAt: user.updatedAt || user.createdAt || isoDate(0),
          invitedAt: clean(user.invitedAt),
          inviteExpiresAt: clean(user.inviteExpiresAt),
          inviteAcceptedAt: clean(user.inviteAcceptedAt),
          suspendedAt: clean(user.suspendedAt),
          lastSignInAt: clean(user.lastSignInAt),
          // Metadata only; the hash never reaches the client. Listed here for
          // the same reason as in the server normalizer — this rebuilds from an
          // explicit field list, so anything omitted is dropped.
          recoveryIssuedAt: clean(user.recoveryIssuedAt),
          recoveryRedeemedAt: clean(user.recoveryRedeemedAt),
        }))
        .filter((user) => user.email || nextAuth.serverManaged)
    : [];
  const sessionUserId = users.some((user) => user.id === nextAuth.sessionUserId) ? nextAuth.sessionUserId : "";
  return {
    users,
    auditEvents: normalizeAuditEvents(nextAuth.auditEvents),
    sessionUserId,
    serverManaged: Boolean(nextAuth.serverManaged),
  };
}

function normalizeState(nextState = {}) {
  const seed = createSeedState();
  const hasProfile = Object.prototype.hasOwnProperty.call(nextState, "profile");
  const hasChannelMessages = Object.prototype.hasOwnProperty.call(nextState, "channelMessages");
  return {
    ...seed,
    ...nextState,
    profile: hasProfile && nextState.profile ? normalizeProfile(nextState.profile, createDefaultProfile()) : null,
    clients: Array.isArray(nextState.clients) ? nextState.clients : seed.clients,
    inquiries: Array.isArray(nextState.inquiries) ? nextState.inquiries : seed.inquiries,
    channelMessages: Array.isArray(nextState.channelMessages)
      ? normalizeChannelMessages(nextState.channelMessages)
      : hasChannelMessages || hasProfile ? [] : seed.channelMessages,
    channelDeliveryEvents: Array.isArray(nextState.channelDeliveryEvents) ? normalizeChannelDeliveryEvents(nextState.channelDeliveryEvents) : [],
    styles: Array.isArray(nextState.styles) ? nextState.styles : seed.styles,
    inventory: Array.isArray(nextState.inventory) ? nextState.inventory : seed.inventory,
    inventoryAdjustments: Array.isArray(nextState.inventoryAdjustments) ? normalizeInventoryAdjustments(nextState.inventoryAdjustments) : [],
    orders: Array.isArray(nextState.orders) ? nextState.orders.map(normalizeOrder) : seed.orders.map(normalizeOrder),
    usageRecords: Array.isArray(nextState.usageRecords) ? nextState.usageRecords : seed.usageRecords,
  };
}

function normalizeChannelMessages(messages = []) {
  return messages.map(normalizeChannelMessage).filter((message) => message.senderName || message.contact || message.message || message.desiredStyle);
}

function normalizeChannelMessage(message = {}) {
  const channel = normalizeChoice(message.channel, channelSources, "WhatsApp");
  const routingStatus = normalizeChoice(message.routingStatus, channelRoutingStatuses, "New");
  const followUpStatus = normalizeChoice(message.followUpStatus, channelFollowUpStatuses, "Needs reply");
  return {
    id: clean(message.id) || uid("msg"),
    channel,
    senderName: clean(message.senderName || message.clientName || message.name),
    contact: clean(message.contact || message.phone || message.handle || message.email),
    message: clean(message.message || message.body || ""),
    desiredStyle: clean(message.desiredStyle || message.garment || message.style),
    occasion: clean(message.occasion),
    deadline: clean(message.deadline),
    budget: numberValue(message.budget),
    followUpStatus,
    routingStatus,
    notes: clean(message.notes),
    consentStatus: normalizeChoice(message.consentStatus || message.consent, channelConsentStatuses, "Unknown"),
    providerMessageId: clean(message.providerMessageId || message.providerId || message.externalId),
    deliveryStatus: clean(message.deliveryStatus) || "received",
    inquiryId: clean(message.inquiryId),
    receivedAt: clean(message.receivedAt) || isoDate(0),
  };
}

function normalizeAuditEvents(events = []) {
  return (Array.isArray(events) ? events : [])
    .map((event) => ({
      id: clean(event.id) || uid("audit"),
      type: clean(event.type) || "account.event",
      actorEmail: clean(event.actorEmail).toLowerCase(),
      targetEmail: clean(event.targetEmail).toLowerCase(),
      detail: clean(event.detail),
      createdAt: clean(event.createdAt) || isoDate(0),
    }))
    .filter((event) => event.type)
    .slice(-200);
}

function normalizeChannelDeliveryEvents(events = []) {
  return (Array.isArray(events) ? events : [])
    .map((event) => ({
      id: clean(event.id) || uid("delivery"),
      status: clean(event.status) || "accepted",
      detail: clean(event.detail),
      channel: clean(event.channel),
      providerMessageId: clean(event.providerMessageId),
      contact: clean(event.contact),
      createdAt: clean(event.createdAt) || isoDate(0),
    }))
    .filter((event) => event.status)
    .slice(0, 200);
}

function normalizeOrder(order = {}) {
  const id = clean(order.id) || uid("ord");
  const quote = numberValue(order.quote);
  const legacyDeposit = numberValue(order.deposit);
  const paymentRecords = normalizePaymentRecords(order.paymentRecords, { orderId: id, legacyDeposit });
  const paymentTotal = paymentRecords.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  return {
    ...order,
    id,
    clientId: clean(order.clientId),
    styleId: clean(order.styleId),
    fabricId: clean(order.fabricId),
    modifiers: Array.isArray(order.modifiers) ? order.modifiers.map(clean).filter(Boolean) : [],
    status: clean(order.status) || "Quoted",
    productionStep: normalizeChoice(order.productionStep, productionSteps, "Consultation"),
    deadline: clean(order.deadline),
    fittingDate: clean(order.fittingDate),
    quote,
    deposit: round2(paymentTotal || legacyDeposit),
    assignedTo: clean(order.assignedTo),
    notes: clean(order.notes),
    estimatedMaterials: Array.isArray(order.estimatedMaterials) ? order.estimatedMaterials : [],
    reservedMaterials: Array.isArray(order.reservedMaterials) ? order.reservedMaterials : [],
    actualMaterials: Array.isArray(order.actualMaterials) ? order.actualMaterials : [],
    stockWarnings: Array.isArray(order.stockWarnings) ? order.stockWarnings.map(clean).filter(Boolean) : [],
    paymentRecords,
    fittingEvents: normalizeFittingEvents(order.fittingEvents, order.fittingDate),
    followUpStatus: normalizeChoice(order.followUpStatus, orderFollowUpStatuses, order.status === "Completed" ? "Closed" : "No follow-up"),
    followUpNote: clean(order.followUpNote),
    followUpAt: clean(order.followUpAt),
    managerReview: normalizeManagerReview(order.managerReview),
    handoff: normalizeHandoff(order.handoff),
    activity: normalizeOrderActivity(order.activity),
    createdAt: clean(order.createdAt) || isoDate(0),
    completedAt: clean(order.completedAt),
  };
}

function normalizePaymentRecords(records = [], options = {}) {
  const normalized = (Array.isArray(records) ? records : [])
    .map((payment) => ({
      id: clean(payment.id) || uid("pay"),
      amount: numberValue(payment.amount),
      method: normalizeChoice(payment.method, paymentMethods, "Cash"),
      receivedAt: clean(payment.receivedAt) || isoDate(0),
      note: clean(payment.note),
      recordedBy: clean(payment.recordedBy),
    }))
    .filter((payment) => payment.amount > 0);

  if (!normalized.length && options.legacyDeposit > 0) {
    normalized.push({
      id: `pay-${options.orderId || "order"}-deposit`,
      amount: round2(options.legacyDeposit),
      method: "Cash",
      receivedAt: isoDate(0),
      note: "Initial deposit",
      recordedBy: "",
    });
  }

  return normalized.slice(0, 50);
}

function normalizeFittingEvents(events = [], fallbackDate = "") {
  const normalized = (Array.isArray(events) ? events : [])
    .map((event) => ({
      id: clean(event.id) || uid("fit"),
      type: normalizeChoice(event.type, fittingTypes, "First fitting"),
      date: clean(event.date),
      status: normalizeChoice(event.status, fittingStatuses, "Scheduled"),
      assignedTo: clean(event.assignedTo),
      notes: clean(event.notes),
      completedAt: clean(event.completedAt),
      createdAt: clean(event.createdAt) || isoDate(0),
    }))
    .filter((event) => event.date);

  if (!normalized.length && fallbackDate) {
    normalized.push({
      id: `fit-${fallbackDate}`,
      type: "First fitting",
      date: clean(fallbackDate),
      status: "Scheduled",
      assignedTo: "",
      notes: "",
      completedAt: "",
      createdAt: isoDate(0),
    });
  }

  return normalized.slice(0, 30);
}

function normalizeManagerReview(review = {}) {
  return {
    status: normalizeChoice(review.status, managerReviewStatuses, "Not requested"),
    requestedAt: clean(review.requestedAt),
    requestedBy: clean(review.requestedBy),
    decisionAt: clean(review.decisionAt),
    decisionBy: clean(review.decisionBy),
    note: clean(review.note),
  };
}

function normalizeHandoff(handoff = {}) {
  if (!handoff || typeof handoff !== "object" || !clean(handoff.completedAt)) return null;
  return {
    method: normalizeChoice(handoff.method, handoffMethods, "Collection"),
    recipient: clean(handoff.recipient),
    completedAt: clean(handoff.completedAt),
    note: clean(handoff.note),
    balanceAcknowledged: Boolean(handoff.balanceAcknowledged),
  };
}

function normalizeOrderActivity(activity = []) {
  return (Array.isArray(activity) ? activity : [])
    .map((event) => ({
      id: clean(event.id) || uid("act"),
      label: clean(event.label),
      detail: clean(event.detail),
      actor: clean(event.actor),
      createdAt: clean(event.createdAt) || isoDate(0),
    }))
    .filter((event) => event.label)
    .slice(-60);
}

function normalizeInventoryAdjustments(adjustments = []) {
  return (Array.isArray(adjustments) ? adjustments : [])
    .map((adjustment) => ({
      id: clean(adjustment.id) || uid("adj"),
      itemId: clean(adjustment.itemId),
      itemName: clean(adjustment.itemName),
      change: numberValue(adjustment.change),
      quantityBefore: numberValue(adjustment.quantityBefore),
      quantityAfter: numberValue(adjustment.quantityAfter),
      unit: clean(adjustment.unit),
      reason: normalizeChoice(adjustment.reason, inventoryAdjustmentReasons, "Other"),
      note: clean(adjustment.note),
      actor: clean(adjustment.actor),
      createdAt: clean(adjustment.createdAt) || isoDate(0),
    }))
    .filter((adjustment) => adjustment.itemId && adjustment.change !== 0)
    .slice(0, 200);
}

function normalizeChoice(value, options, fallback) {
  const cleaned = clean(value);
  return options.find((option) => option.toLowerCase() === cleaned.toLowerCase()) || fallback;
}

function createDefaultProfile() {
  return {
    businessName: "",
    displayName: "",
    businessType: "Tailoring studio",
    brandPersonality: "Precise, professional, service-led, production-aware, and client-conscious",
    tagline: "",
    logo: "",
    logoView: "square",
    phone: "",
    email: "",
    address: "",
    currency: "NGN",
    measurementUnit: "inches",
    fabricUnit: "yards",
    theme: { ...defaultTheme },
  };
}

function normalizeProfile(profile, fallback = createDefaultProfile()) {
  if (!profile) return { ...fallback, theme: { ...defaultTheme, ...(fallback.theme || {}) } };
  return {
    ...fallback,
    ...profile,
    logoView: profile.logoView === "circle" ? "circle" : "square",
    theme: { ...defaultTheme, ...(profile.theme || {}) },
  };
}

function createSeedState() {
  return {
    profile: null,
    clients: [],
    inquiries: [],
    channelMessages: [],
    channelDeliveryEvents: [],
    styles: [],
    inventory: [],
    inventoryAdjustments: [],
    orders: [],
    usageRecords: [],
  };
}

// Demo studio content kept for LOCAL DEVELOPMENT ONLY. Real tenants start empty
// via createSeedState() above; this is never loaded automatically. A developer
// can call createDemoState() / loadStudioDemo() from the browser console.
function createDemoState() {
  return {
    profile: null,
    clients: [
      {
        id: "client-amina",
        name: "Amina Cole",
        phone: "+234 801 555 0191",
        email: "amina@example.com",
        address: "Lekki Phase 1, Lagos",
        measurements: {
          Shoulder: "16",
          "Chest/Bust": "38",
          Waist: "32",
          Hip: "42",
          "Dress length": "58",
          "Sleeve length": "23",
        },
        stylePreferences: "Structured native wear, earth tones, minimal embroidery.",
        fittingNotes: "Prefers a relaxed shoulder and slightly longer sleeve.",
        importantDates: "Sister's wedding: 2026-06-18",
      },
      {
        id: "client-tola",
        name: "Tola Studio",
        phone: "+234 809 300 8890",
        email: "orders@tolastudio.example",
        address: "Ikeja GRA, Lagos",
        measurements: {
          Shoulder: "17",
          "Chest/Bust": "41",
          Waist: "35",
          Hip: "43",
          "Shirt length": "30",
          "Trouser length": "41",
        },
        stylePreferences: "Bulk corporate sets with clean finish.",
        fittingNotes: "Confirm size run before cutting bulk work.",
        importantDates: "Corporate shoot: 2026-06-24",
      },
    ],
    inquiries: [
      {
        id: "inq-1001",
        clientName: "Nkechi A.",
        channel: "Instagram",
        contact: "@nkechi_style",
        desiredStyle: "Two-piece set",
        occasion: "Birthday dinner",
        deadline: isoDate(9),
        budget: 85000,
        notes: "Asked for a fitted top, wide-leg trouser, and fabric options.",
        status: "New",
        createdAt: isoDate(-1),
      },
      {
        id: "inq-1002",
        clientName: "Bello Family",
        channel: "WhatsApp",
        contact: "+234 803 778 2210",
        desiredStyle: "Bulk kaftan order",
        occasion: "Family event",
        deadline: isoDate(20),
        budget: 620000,
        notes: "Needs quote for 12 adult kaftans and 6 children's outfits.",
        status: "Contacted",
        createdAt: isoDate(-2),
      },
    ],
    channelMessages: [
      {
        id: "msg-1001",
        channel: "Instagram",
        senderName: "Chioma Okafor",
        contact: "@chioma_looks",
        message: "Hi, can you make a fitted corset dress for an asoebi? I have lace already and need a clean finish.",
        desiredStyle: "Corset asoebi dress",
        occasion: "Asoebi wedding",
        deadline: isoDate(12),
        budget: 140000,
        followUpStatus: "Needs reply",
        routingStatus: "New",
        notes: "Ask for reference photos and fabric width before quoting.",
        inquiryId: "",
        receivedAt: isoDate(0),
      },
      {
        id: "msg-1002",
        channel: "WhatsApp",
        senderName: "Bello Family",
        contact: "+234 803 778 2210",
        message: "Please send a quote for 12 adult kaftans and 6 children's outfits for our family event.",
        desiredStyle: "Bulk kaftan order",
        occasion: "Family event",
        deadline: isoDate(20),
        budget: 620000,
        followUpStatus: "Quote sent",
        routingStatus: "Routed to Inquiry",
        notes: "Already captured as inquiry in the pipeline.",
        inquiryId: "inq-1002",
        receivedAt: isoDate(-2),
      },
    ],
    styles: [
      {
        id: "style-kaftan",
        name: "Kaftan",
        category: "Native wear",
        basePrice: 45000,
        productionDays: 7,
        requiredMeasurements: ["Shoulder", "Chest/Bust", "Sleeve length", "Top length"],
        baseFabric: 3.5,
        fabricUnit: "yards",
        fabricWidth: 45,
        supportedWidths: [45, 54, 60],
        wastagePercent: 10,
        fixedItems: [
          { itemId: "mat-thread-black", quantity: 1, unit: "spool", role: "Thread" },
          { itemId: "mat-labels", quantity: 1, unit: "piece", role: "Brand label" },
          { itemId: "mat-packaging", quantity: 1, unit: "bag", role: "Packaging" },
        ],
        modifiers: [
          { id: "long-sleeves", name: "Long sleeves", fabricDelta: 0.35, costDelta: 5000, timeDelta: 1, materialRequirements: [] },
          { id: "embroidery", name: "Chest embroidery", fabricDelta: 0, costDelta: 12000, timeDelta: 2, materialRequirements: [{ category: "Embroidery materials", quantity: 1, unit: "pack", role: "Embroidery thread" }] },
          { id: "pockets", name: "Side pockets", fabricDelta: 0.2, costDelta: 3000, timeDelta: 0, materialRequirements: [{ category: "Interfacing/stay", quantity: 0.25, unit: "yard", role: "Pocket stay" }] },
        ],
        notes: "Everyday native wear recipe with editable allowances.",
      },
      {
        id: "style-agbada",
        name: "Agbada",
        category: "Ceremonial wear",
        basePrice: 120000,
        productionDays: 14,
        requiredMeasurements: ["Shoulder", "Chest/Bust", "Sleeve length", "Agbada length", "Cap/head measurement"],
        baseFabric: 7,
        fabricUnit: "yards",
        fabricWidth: 45,
        supportedWidths: [45, 54, 60],
        wastagePercent: 12,
        fixedItems: [
          { itemId: "mat-thread-black", quantity: 2, unit: "spools", role: "Thread" },
          { itemId: "mat-labels", quantity: 1, unit: "piece", role: "Brand label" },
          { itemId: "mat-packaging", quantity: 1, unit: "bag", role: "Packaging" },
        ],
        modifiers: [
          { id: "heavy-silhouette", name: "Heavy/full silhouette", fabricDelta: 1.1, costDelta: 18000, timeDelta: 2, materialRequirements: [] },
          { id: "full-embroidery", name: "Full embroidery panel", fabricDelta: 0, costDelta: 38000, timeDelta: 3, materialRequirements: [{ category: "Embroidery materials", quantity: 2, unit: "packs", role: "Embroidery thread" }] },
          { id: "cap", name: "Matching cap", fabricDelta: 0.35, costDelta: 8000, timeDelta: 1, materialRequirements: [{ category: "Interfacing/stay", quantity: 0.25, unit: "yard", role: "Cap stay" }] },
        ],
        notes: "Ceremonial set with generous fabric and embroidery allowances.",
      },
      {
        id: "style-two-piece",
        name: "Two-piece set",
        category: "Ready-to-wear/custom",
        basePrice: 70000,
        productionDays: 9,
        requiredMeasurements: ["Shoulder", "Chest/Bust", "Waist", "Hip", "Trouser length", "Inseam"],
        baseFabric: 4.25,
        fabricUnit: "yards",
        fabricWidth: 45,
        supportedWidths: [45, 54, 60],
        wastagePercent: 10,
        fixedItems: [
          { itemId: "mat-thread-black", quantity: 1, unit: "spool", role: "Thread" },
          { itemId: "mat-zippers", quantity: 1, unit: "piece", role: "Zipper" },
          { itemId: "mat-labels", quantity: 1, unit: "piece", role: "Brand label" },
          { itemId: "mat-packaging", quantity: 1, unit: "bag", role: "Packaging" },
        ],
        modifiers: [
          { id: "lining", name: "Add lining", fabricDelta: 0, costDelta: 9000, timeDelta: 1, materialRequirements: [{ category: "Lining", quantity: 2.5, unit: "yards", role: "Lining" }] },
          { id: "flared-trouser", name: "Flared trouser", fabricDelta: 0.55, costDelta: 6000, timeDelta: 1, materialRequirements: [] },
          { id: "collar-cuff", name: "Collar and cuff detail", fabricDelta: 0.15, costDelta: 4000, timeDelta: 0, materialRequirements: [{ category: "Interfacing/stay", quantity: 0.5, unit: "yard", role: "Collar/cuff stay" }] },
        ],
        notes: "Flexible set recipe for custom and small-batch work.",
      },
    ],
    inventory: [
      {
        id: "mat-adire-indigo",
        name: "Indigo adire cotton",
        type: "Fabric",
        category: "Fabric",
        fabricType: "Cotton",
        colorPattern: "Indigo resist print",
        width: 45,
        unit: "yards",
        quantity: 34,
        reserved: 5,
        minimumStock: 10,
        supplier: "Oke Textile Market",
        costPerUnit: 2500,
        notes: "Best for kaftans and two-piece sets.",
      },
      {
        id: "mat-aso-oke-cream",
        name: "Cream aso-oke",
        type: "Fabric",
        category: "Fabric",
        fabricType: "Aso-oke",
        colorPattern: "Cream stripe",
        width: 45,
        unit: "yards",
        quantity: 9,
        reserved: 0,
        minimumStock: 8,
        supplier: "Balogun Market",
        costPerUnit: 6800,
        notes: "Premium ceremonial fabric.",
      },
      {
        id: "mat-lining-black",
        name: "Black lining",
        type: "Non-fabric",
        category: "Lining",
        fabricType: "",
        colorPattern: "Black",
        width: 60,
        unit: "yards",
        quantity: 18,
        reserved: 0,
        minimumStock: 6,
        supplier: "Mainland Trims",
        costPerUnit: 900,
        notes: "General purpose lining.",
      },
      {
        id: "mat-thread-black",
        name: "Black thread cones",
        type: "Non-fabric",
        category: "Thread",
        fabricType: "",
        colorPattern: "Black",
        width: "",
        unit: "spools",
        quantity: 22,
        reserved: 2,
        minimumStock: 5,
        supplier: "Mainland Trims",
        costPerUnit: 650,
        notes: "Core sewing thread.",
      },
      {
        id: "mat-buttons-shell",
        name: "Shell buttons",
        type: "Non-fabric",
        category: "Buttons",
        fabricType: "",
        colorPattern: "Pearl",
        width: "",
        unit: "pieces",
        quantity: 48,
        reserved: 0,
        minimumStock: 40,
        supplier: "Mainland Trims",
        costPerUnit: 75,
        notes: "Low stock warning should appear soon.",
      },
      {
        id: "mat-zippers",
        name: "Invisible zippers",
        type: "Non-fabric",
        category: "Zippers",
        fabricType: "",
        colorPattern: "Mixed",
        width: "",
        unit: "pieces",
        quantity: 30,
        reserved: 0,
        minimumStock: 10,
        supplier: "Yaba Notions",
        costPerUnit: 350,
        notes: "",
      },
      {
        id: "mat-stay",
        name: "Medium interfacing stay",
        type: "Non-fabric",
        category: "Interfacing/stay",
        fabricType: "",
        colorPattern: "White",
        width: 45,
        unit: "yards",
        quantity: 12,
        reserved: 0,
        minimumStock: 5,
        supplier: "Yaba Notions",
        costPerUnit: 700,
        notes: "For collars, cuffs, pockets, caps.",
      },
      {
        id: "mat-embroidery",
        name: "Embroidery thread pack",
        type: "Non-fabric",
        category: "Embroidery materials",
        fabricType: "",
        colorPattern: "Mixed metallic",
        width: "",
        unit: "packs",
        quantity: 6,
        reserved: 0,
        minimumStock: 3,
        supplier: "Creative Trims",
        costPerUnit: 2400,
        notes: "",
      },
      {
        id: "mat-labels",
        name: "Woven labels",
        type: "Non-fabric",
        category: "Labels/tags",
        fabricType: "",
        colorPattern: "Black and cream",
        width: "",
        unit: "pieces",
        quantity: 90,
        reserved: 3,
        minimumStock: 30,
        supplier: "Brand Pack Co.",
        costPerUnit: 120,
        notes: "",
      },
      {
        id: "mat-packaging",
        name: "Garment packaging bags",
        type: "Non-fabric",
        category: "Packaging",
        fabricType: "",
        colorPattern: "Clear",
        width: "",
        unit: "bags",
        quantity: 64,
        reserved: 3,
        minimumStock: 20,
        supplier: "Brand Pack Co.",
        costPerUnit: 180,
        notes: "",
      },
    ],
    inventoryAdjustments: [],
    orders: [
      {
        id: "ord-1042",
        clientId: "client-amina",
        styleId: "style-kaftan",
        fabricId: "mat-adire-indigo",
        modifiers: ["long-sleeves", "embroidery"],
        status: "Materials Reserved",
        productionStep: "Materials Reserved",
        deadline: isoDate(8),
        fittingDate: isoDate(5),
        quote: 62000,
        deposit: 35000,
        assignedTo: "Tailor team A",
        notes: "Confirm neckline shape before cutting.",
        estimatedMaterials: [
          { itemId: "mat-adire-indigo", name: "Indigo adire cotton", role: "Main fabric", quantity: 5, unit: "yards" },
          { itemId: "mat-thread-black", name: "Black thread cones", role: "Thread", quantity: 1, unit: "spool" },
          { itemId: "mat-embroidery", name: "Embroidery thread pack", role: "Embroidery thread", quantity: 1, unit: "pack" },
          { itemId: "mat-labels", name: "Woven labels", role: "Brand label", quantity: 1, unit: "piece" },
          { itemId: "mat-packaging", name: "Garment packaging bags", role: "Packaging", quantity: 1, unit: "bag" },
        ],
        reservedMaterials: [
          { itemId: "mat-adire-indigo", name: "Indigo adire cotton", role: "Main fabric", quantity: 5, unit: "yards" },
          { itemId: "mat-thread-black", name: "Black thread cones", role: "Thread", quantity: 1, unit: "spool" },
          { itemId: "mat-embroidery", name: "Embroidery thread pack", role: "Embroidery thread", quantity: 1, unit: "pack" },
          { itemId: "mat-labels", name: "Woven labels", role: "Brand label", quantity: 1, unit: "piece" },
          { itemId: "mat-packaging", name: "Garment packaging bags", role: "Packaging", quantity: 1, unit: "bag" },
        ],
        actualMaterials: [],
        stockWarnings: [],
        createdAt: isoDate(-3),
      },
      {
        id: "ord-1043",
        clientId: "client-tola",
        styleId: "style-two-piece",
        fabricId: "mat-adire-indigo",
        modifiers: ["flared-trouser"],
        status: "Sewing",
        productionStep: "Sewing",
        deadline: isoDate(16),
        fittingDate: isoDate(11),
        quote: 540000,
        deposit: 270000,
        assignedTo: "Bulk team",
        notes: "Pilot sample approved; bulk size run pending.",
        estimatedMaterials: [],
        reservedMaterials: [],
        actualMaterials: [],
        stockWarnings: [],
        createdAt: isoDate(-7),
      },
    ],
    usageRecords: [
      {
        id: "learn-1",
        orderId: "ord-0998",
        styleName: "Kaftan",
        estimated: 3.85,
        actual: 3.6,
        unit: "yards",
        difference: -0.25,
        notes: "Short sleeve kaftan used less than the default estimate.",
        completedAt: isoDate(-9),
      },
    ],
  };
}

function renderLoading() {
  applyTheme();
  app.innerHTML = `
    <main class="boot-page" aria-live="polite">
      <section class="boot-card">
        <div class="brand-mark">FS</div>
        <div>
          <p class="eyebrow">Fashion Studio OS</p>
          <h1>Preparing your studio workspace.</h1>
          <p class="lead">Loading your latest studio records.</p>
        </div>
        <div class="boot-progress" aria-hidden="true"><span></span></div>
      </section>
    </main>
  `;
}

function render() {
  applyTheme();

  if (!currentUser()) {
    renderOnboarding();
    return;
  }

  if (!state.profile) {
    renderSetup();
    return;
  }

  const nav = accessibleNavItems();
  if (!nav.some(([view]) => view === currentView)) {
    currentView = nav[0]?.[0] || "dashboard";
  }
  const navItemsMarkup = nav.map(([view, icon, label]) => `
    <button class="${view === currentView ? "active" : ""}" type="button" data-nav="${view}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      <span class="nav-icon">${iconSvg(icon)}</span>
      <span class="nav-label">${label}</span>
    </button>
  `).join("");

  app.innerHTML = `
    <div class="shell ${mobileNavOpen ? "nav-open" : ""}">
      <a class="skip-link" href="#mainContent">Skip to workspace</a>
      <header class="mobile-appbar">
        <div class="mobile-brand">
          ${renderBrandMark()}
          <div class="mobile-brand-copy">
            <div class="mobile-brand-name">${escapeHtml(displayName())}</div>
            <div class="mobile-brand-meta">${escapeHtml(state.profile.businessType || "Fashion studio")}</div>
          </div>
        </div>
        <button class="mobile-menu-button" type="button" data-action="toggle-mobile-nav" aria-controls="primaryNavigation" aria-expanded="${mobileNavOpen}" aria-label="${mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}">
          <span class="menu-icon" aria-hidden="true"><span></span><span></span><span></span></span>
          <span>Menu</span>
        </button>
      </header>
      <button class="nav-backdrop" type="button" data-action="close-mobile-nav" aria-label="Close navigation menu"></button>
      <aside class="sidebar" id="primaryNavigation">
        <div class="brand-block">
          <div class="drawer-brand">
            ${renderBrandMark()}
            <div>
              <div class="brand-name">${escapeHtml(displayName())}</div>
              <div class="brand-meta">${escapeHtml(state.profile.businessType || "Fashion studio")}</div>
            </div>
          </div>
          <button class="drawer-close" type="button" data-action="close-mobile-nav" aria-label="Close navigation menu">
            <span class="close-icon" aria-hidden="true"></span>
          </button>
        </div>
        <nav class="nav" aria-label="Primary navigation">
          ${navItemsMarkup}
        </nav>
        <div class="drawer-actions">
          <button class="btn secondary" type="button" data-action="sign-out">Sign out</button>
        </div>
      </aside>
      <main id="mainContent" class="main" tabindex="-1">
        ${renderTopbar()}
        ${renderView()}
      </main>
      ${renderModal()}
    </div>
  `;

  wireEvents();
  focusMobileNavControl();
  focusModalControl();
}

function renderOnboarding() {
  const mode = ["signin", "signup", "invite", "recover"].includes(authMode) ? authMode : "signin";
  const hasAccounts = auth.users.length > 0;
  const actionTitle = mode === "signin"
    ? "Sign in to Studio OS"
    : mode === "invite"
      ? "Accept staff invite"
      : mode === "recover"
        ? "Recover access"
        : "Create manager access";
  const actionCopy = mode === "signin"
    ? "Use the manager account or an active staff account created by the manager."
    : mode === "invite"
      ? "Use the invite token from the manager to finish staff onboarding and set your password."
      : mode === "recover"
        ? "Use the recovery code saved when this account was created to set a new password."
        : "Start with one manager account. Staff access can be assigned later in settings.";

  app.innerHTML = `
    <main class="onboarding-page">
      <section class="onboarding-hero">
        <div class="onboarding-brand">
          ${renderBrandMark()}
          <div>
            <p class="eyebrow">Fashion Studio OS</p>
            <h1>Studio access before studio control.</h1>
          </div>
        </div>
        <p class="lead">Sign in, create manager access, set up the business profile, then move into the operating dashboard for orders, clients, stock, production, and team permissions.</p>
        <div class="onboarding-flow" aria-label="Access flow">
          <div>
            <strong>1</strong>
            <span>Authenticate</span>
          </div>
          <div>
            <strong>2</strong>
            <span>Open workspace</span>
          </div>
          <div>
            <strong>3</strong>
            <span>Assign access</span>
          </div>
        </div>
      </section>

      <section class="auth-panel">
        <div class="auth-tabs" role="tablist" aria-label="Authentication options">
          <button class="${mode === "signin" ? "active" : ""}" type="button" data-auth-mode="signin" role="tab" aria-selected="${mode === "signin"}">Sign in</button>
          <button class="${mode === "invite" ? "active" : ""}" type="button" data-auth-mode="invite" role="tab" aria-selected="${mode === "invite"}">Accept invite</button>
          <button class="${mode === "signup" ? "active" : ""}" type="button" data-auth-mode="signup" role="tab" aria-selected="${mode === "signup"}">Sign up</button>
        </div>
        <div class="panel-header">
          <div>
            <h2>${actionTitle}</h2>
            <p>${actionCopy}</p>
          </div>
        </div>
        ${mode === "signin" ? renderSignInForm(hasAccounts) : mode === "invite" ? renderInviteForm() : mode === "recover" ? renderRecoveryForm() : renderSignUpForm()}
      </section>
    </main>
  `;
  wireEvents();
}

function renderInviteForm() {
  return `
    <form id="inviteForm" class="auth-form">
      <label class="field full">
        <span>Staff name</span>
        <input name="name" autocomplete="name" required placeholder="Your name">
      </label>
      <label class="field full">
        <span>Email</span>
        <input name="email" type="email" autocomplete="email" required placeholder="staff@studio.com">
      </label>
      <label class="field full">
        <span>Invite token</span>
        <input name="inviteToken" autocomplete="one-time-code" required placeholder="Paste manager invite token">
      </label>
      <label class="field">
        <span>Password</span>
        <input name="password" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD_LENGTH}" placeholder="Minimum ${MIN_PASSWORD_LENGTH} characters">
      </label>
      <label class="field">
        <span>Confirm password</span>
        <input name="confirmPassword" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD_LENGTH}" placeholder="Repeat password">
      </label>
      <div class="button-row full">
        <button class="btn" type="submit">Accept invite</button>
        <button class="btn secondary" type="button" data-auth-mode="signin">Back to sign in</button>
      </div>
    </form>
  `;
}

function renderSignInForm(hasAccounts) {
  return `
    <form id="signinForm" class="auth-form">
      <label class="field full">
        <span>Email</span>
        <input name="email" type="email" autocomplete="email" required placeholder="name@studio.com">
      </label>
      <label class="field full">
        <span>Password</span>
        <input name="password" type="password" autocomplete="current-password" required placeholder="Enter password">
      </label>
      <div class="auth-note">${hasAccounts ? "Managers use full access. Staff see only assigned sections." : "No account exists yet. Create manager access first."}</div>
      <div class="button-row">
        <button class="btn" type="submit">Sign in</button>
        <button class="btn secondary" type="button" data-auth-mode="signup">Create manager account</button>
        <button class="btn secondary" type="button" data-auth-mode="recover">Forgot password</button>
      </div>
    </form>
  `;
}

function renderRecoveryForm() {
  return `
    <form id="recoveryForm" class="auth-form">
      <label class="field full">
        <span>Email</span>
        <input name="email" type="email" autocomplete="email" required placeholder="name@studio.com">
      </label>
      <label class="field full">
        <span>Recovery code</span>
        <input name="recoveryCode" autocomplete="one-time-code" required placeholder="Paste your saved recovery code">
      </label>
      <label class="field">
        <span>New password</span>
        <input name="password" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD_LENGTH}" placeholder="Minimum ${MIN_PASSWORD_LENGTH} characters">
      </label>
      <label class="field">
        <span>Confirm password</span>
        <input name="confirmPassword" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD_LENGTH}" placeholder="Repeat password">
      </label>
      <div class="auth-note full">A recovery code can only be used once. After resetting, sign in with your new password. If you have no recovery code, ask a manager on this workspace to issue one.</div>
      <div class="button-row full">
        <button class="btn" type="submit">Reset password</button>
        <button class="btn secondary" type="button" data-auth-mode="signin">Back to sign in</button>
      </div>
    </form>
  `;
}

function renderSignUpForm() {
  return `
    <form id="signupForm" class="auth-form">
      <label class="field full">
        <span>Manager name</span>
        <input name="name" autocomplete="name" required placeholder="Studio manager">
      </label>
      <label class="field full">
        <span>Email</span>
        <input name="email" type="email" autocomplete="email" required placeholder="manager@studio.com">
      </label>
      <label class="field">
        <span>Password</span>
        <input name="password" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD_LENGTH}" placeholder="Minimum ${MIN_PASSWORD_LENGTH} characters">
      </label>
      <label class="field">
        <span>Confirm password</span>
        <input name="confirmPassword" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD_LENGTH}" placeholder="Repeat password">
      </label>
      <div class="auth-note full">The first account is the manager. Managers can add more managers and staff for this workspace in Settings.</div>
      <div class="button-row full">
        <button class="btn" type="submit">Create access</button>
        <button class="btn secondary" type="button" data-auth-mode="signin">I already have access</button>
      </div>
    </form>
  `;
}

function renderModal() {
  if (!modalState) return "";
  if (modalState.type === "restock") {
    const item = getInventoryItem(modalState.id);
    if (!item) return "";
    return `
      <section class="modal-layer" role="presentation">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div class="modal-header">
            <div>
              <p class="eyebrow">Material reserve</p>
              <h2 id="modalTitle">Restock ${escapeHtml(item.name)}</h2>
            </div>
            <button class="modal-close" type="button" data-action="close-modal" aria-label="Close restock dialog">&times;</button>
          </div>
          <form id="restockForm" data-id="${escapeHtml(item.id)}">
            <label class="field full">
              <span>Quantity to add</span>
              <input name="amount" type="number" min="0.01" step="0.01" value="1" required autofocus data-modal-autofocus>
            </label>
            <p class="modal-note">Current stock: ${escapeHtml(item.quantity)} ${escapeHtml(item.unit)} · Reserved: ${escapeHtml(item.reserved || 0)} ${escapeHtml(item.unit)}</p>
            <div class="button-row">
              <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
              <button class="btn" type="submit">Update inventory</button>
            </div>
          </form>
        </div>
      </section>
    `;
  }

  if (modalState.type === "payment") {
    const order = getOrder(modalState.id);
    if (!order) return "";
    const balance = orderBalanceDue(order);
    return `
      <section class="modal-layer" role="presentation">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div class="modal-header">
            <div>
              <p class="eyebrow">Order payment</p>
              <h2 id="modalTitle">Record payment</h2>
            </div>
            <button class="modal-close" type="button" data-action="close-modal" aria-label="Close payment dialog">&times;</button>
          </div>
          <form id="paymentForm" data-id="${escapeHtml(order.id)}" class="form-grid modal-form-grid">
            <label class="field">
              <span>Amount</span>
              <input name="amount" type="number" min="0.01" step="100" inputmode="decimal" value="${balance > 0 ? balance : ""}" required autofocus data-modal-autofocus>
            </label>
            <label class="field">
              <span>Method</span>
              <select name="method">
                ${paymentMethods.map((method) => `<option>${escapeHtml(method)}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Received date</span>
              <input name="receivedAt" type="date" value="${isoDate(0)}">
            </label>
            <label class="field full">
              <span>Payment note</span>
              <textarea name="note" placeholder="Receipt reference, transfer note, or cashier initials"></textarea>
            </label>
            <p class="modal-note full">Current balance: ${money(balance)} on a ${money(order.quote)} order.</p>
            <div class="button-row full">
              <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
              <button class="btn" type="submit">Save payment</button>
            </div>
          </form>
        </div>
      </section>
    `;
  }

  if (modalState.type === "fitting") {
    const order = getOrder(modalState.id);
    if (!order) return "";
    return `
      <section class="modal-layer" role="presentation">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div class="modal-header">
            <div>
              <p class="eyebrow">Fitting appointment</p>
              <h2 id="modalTitle">Schedule fitting</h2>
            </div>
            <button class="modal-close" type="button" data-action="close-modal" aria-label="Close fitting dialog">&times;</button>
          </div>
          <form id="fittingForm" data-id="${escapeHtml(order.id)}" class="form-grid modal-form-grid">
            <label class="field">
              <span>Fitting type</span>
              <select name="type">
                ${fittingTypes.map((type) => `<option>${escapeHtml(type)}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Date</span>
              <input name="date" type="date" value="${order.fittingDate || isoDate(3)}" required autofocus data-modal-autofocus>
            </label>
            <label class="field">
              <span>Assigned to</span>
              <input name="assignedTo" value="${escapeHtml(order.assignedTo || "")}" placeholder="Tailor or fitting lead">
            </label>
            <label class="field full">
              <span>Fitting notes</span>
              <textarea name="notes" placeholder="What to check, alter, or confirm"></textarea>
            </label>
            <div class="button-row full">
              <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
              <button class="btn" type="submit">Schedule fitting</button>
            </div>
          </form>
        </div>
      </section>
    `;
  }

  if (modalState.type === "review") {
    const order = getOrder(modalState.id);
    if (!order) return "";
    return `
      <section class="modal-layer" role="presentation">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div class="modal-header">
            <div>
              <p class="eyebrow">Manager review</p>
              <h2 id="modalTitle">Request review</h2>
            </div>
            <button class="modal-close" type="button" data-action="close-modal" aria-label="Close review dialog">&times;</button>
          </div>
          <form id="managerReviewForm" data-id="${escapeHtml(order.id)}">
            <label class="field full">
              <span>Review note</span>
              <textarea name="note" required autofocus data-modal-autofocus placeholder="What should the manager inspect before handoff?">${escapeHtml(order.managerReview?.note || "")}</textarea>
            </label>
            <div class="button-row">
              <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
              <button class="btn" type="submit">Request review</button>
            </div>
          </form>
        </div>
      </section>
    `;
  }

  if (modalState.type === "follow-up") {
    const order = getOrder(modalState.id);
    if (!order) return "";
    return `
      <section class="modal-layer" role="presentation">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div class="modal-header">
            <div>
              <p class="eyebrow">Customer follow-up</p>
              <h2 id="modalTitle">Update follow-up</h2>
            </div>
            <button class="modal-close" type="button" data-action="close-modal" aria-label="Close follow-up dialog">&times;</button>
          </div>
          <form id="followUpForm" data-id="${escapeHtml(order.id)}" class="form-grid modal-form-grid">
            <label class="field">
              <span>Status</span>
              <select name="followUpStatus" autofocus data-modal-autofocus>
                ${orderFollowUpStatuses.map((status) => `<option ${status === order.followUpStatus ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Next follow-up date</span>
              <input name="followUpAt" type="date" value="${escapeHtml(order.followUpAt || "")}">
            </label>
            <label class="field full">
              <span>Follow-up note</span>
              <textarea name="followUpNote" placeholder="Deposit reminder, fitting reminder, collection note, or closure note">${escapeHtml(order.followUpNote || "")}</textarea>
            </label>
            <div class="button-row full">
              <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
              <button class="btn" type="submit">Save follow-up</button>
            </div>
          </form>
        </div>
      </section>
    `;
  }

  if (modalState.type === "handoff") {
    const order = getOrder(modalState.id);
    if (!order) return "";
    const balance = orderBalanceDue(order);
    return `
      <section class="modal-layer" role="presentation">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div class="modal-header">
            <div>
              <p class="eyebrow">Order handoff</p>
              <h2 id="modalTitle">Close handoff</h2>
            </div>
            <button class="modal-close" type="button" data-action="close-modal" aria-label="Close handoff dialog">&times;</button>
          </div>
          <form id="handoffForm" data-id="${escapeHtml(order.id)}" class="form-grid modal-form-grid">
            <label class="field">
              <span>Handoff method</span>
              <select name="method" autofocus data-modal-autofocus>
                ${handoffMethods.map((method) => `<option>${escapeHtml(method)}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Handoff date</span>
              <input name="completedAt" type="date" value="${isoDate(0)}" required>
            </label>
            <label class="field full">
              <span>Recipient</span>
              <input name="recipient" value="${escapeHtml(getClient(order.clientId)?.name || "")}" placeholder="Client or representative name">
            </label>
            <label class="field full">
              <span>Handoff note</span>
              <textarea name="note" placeholder="Condition, packaging, dispatch reference, or signature note"></textarea>
            </label>
            ${balance > 0 ? `
              <label class="check-tile full">
                <input name="balanceAcknowledged" type="checkbox">
                <span>Balance of ${money(balance)} is acknowledged before closing.</span>
              </label>
            ` : ""}
            <div class="button-row full">
              <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
              <button class="btn success" type="submit">Complete handoff</button>
            </div>
          </form>
        </div>
      </section>
    `;
  }

  if (modalState.type === "inventory-adjust") {
    const item = getInventoryItem(modalState.id);
    if (!item) return "";
    return `
      <section class="modal-layer" role="presentation">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div class="modal-header">
            <div>
              <p class="eyebrow">Inventory adjustment</p>
              <h2 id="modalTitle">Adjust ${escapeHtml(item.name)}</h2>
            </div>
            <button class="modal-close" type="button" data-action="close-modal" aria-label="Close inventory adjustment dialog">&times;</button>
          </div>
          <form id="inventoryAdjustmentForm" data-id="${escapeHtml(item.id)}" class="form-grid modal-form-grid">
            <label class="field">
              <span>Change quantity</span>
              <input name="change" type="number" step="0.01" inputmode="decimal" required autofocus data-modal-autofocus placeholder="-1 or 5">
            </label>
            <label class="field">
              <span>Reason</span>
              <select name="reason">
                ${inventoryAdjustmentReasons.filter((reason) => reason !== "Restock").map((reason) => `<option>${escapeHtml(reason)}</option>`).join("")}
              </select>
            </label>
            <label class="field full">
              <span>Adjustment note</span>
              <textarea name="note" placeholder="Count note, damage note, or supplier return reference"></textarea>
            </label>
            <p class="modal-note full">Current stock: ${round2(item.quantity)} ${escapeHtml(item.unit)}. Reserved: ${round2(item.reserved)} ${escapeHtml(item.unit)}.</p>
            <div class="button-row full">
              <button class="btn secondary" type="button" data-action="close-modal">Cancel</button>
              <button class="btn" type="submit">Save adjustment</button>
            </div>
          </form>
        </div>
      </section>
    `;
  }

  if (modalState.type === "delete-staff") {
    const staff = auth.users.find((user) => user.id === modalState.id && user.role === "staff");
    if (!staff) return "";
    return renderConfirmModal({
      title: "Remove staff access",
      eyebrow: "Team access",
      message: `Remove ${staff.name}'s access to this Studio OS workspace?`,
      confirmAction: "confirm-delete-staff",
      id: staff.id,
      confirmLabel: "Remove staff",
      tone: "danger",
    });
  }

  if (modalState.type === "reset-data") {
    return renderConfirmModal({
      title: "Reset workspace data",
      eyebrow: "Workspace data",
      message: "This permanently clears all workspace records, sign-in records, and staff accounts. This cannot be undone.",
      confirmAction: "confirm-reset-data",
      confirmLabel: "Reset data",
      tone: "danger",
    });
  }

  return "";
}

function renderConfirmModal({ title, eyebrow, message, confirmAction, id = "", confirmLabel, tone = "danger" }) {
  return `
    <section class="modal-layer" role="presentation">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle" aria-describedby="modalMessage">
        <div class="modal-header">
          <div>
            <p class="eyebrow">${escapeHtml(eyebrow)}</p>
            <h2 id="modalTitle">${escapeHtml(title)}</h2>
          </div>
          <button class="modal-close" type="button" data-action="close-modal" aria-label="Close confirmation dialog">&times;</button>
        </div>
        <p id="modalMessage" class="modal-note">${escapeHtml(message)}</p>
        <div class="button-row">
          <button class="btn secondary" type="button" data-action="close-modal" data-modal-autofocus>Cancel</button>
          <button class="btn ${tone}" type="button" data-action="${escapeHtml(confirmAction)}" ${id ? `data-id="${escapeHtml(id)}"` : ""}>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    </section>
  `;
}

function closeModal(shouldRender = true) {
  modalState = null;
  if (shouldRender) render();
}

function focusModalControl() {
  if (!modalState) return;
  window.setTimeout(() => {
    const control = app.querySelector("[data-modal-autofocus]") || app.querySelector(".modal-card button, .modal-card input");
    control?.focus({ preventScroll: true });
  });
}

function focusMobileNavControl() {
  if (!mobileNavOpen) return;
  window.setTimeout(() => {
    app.querySelector(".drawer-close")?.focus({ preventScroll: true });
  });
}

function renderSetup() {
  applyTheme();
  app.innerHTML = `
    <main class="setup-page">
      <section class="setup-intro">
        <p class="eyebrow">First launch</p>
        <h1>Set up your Studio OS control room.</h1>
        <p class="lead">
          Shape the business profile first. The dashboard, settings, orders, records, and client-facing labels use this identity instead of a hardcoded brand.
        </p>
        <div class="setup-points">
          <div class="setup-point">Capture client inquiries, measurements, garment orders, style recipes, stock, and production stages.</div>
          <div class="setup-point">Reserve estimated materials when work is confirmed, then deduct actual usage during cutting and finishing.</div>
          <div class="setup-point">Use editable brand colors so the app can fit any tailoring business.</div>
        </div>
      </section>
      <form id="setupForm" class="setup-form">
        <div class="panel-header">
          <div>
            <h2>Business setup</h2>
            <p>Set up your studio. Your details are saved automatically.</p>
          </div>
        </div>
        ${renderProfileFields(defaultTheme)}
        <div class="button-row" style="margin-top: 16px;">
          <button class="btn" type="submit">Open Studio OS</button>
        </div>
      </form>
    </main>
  `;
  wireEvents();
}

function renderView() {
  switch (currentView) {
    case "inquiries":
      return renderInquiries();
    case "clients":
      return renderClients();
    case "measurements":
      return renderMeasurements();
    case "orders":
      return renderOrders();
    case "recipes":
      return renderRecipes();
    case "inventory":
      return renderInventory();
    case "production":
      return renderProduction();
    case "reports":
      return renderReports();
    case "settings":
      return renderSettings();
    default:
      return renderDashboard();
  }
}

function renderTopbar() {
  const user = currentUser();
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">${escapeHtml(displayName())}</p>
        <h1>${escapeHtml(viewTitle(currentView))}</h1>
        <p>${escapeHtml(viewSubtitle(currentView))}</p>
      </div>
      <div class="actions">
        <span class="session-chip data-chip ${escapeHtml(storageMode)}">${escapeHtml(storageMessage)}</span>
        <span class="session-chip">${escapeHtml(user?.name || "Studio user")} · ${escapeHtml(user?.role || "staff")}</span>
        ${canAccess("settings") ? `<button class="btn secondary" type="button" data-nav="settings">Brand settings</button>` : ""}
        ${canAccess("orders") ? `<button class="btn" type="button" data-nav="orders">New garment order</button>` : ""}
        <button class="btn secondary" type="button" data-action="sign-out">Sign out</button>
      </div>
    </header>
  `;
}

function renderDashboard() {
  const active = state.orders.filter((order) => !["Completed", "Cancelled"].includes(order.status));
  const newInquiries = state.inquiries.filter((inquiry) => inquiry.status === "New");
  const newChannelMessages = (state.channelMessages || []).filter((message) => message.routingStatus === "New");
  const dueSoon = ordersDueWithin(14);
  const fittingsSoon = state.orders.filter((order) => order.fittingDate && daysUntil(order.fittingDate) >= 0 && daysUntil(order.fittingDate) <= 10 && order.status !== "Completed");
  const productionWork = state.orders.filter((order) => ["Cutting", "Sewing", "First Fitting", "Adjustments", "Finishing", "Quality Check"].includes(order.productionStep));
  const lowStock = lowStockItems();
  const reservedQty = round2(state.inventory.reduce((sum, item) => sum + Number(item.reserved || 0), 0));
  const revenue = state.orders.filter((order) => order.status !== "Cancelled").reduce((sum, order) => sum + Number(order.quote || 0), 0);

  return `
    <section class="content dashboard-content">
      <div class="metric-grid">
        ${metricCard("Active Garment Orders", active.length, `${dueSoon.length} due in the next 14 days`, "orders", "up")}
        ${metricCard("New Leads", newInquiries.length + newChannelMessages.length, `${newChannelMessages.length} raw channel messages waiting`, "inquiries")}
        ${metricCard("Fittings Due", fittingsSoon.length, "Keep approvals and alterations visible", "measurements", "hot")}
        ${metricCard("Pieces in Production", productionWork.length, "Cutting, sewing, fitting, finishing, and QC", "production")}
        ${metricCard("Low Stock Alerts", lowStock.length, lowStock.length ? "Needs attention" : "All clear", "warning", "alert")}
        ${metricCard("Material Reserve", reservedQty, "Fabric and finishing stock held for client pieces", "inventory")}
        ${metricCard("Revenue Pipeline", money(revenue), "Quoted and active order value", "reports", "up")}
        ${metricCard("Learning Records", state.usageRecords.length, "Estimate versus actual usage notes", "recipes")}
      </div>

      <div class="grid-2">
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2>Client pieces</h2>
              <p>Confirmed work connects directly to material reservation and production discipline.</p>
            </div>
            <button class="btn small secondary" type="button" data-nav="orders">View garment orders</button>
          </div>
          <div class="list">
            ${active.slice(0, 5).map(renderCompactOrder).join("") || emptyState("No active orders yet.")}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <h2>Material alerts</h2>
              <p>Available quantity subtracts reserved stock, so confirmed orders can reveal pressure early.</p>
            </div>
            <button class="btn small secondary" type="button" data-nav="inventory">View materials</button>
          </div>
          <div class="list">
            ${lowStock.slice(0, 6).map((item) => `
              <div class="record">
                <div class="record-header">
                  <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <p class="muted small-text">${escapeHtml(item.category)} - ${availableQty(item)} ${escapeHtml(item.unit)} available</p>
                  </div>
                  <span class="status danger">Low stock</span>
                </div>
              </div>
            `).join("") || emptyState("No low-stock materials right now.")}
          </div>
        </section>
      </div>

      <div class="grid-2">
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2>Production Flow</h2>
              <p>One board from consultation through quality check and collection.</p>
            </div>
          </div>
          <div class="list">
            ${productionSteps.slice(0, -1).map((step) => {
              const count = state.orders.filter((order) => order.productionStep === step).length;
              const percent = Math.min(100, count * 18);
              return `
                <div class="progress-line">
                  <div class="record-header">
                    <strong>${escapeHtml(step)}</strong>
                    <span class="pill">${count}</span>
                  </div>
                  <div class="progress-bar"><span style="width: ${percent}%;"></span></div>
                </div>
              `;
            }).join("")}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <h2>Usage intelligence</h2>
              <p>Completed orders feed practical style recipe refinements over time.</p>
            </div>
          </div>
          <div class="list">
            ${state.usageRecords.slice(0, 4).map(renderLearningRecord).join("") || emptyState("No completed usage comparisons yet.")}
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderInquiries() {
  const channelMessages = normalizeChannelMessages(state.channelMessages || []);
  const newChannelMessages = channelMessages.filter((message) => message.routingStatus === "New");
  const activeFollowUps = channelMessages.filter((message) => message.routingStatus !== "Archived" && message.followUpStatus !== "Closed");
  const routedMessages = channelMessages.filter((message) => message.routingStatus === "Routed to Inquiry");
  const newInquiries = state.inquiries.filter((inquiry) => inquiry.status === "New");

  return `
    <section class="content">
      <section class="metric-grid crm-metrics">
        ${metricCard("Channel Messages", channelMessages.length, `${newChannelMessages.length} waiting for review`, "inquiries")}
        ${metricCard("Follow-ups", activeFollowUps.length, "Replies, details, and quote nudges still open", "dashboard", activeFollowUps.length ? "hot" : "")}
        ${metricCard("Routed Leads", routedMessages.length, "Messages already converted into inquiry records", "orders", "up")}
        ${metricCard("New Inquiries", newInquiries.length, "Qualified requests ready for quoting", "clients")}
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Channel message intake</h2>
            <p>Paste WhatsApp, Instagram, web, referral, or walk-in demand before it disappears inside a chat thread.</p>
          </div>
        </div>
        <form id="channelMessageForm" class="form-grid">
          <label class="field">
            <span>Channel</span>
            <select name="channel">
              ${channelSources.map((source) => `<option>${escapeHtml(source)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Sender name</span>
            <input name="senderName" required placeholder="Adaeze N.">
          </label>
          <label class="field">
            <span>Contact</span>
            <input name="contact" placeholder="Phone, handle, or email">
          </label>
          <label class="field">
            <span>Desired garment/style</span>
            <input name="desiredStyle" placeholder="Corset dress, kaftan, bulk order">
          </label>
          <label class="field">
            <span>Occasion</span>
            <input name="occasion" placeholder="Wedding, birthday, corporate shoot">
          </label>
          <label class="field">
            <span>Deadline</span>
            <input name="deadline" type="date">
          </label>
          <label class="field">
            <span>Budget</span>
            <input name="budget" type="number" min="0" step="1000">
          </label>
          <label class="field">
            <span>Follow-up state</span>
            <select name="followUpStatus">
              ${channelFollowUpStatuses.map((status) => `<option>${escapeHtml(status)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Consent</span>
            <select name="consentStatus">
              ${channelConsentStatuses.map((status) => `<option>${escapeHtml(status)}</option>`).join("")}
            </select>
          </label>
          <label class="field full">
            <span>Raw message</span>
            <textarea name="message" required placeholder="Paste the chat message, DM, web note, or walk-in request"></textarea>
          </label>
          <label class="field full">
            <span>Internal notes</span>
            <textarea name="notes" placeholder="Reference image status, fabric notes, sizing questions, next response"></textarea>
          </label>
          <div class="field full">
            <button class="btn" type="submit">Save channel message</button>
          </div>
        </form>
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Channel intake queue</h2>
            <p>Review raw messages, update follow-up state, then route qualified demand into the inquiry pipeline.</p>
          </div>
        </div>
        <div class="list channel-message-list">
          ${channelMessages.map(renderChannelMessageCard).join("") || emptyState("No channel messages yet.")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>New client inquiry</h2>
            <p>Add a qualified inquiry directly when the conversation is already clear enough to quote.</p>
          </div>
        </div>
        <form id="inquiryForm" class="form-grid">
          <label class="field">
            <span>Client name</span>
            <input name="clientName" required placeholder="Adaeze N.">
          </label>
          <label class="field">
            <span>Channel</span>
            <select name="channel">
              ${channelSources.map((source) => `<option>${escapeHtml(source)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Contact</span>
            <input name="contact" placeholder="Phone, handle, or email">
          </label>
          <label class="field">
            <span>Desired garment/style</span>
            <input name="desiredStyle" required placeholder="Kaftan, dress, bulk order">
          </label>
          <label class="field">
            <span>Occasion</span>
            <input name="occasion" placeholder="Wedding, workwear, event">
          </label>
          <label class="field">
            <span>Deadline</span>
            <input name="deadline" type="date">
          </label>
          <label class="field">
            <span>Budget</span>
            <input name="budget" type="number" min="0" step="1000">
          </label>
          <label class="field full">
            <span>Consultation notes</span>
            <textarea name="notes" placeholder="Reference images, questions, preferred silhouette, fabric ideas"></textarea>
          </label>
          <div class="field full">
            <button class="btn" type="submit">Save inquiry</button>
          </div>
        </form>
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Inquiry pipeline</h2>
            <p>Move inquiries from new conversation to quote, confirmation, or order conversion.</p>
          </div>
        </div>
        <div class="list">
          ${state.inquiries.map((inquiry) => `
            <article class="record">
              <div class="record-header">
                <div class="title-line">
                  <strong>${escapeHtml(inquiry.clientName)} - ${escapeHtml(inquiry.desiredStyle)}</strong>
                  <span class="muted small-text">${escapeHtml(inquiry.channel)} ${inquiry.contact ? "- " + escapeHtml(inquiry.contact) : ""}</span>
                </div>
                <span class="status ${statusTone(inquiry.status)}">${escapeHtml(inquiry.status)}</span>
              </div>
              <div class="tag-list">
                ${inquiry.occasion ? `<span class="pill">${escapeHtml(inquiry.occasion)}</span>` : ""}
                ${inquiry.deadline ? `<span class="pill">Due ${formatDate(inquiry.deadline)}</span>` : ""}
                ${inquiry.budget ? `<span class="pill">Budget ${money(inquiry.budget)}</span>` : ""}
              </div>
              ${inquiry.notes ? `<p class="muted small-text" style="margin-top: 10px;">${escapeHtml(inquiry.notes)}</p>` : ""}
              <div class="button-row" style="margin-top: 12px;">
                <select data-inquiry-status="${escapeHtml(inquiry.id)}" aria-label="Inquiry status">
                  ${inquiryStatuses.map((status) => `<option ${status === inquiry.status ? "selected" : ""}>${status}</option>`).join("")}
                </select>
                <button class="btn small" type="button" data-action="convert-inquiry" data-id="${escapeHtml(inquiry.id)}">Convert to order</button>
              </div>
            </article>
          `).join("") || emptyState("No inquiries yet.")}
        </div>
      </section>
    </section>
  `;
}

function renderReports() {
  const report = buildReportData();

  return `
    <section class="content reports-content">
      <section class="metric-grid reports-metrics">
        ${metricCard("Lead Conversion", `${report.conversionRate}%`, `${report.convertedLeads} converted from ${report.totalLeads} leads`, "reports", report.conversionRate >= 40 ? "up" : "")}
        ${metricCard("Revenue Pipeline", money(report.revenuePipeline), `${report.activeOrders.length} active orders`, "orders", "up")}
        ${metricCard("Production Pressure", report.productionPressure, `${report.overdueOrders.length} overdue, ${report.dueSoon.length} due soon`, "production", report.overdueOrders.length ? "alert" : "")}
        ${metricCard("Stock Risk", report.lowStock.length, report.lowStock.length ? "Restock watchlist active" : "All materials above minimum", "warning", report.lowStock.length ? "alert" : "")}
      </section>

      <section class="grid-2">
        <article class="panel report-panel">
          <div class="panel-header">
            <div>
              <h2>Reply drafts</h2>
              <p>Suggested replies for open channel messages.</p>
            </div>
            <span class="status">${report.replyDrafts.length} ready</span>
          </div>
          <div class="list">
            ${report.replyDrafts.map(renderReplyDraft).join("") || emptyState("No open channel messages need replies.")}
          </div>
        </article>

        <article class="panel report-panel">
          <div class="panel-header">
            <div>
              <h2>Quote drafts</h2>
              <p>First-pass quote language from inquiry details and style recipes.</p>
            </div>
            <span class="status">${report.quoteDrafts.length} ready</span>
          </div>
          <div class="list">
            ${report.quoteDrafts.map(renderQuoteDraft).join("") || emptyState("No inquiry is waiting for a quote draft.")}
          </div>
        </article>
      </section>

      <section class="grid-2">
        <article class="panel report-panel">
          <div class="panel-header">
            <div>
              <h2>Smart stock alerts</h2>
              <p>Materials with low available stock or active reservation pressure.</p>
            </div>
          </div>
          <div class="report-alert-grid">
            ${report.stockAlerts.map(renderStockAlert).join("") || emptyState("No stock pressure detected.")}
          </div>
        </article>

        <article class="panel report-panel">
          <div class="panel-header">
            <div>
              <h2>Production load</h2>
              <p>Where the current work is concentrated.</p>
            </div>
          </div>
          <div class="report-step-list">
            ${report.stepLoad.map(({ step, count, percent: stepPercent }) => `
              <div class="progress-line">
                <div class="record-header">
                  <strong>${escapeHtml(step)}</strong>
                  <span class="pill">${count} ${count === 1 ? "piece" : "pieces"}</span>
                </div>
                <div class="progress-bar"><span style="width: ${stepPercent}%;"></span></div>
              </div>
            `).join("")}
          </div>
        </article>
      </section>

      <section class="panel report-panel">
        <div class="panel-header">
          <div>
            <h2>Learning insights</h2>
            <p>Estimate-versus-actual usage signals from completed work.</p>
          </div>
          <span class="status">${state.usageRecords.length} records</span>
        </div>
        <div class="grid-3 report-insight-grid">
          ${report.learningInsights.map(renderLearningInsight).join("") || emptyState("Complete orders with usage notes to build estimate intelligence.")}
        </div>
      </section>
    </section>
  `;
}

function renderReplyDraft(draft) {
  return `
    <article class="record draft-card">
      <div class="record-header">
        <div>
          <strong>${escapeHtml(draft.name)}</strong>
          <p class="muted small-text">${escapeHtml(draft.channel)}${draft.contact ? ` - ${escapeHtml(draft.contact)}` : ""}</p>
        </div>
        <span class="status ${statusTone(draft.followUpStatus)}">${escapeHtml(draft.followUpStatus)}</span>
      </div>
      <p class="draft-copy">${escapeHtml(draft.copy)}</p>
      <div class="tag-list">
        ${draft.desiredStyle ? `<span class="pill">${escapeHtml(draft.desiredStyle)}</span>` : ""}
        ${draft.deadline ? `<span class="pill">Due ${formatDate(draft.deadline)}</span>` : ""}
      </div>
    </article>
  `;
}

function renderQuoteDraft(draft) {
  return `
    <article class="record draft-card">
      <div class="record-header">
        <div>
          <strong>${escapeHtml(draft.clientName)}</strong>
          <p class="muted small-text">${escapeHtml(draft.desiredStyle || "Custom garment")} - ${escapeHtml(draft.channel)}</p>
        </div>
        <span class="status">${escapeHtml(draft.status)}</span>
      </div>
      <p class="draft-copy">${escapeHtml(draft.copy)}</p>
      <div class="report-split">
        <span><strong>${money(draft.estimate)}</strong><small> Suggested quote</small></span>
        <span><strong>${draft.productionDays}</strong><small> days</small></span>
      </div>
    </article>
  `;
}

function renderStockAlert(alert) {
  return `
    <article class="record report-alert ${alert.tone}">
      <div class="record-header">
        <div>
          <strong>${escapeHtml(alert.name)}</strong>
          <p class="muted small-text">${escapeHtml(alert.category)} - ${alert.available} ${escapeHtml(alert.unit)} available</p>
        </div>
        <span class="status ${alert.tone}">${escapeHtml(alert.label)}</span>
      </div>
      <p class="muted small-text">${escapeHtml(alert.note)}</p>
    </article>
  `;
}

function renderLearningInsight(insight) {
  return `
    <article class="record report-insight">
      <div class="record-header">
        <div>
          <strong>${escapeHtml(insight.title)}</strong>
          <p class="muted small-text">${escapeHtml(insight.detail)}</p>
        </div>
        <span class="status ${insight.tone}">${escapeHtml(insight.value)}</span>
      </div>
    </article>
  `;
}

function renderChannelMessageCard(message) {
  const canRoute = message.routingStatus !== "Routed to Inquiry";
  const isArchived = message.routingStatus === "Archived";
  return `
    <article class="record channel-message ${isArchived ? "is-archived" : ""}">
      <div class="record-header">
        <div class="title-line">
          <strong>${escapeHtml(message.senderName || message.contact || "Unknown sender")}</strong>
          <span class="muted small-text">${escapeHtml(message.channel)}${message.contact ? ` - ${escapeHtml(message.contact)}` : ""}</span>
        </div>
        <span class="status ${statusTone(message.routingStatus)}">${escapeHtml(message.routingStatus)}</span>
      </div>
      <div class="channel-message-body">
        <p>${escapeHtml(message.message || "No raw message captured.")}</p>
      </div>
      <div class="tag-list">
        ${message.desiredStyle ? `<span class="pill">${escapeHtml(message.desiredStyle)}</span>` : ""}
        ${message.occasion ? `<span class="pill">${escapeHtml(message.occasion)}</span>` : ""}
        ${message.deadline ? `<span class="pill">Due ${formatDate(message.deadline)}</span>` : ""}
        ${message.budget ? `<span class="pill">Budget ${money(message.budget)}</span>` : ""}
        <span class="pill">Received ${formatDate(String(message.receivedAt || "").slice(0, 10))}</span>
        <span class="pill">${escapeHtml(message.consentStatus || "Unknown")} consent</span>
        ${message.providerMessageId ? `<span class="pill">Provider ${escapeHtml(message.providerMessageId)}</span>` : ""}
      </div>
      ${message.notes ? `<p class="muted small-text channel-message-note">${escapeHtml(message.notes)}</p>` : ""}
      <div class="channel-actions">
        <label class="field channel-follow-up">
          <span>Follow-up</span>
          <select data-channel-followup="${escapeHtml(message.id)}" aria-label="Follow-up status for ${escapeHtml(message.senderName || message.contact || "message")}">
            ${channelFollowUpStatuses.map((status) => `<option ${status === message.followUpStatus ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
          </select>
        </label>
        <div class="button-row">
          ${canRoute ? `<button class="btn small" type="button" data-action="route-channel-message" data-id="${escapeHtml(message.id)}">Route to inquiry</button>` : `<button class="btn small secondary" type="button" data-nav="inquiries">In pipeline</button>`}
          ${isArchived ? `<button class="btn small secondary" type="button" data-action="reopen-channel-message" data-id="${escapeHtml(message.id)}">Reopen</button>` : `<button class="btn small secondary" type="button" data-action="archive-channel-message" data-id="${escapeHtml(message.id)}">Archive</button>`}
        </div>
      </div>
    </article>
  `;
}

function renderClients() {
  return `
    <section class="content">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Add client profile</h2>
            <p>Profiles carry contact details, measurements, order history, style preferences, and fitting notes.</p>
          </div>
        </div>
        <form id="clientForm" class="form-grid">
          <label class="field">
            <span>Name</span>
            <input name="name" required>
          </label>
          <label class="field">
            <span>Phone</span>
            <input name="phone">
          </label>
          <label class="field">
            <span>Email</span>
            <input name="email" type="email">
          </label>
          <label class="field">
            <span>Address</span>
            <input name="address">
          </label>
          <label class="field full">
            <span>Style preferences</span>
            <textarea name="stylePreferences"></textarea>
          </label>
          <label class="field full">
            <span>Fitting notes</span>
            <textarea name="fittingNotes"></textarea>
          </label>
          <label class="field full">
            <span>Important dates/events</span>
            <input name="importantDates" placeholder="Wedding, birthday, collection launch">
          </label>
          <div class="field full">
            <button class="btn" type="submit">Save client</button>
          </div>
        </form>
      </section>

      <section class="grid-3">
        ${state.clients.map(renderClientCard).join("") || emptyState("No clients yet.")}
      </section>
    </section>
  `;
}

function renderMeasurements() {
  const client = state.clients.find((item) => item.id === selectedClientId) || state.clients[0];
  if (client && selectedClientId !== client.id) {
    selectedClientId = client.id;
  }

  if (!client) {
    return `<section class="content">${emptyState("Create a client before recording measurements.")}</section>`;
  }

  const measurements = Object.entries(client.measurements || {});
  const requiredAcrossStyles = [...new Set(state.styles.flatMap((style) => style.requiredMeasurements || []))];

  return `
    <section class="content">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Measurement profile</h2>
            <p>Flexible by client and garment. Add custom fields whenever a style needs them.</p>
          </div>
          <select id="measurementClient" aria-label="Select client">
            ${state.clients.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === client.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
          </select>
        </div>
        <div class="tag-list">
          ${requiredAcrossStyles.map((field) => `<span class="pill">${escapeHtml(field)}</span>`).join("")}
        </div>
        <div class="divider"></div>
        <form id="measurementForm" class="form-grid">
          <label class="field">
            <span>Measurement field</span>
            <input name="label" list="measurementOptions" required placeholder="Shoulder">
            <datalist id="measurementOptions">
              ${commonMeasurements.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}
            </datalist>
          </label>
          <label class="field">
            <span>Value (${escapeHtml(state.profile.measurementUnit || "inches")})</span>
            <input name="value" required placeholder="16">
          </label>
          <div class="field full">
            <button class="btn" type="submit">Add or update measurement</button>
          </div>
        </form>
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>${escapeHtml(client.name)} measurements</h2>
            <p>Saved values can be used by style recipes and order estimates.</p>
          </div>
        </div>
        <div class="grid-3">
          ${measurements.map(([label, value]) => `
            <article class="record">
              <div class="record-header">
                <div>
                  <strong>${escapeHtml(label)}</strong>
                  <p class="muted">${escapeHtml(value)} ${escapeHtml(state.profile.measurementUnit || "inches")}</p>
                </div>
                <button class="btn small secondary" type="button" data-action="delete-measurement" data-label="${escapeHtml(label)}">Remove</button>
              </div>
            </article>
          `).join("") || emptyState("No measurements saved for this client.")}
        </div>
      </section>
    </section>
  `;
}

function renderOrders() {
  if (!state.clients.length || !state.styles.length || !state.inventory.some((item) => item.category === "Fabric")) {
    return `<section class="content">${emptyState("Add clients, style recipes, and fabric inventory before creating orders.")}</section>`;
  }

  if (!state.styles.some((style) => style.id === draftOrderStyleId)) {
    draftOrderStyleId = state.styles[0].id;
  }
  const draftStyle = getStyle(draftOrderStyleId);
  const defaultQuote = draftStyle ? adjustedPrice(draftStyle, []) : 0;

  return `
    <section class="content">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Create order draft</h2>
            <p>Draft orders can be quoted first, then confirmed to reserve estimated materials.</p>
          </div>
        </div>
        <form id="orderForm" class="form-grid">
          <label class="field">
            <span>Client</span>
            <select name="clientId">
              ${state.clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Garment/style</span>
            <select id="orderStyle" name="styleId">
              ${state.styles.map((style) => `<option value="${escapeHtml(style.id)}" ${style.id === draftOrderStyleId ? "selected" : ""}>${escapeHtml(style.name)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Main fabric/material</span>
            <select name="fabricId">
              ${state.inventory.filter((item) => item.category === "Fabric").map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} - ${availableQty(item)} ${escapeHtml(item.unit)} available</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Deadline</span>
            <input name="deadline" type="date" required value="${isoDate(14)}">
          </label>
          <label class="field">
            <span>Fitting date</span>
            <input name="fittingDate" type="date" value="${isoDate(9)}">
          </label>
          <label class="field">
            <span>Quote/price</span>
            <input name="quote" type="number" min="0" step="1000" value="${defaultQuote}">
          </label>
          <label class="field">
            <span>Deposit received</span>
            <input name="deposit" type="number" min="0" step="1000" value="0">
          </label>
          <label class="field">
            <span>Assigned tailor/staff</span>
            <input name="assignedTo" placeholder="Tailor team A">
          </label>
          <div class="field full">
            <span>Design modifiers</span>
            <div class="checkbox-grid">
              ${(draftStyle?.modifiers || []).map((modifier) => `
                <label class="check-tile">
                  <input type="checkbox" name="modifiers" value="${escapeHtml(modifier.id)}">
                  <span>${escapeHtml(modifier.name)} ${modifier.fabricDelta ? `(+${modifier.fabricDelta} ${escapeHtml(draftStyle.fabricUnit)})` : ""}</span>
                </label>
              `).join("") || `<span class="muted">No modifiers for this style yet.</span>`}
            </div>
          </div>
          <label class="field full">
            <span>Tailoring notes</span>
            <textarea name="notes" placeholder="Fitting, cutting, finishing, or consultation notes"></textarea>
          </label>
          <div class="field full">
            <button class="btn" type="submit">Save order draft</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Orders</h2>
            <p>Reserve at confirmation, deduct fabric when cutting starts, and close the loop after finishing.</p>
          </div>
        </div>
        <div class="list">
          ${state.orders.map(renderOrderCard).join("") || emptyState("No orders yet.")}
        </div>
      </section>

    </section>
  `;
}

function renderRecipes() {
  return `
    <section class="content">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Add garment/style recipe</h2>
            <p>Recipes are practical estimates. Tailors can refine them as actual usage comes in.</p>
          </div>
        </div>
        <form id="recipeForm" class="form-grid">
          <label class="field">
            <span>Style name</span>
            <input name="name" required placeholder="Dress, jacket, skirt">
          </label>
          <label class="field">
            <span>Category</span>
            <input name="category" required placeholder="Casual wear">
          </label>
          <label class="field">
            <span>Base price</span>
            <input name="basePrice" type="number" min="0" step="1000" required>
          </label>
          <label class="field">
            <span>Estimated production days</span>
            <input name="productionDays" type="number" min="1" value="7">
          </label>
          <label class="field">
            <span>Base fabric requirement</span>
            <input name="baseFabric" type="number" min="0" step="0.1" required>
          </label>
          <label class="field">
            <span>Fabric width basis</span>
            <select name="fabricWidth">
              <option value="45">45 inches</option>
              <option value="54">54 inches</option>
              <option value="60">60 inches</option>
            </select>
          </label>
          <label class="field">
            <span>Wastage allowance %</span>
            <input name="wastagePercent" type="number" min="0" max="50" value="10">
          </label>
          <label class="field">
            <span>Required measurements</span>
            <input name="requiredMeasurements" placeholder="Shoulder, Waist, Dress length">
          </label>
          <label class="field">
            <span>Modifier name</span>
            <input name="modifierName" placeholder="Flared cut">
          </label>
          <label class="field">
            <span>Modifier fabric delta</span>
            <input name="modifierFabricDelta" type="number" step="0.1" value="0">
          </label>
          <label class="field full">
            <span>Notes</span>
            <textarea name="notes"></textarea>
          </label>
          <div class="field full">
            <button class="btn" type="submit">Save style recipe</button>
          </div>
        </form>
      </section>

      <section class="grid-3">
        ${state.styles.map(renderRecipeCard).join("")}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Estimate learning</h2>
            <p>Use completed-order differences to tune each recipe.</p>
          </div>
        </div>
        <div class="list">
          ${state.usageRecords.map(renderLearningRecord).join("") || emptyState("No learning records yet.")}
        </div>
      </section>
    </section>
  `;
}

function renderInventory() {
  return `
    <section class="content">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Add material</h2>
            <p>Track fabric and non-fabric materials with stock, reserved quantity, availability, supplier, and cost.</p>
          </div>
        </div>
        <form id="inventoryForm" class="form-grid">
          <label class="field">
            <span>Item name</span>
            <input name="name" required>
          </label>
          <label class="field">
            <span>Category</span>
            <select name="category">
              ${["Fabric", "Lining", "Thread", "Buttons", "Zippers", "Interfacing/stay", "Elastic", "Trims/lace", "Embroidery materials", "Beads/stones", "Labels/tags", "Packaging", "Other materials"].map((category) => `<option>${category}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Fabric type</span>
            <input name="fabricType" placeholder="Cotton, silk, aso-oke">
          </label>
          <label class="field">
            <span>Color/pattern</span>
            <input name="colorPattern" placeholder="Black, indigo print">
          </label>
          <label class="field">
            <span>Width</span>
            <input name="width" type="number" min="0" step="1" placeholder="45">
          </label>
          <label class="field">
            <span>Unit</span>
            <input name="unit" required value="${escapeHtml(state.profile.fabricUnit || "yards")}">
          </label>
          <label class="field">
            <span>Quantity in stock</span>
            <input name="quantity" type="number" min="0" step="0.1" required>
          </label>
          <label class="field">
            <span>Minimum stock alert</span>
            <input name="minimumStock" type="number" min="0" step="0.1" value="1">
          </label>
          <label class="field">
            <span>Supplier</span>
            <input name="supplier">
          </label>
          <label class="field">
            <span>Cost per unit</span>
            <input name="costPerUnit" type="number" min="0" step="1">
          </label>
          <label class="field full">
            <span>Notes</span>
            <textarea name="notes"></textarea>
          </label>
          <div class="field full">
            <button class="btn" type="submit">Save material</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Fabric & materials inventory</h2>
            <p>Available stock is quantity in stock minus reserved quantity.</p>
          </div>
        </div>
        <div class="material-table">
          <div class="material-row table-head">
            <span>Item</span>
            <span>Category</span>
            <span>In stock</span>
            <span>Reserved</span>
            <span>Available</span>
            <span>Status & actions</span>
          </div>
          ${state.inventory.map(renderMaterialRow).join("")}
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Inventory adjustment history</h2>
            <p>Restocks, corrections, damages, and manual counts are logged for store operations review.</p>
          </div>
        </div>
        <div class="list">
          ${state.inventoryAdjustments.slice(0, 8).map(renderInventoryAdjustment).join("") || emptyState("No inventory adjustments logged yet.")}
        </div>
      </section>
    </section>
  `;
}

function renderProduction() {
  const activeOrders = state.orders.filter((order) => !["Completed", "Cancelled"].includes(order.status));

  return `
    <section class="content">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Production tracker</h2>
            <p>The pipeline follows consultation, measurement, design confirmation, stock reserve, cutting, sewing, fitting, finishing, QC, readiness, and delivery.</p>
          </div>
        </div>
        <div class="pipeline">
          ${productionSteps.map((step) => {
            const orders = activeOrders.filter((order) => order.productionStep === step);
            return `
              <div class="pipeline-column">
                <h3>${escapeHtml(step)} (${orders.length})</h3>
                <div class="list">
                  ${orders.map((order) => `
                    <div class="record">
                      <strong>${escapeHtml(getClient(order.clientId)?.name || "Unknown client")}</strong>
                      <p class="muted small-text">${escapeHtml(getStyle(order.styleId)?.name || "Custom style")} - due ${formatDate(order.deadline)}</p>
                      <div class="button-row" style="margin-top: 10px;">
                        ${order.productionStep === "Materials Reserved" ? `<button class="btn small secondary" type="button" data-nav="orders">Cut from Orders</button>` : `<button class="btn small" type="button" data-action="advance-order" data-id="${escapeHtml(order.id)}">Advance</button>`}
                      </div>
                    </div>
                  `).join("") || `<p class="muted small-text">No work here.</p>`}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    </section>
  `;
}

function renderSettings() {
  const profile = state.profile;
  const theme = { ...defaultTheme, ...(profile.theme || {}) };

  return `
    <section class="content">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Appearance & branding</h2>
            <p>Update the business identity and CSS theme tokens used across the app.</p>
          </div>
          <div class="button-row">
            <button class="btn small secondary" type="button" data-action="apply-premium-brand">Apply premium atelier preset</button>
            <button class="btn small secondary" type="button" data-action="apply-neutral-brand">Use neutral theme</button>
          </div>
        </div>
        <form id="settingsForm">
          ${renderProfileFields(theme, profile)}
          <div class="field full">
            <button class="btn" type="submit">Save branding</button>
          </div>
        </form>
      </section>

      ${renderAccountSecurityPanel()}

      ${currentUser()?.role === "manager" ? renderTeamAccessPanel() : renderAccessSummaryPanel()}

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Workspace data</h2>
            <p>Your records are saved automatically as you work.</p>
          </div>
          <span class="status">${escapeHtml(storageMessage)}</span>
        </div>
        <div class="button-row">
          <button class="btn danger" type="button" data-action="reset-demo">Reset workspace data</button>
        </div>
      </section>
    </section>
  `;
}

function renderTeamAccessPanel() {
  const members = teamMembers();
  const remaining = Math.max(0, TEAM_LIMIT - auth.users.length);
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Team access</h2>
          <p>Add managers and staff for this workspace and assign the sections each person can use.</p>
        </div>
        <span class="status">${auth.users.length}/${TEAM_LIMIT} users</span>
      </div>
      ${lastInviteResult ? renderInviteResult(lastInviteResult) : ""}
      ${lastRecoveryResult && lastRecoveryResult.context === "team" ? renderRecoveryResult(lastRecoveryResult) : ""}
      ${remaining ? backendReady && auth.serverManaged ? renderStaffInviteForm() : renderStaffCreateForm() : `<div class="empty">User limit reached. Remove an account before adding another.</div>`}
      <div class="team-list">
        ${members.map(renderStaffAccessCard).join("") || emptyState("No other team members yet.")}
      </div>
      ${renderAuditPanel()}
    </section>
  `;
}

function renderAccountSecurityPanel() {
  const user = currentUser();
  if (!user) return "";
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Account security</h2>
          <p>Update your password. Other active sessions for this account are signed out after the change.</p>
        </div>
        <span class="status">${escapeHtml(statusLabel(user.status))}</span>
      </div>
      <form id="passwordForm" class="form-grid">
        <label class="field">
          <span>Current password</span>
          <input name="currentPassword" type="password" autocomplete="current-password" required>
        </label>
        <label class="field">
          <span>New password</span>
          <input name="password" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD_LENGTH}">
        </label>
        <label class="field">
          <span>Confirm password</span>
          <input name="confirmPassword" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD_LENGTH}">
        </label>
        <div class="field">
          <button class="btn small" type="submit">Change password</button>
        </div>
      </form>
      ${backendReady && auth.serverManaged ? renderRecoveryCodePanel(user) : ""}
    </section>
  `;
}

function renderRecoveryCodePanel(user) {
  const issued = clean(user.recoveryIssuedAt);
  return `
    <div class="panel-header">
      <div>
        <h2>Recovery code</h2>
        <p>The only way back into this account if the password is lost. Generating a new code replaces any previous one.</p>
      </div>
      ${issued ? `<span class="status">Issued ${escapeHtml(formatDate(issued))}</span>` : `<span class="status">None saved</span>`}
    </div>
    ${lastRecoveryResult && lastRecoveryResult.context !== "team" ? renderRecoveryResult(lastRecoveryResult) : ""}
    <div class="button-row">
      <button class="btn small secondary" type="button" data-action="create-recovery-code">Generate recovery code</button>
    </div>
  `;
}

function renderRecoveryResult(recovery) {
  return `
    <div class="inline-callout">
      <div>
        <strong>Recovery code for ${escapeHtml(recovery.email)}</strong>
        <p class="muted small-text">Save this now. It is shown once, never shown again, and can only be used once. Anyone with this code can reset the password for this account.</p>
      </div>
      <code>${escapeHtml(recovery.recoveryCode)}</code>
      <div class="button-row">
        <button class="btn small secondary" type="button" data-action="dismiss-recovery-code">I have saved it</button>
      </div>
    </div>
  `;
}

function renderAccessSummaryPanel() {
  const user = currentUser();
  const access = normalizeAccess(user?.access);
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Your access</h2>
          <p>Your manager controls which Studio OS sections are available to this account.</p>
        </div>
      </div>
      <div class="access-chip-list">
        ${access.map((view) => `<span class="status">${escapeHtml(viewLabel(view))}</span>`).join("")}
      </div>
    </section>
  `;
}

function renderStaffCreateForm() {
  return `
    <form id="staffForm" class="staff-form">
      <div class="form-grid">
        <label class="field">
          <span>Member name</span>
          <input name="name" required placeholder="Tailor, admin, or co-manager">
        </label>
        <label class="field">
          <span>Email</span>
          <input name="email" type="email" required placeholder="member@studio.com">
        </label>
        <label class="field">
          <span>Role</span>
          <select name="role">
            <option value="staff">Staff (limited access)</option>
            <option value="manager">Manager (full access)</option>
          </select>
        </label>
        <label class="field">
          <span>Password</span>
          <input name="password" type="password" required minlength="${MIN_PASSWORD_LENGTH}" placeholder="Minimum ${MIN_PASSWORD_LENGTH} characters">
        </label>
        <div class="field">
          <span>Access (staff only)</span>
          ${renderAccessChecks(["dashboard", "orders", "clients", "measurements"])}
        </div>
      </div>
      <div class="button-row">
        <button class="btn small" type="submit">Create account</button>
      </div>
    </form>
  `;
}

function renderStaffInviteForm() {
  return `
    <form id="staffInviteForm" class="staff-form">
      <div class="form-grid">
        <label class="field">
          <span>Member name</span>
          <input name="name" required autocomplete="name" placeholder="Tailor, admin, or co-manager">
        </label>
        <label class="field">
          <span>Email</span>
          <input name="email" type="email" autocomplete="email" required placeholder="member@studio.com">
        </label>
        <label class="field">
          <span>Role</span>
          <select name="role">
            <option value="staff">Staff (limited access)</option>
            <option value="manager">Manager (full access)</option>
          </select>
        </label>
        <div class="field">
          <span>Access (staff only)</span>
          ${renderAccessChecks(["dashboard", "orders", "clients", "measurements"])}
        </div>
      </div>
      <div class="button-row">
        <button class="btn small" type="submit">Create invite</button>
      </div>
    </form>
  `;
}

function renderInviteResult(invite) {
  return `
    <div class="inline-callout">
      <div>
        <strong>Invite token created for ${escapeHtml(invite.email)}</strong>
        <p class="muted small-text">Share this once with the staff member. It expires ${formatDate(invite.inviteExpiresAt)}.</p>
      </div>
      <code>${escapeHtml(invite.inviteToken)}</code>
    </div>
  `;
}

function renderStaffAccessCard(user) {
  const status = statusLabel(user.status);
  const roleBadge = user.role === "manager" ? `<span class="status">Manager</span>` : "";

  if (user.role === "manager") {
    return `
      <article class="team-card">
        <div>
          <h3>${escapeHtml(user.name)} ${roleBadge} <span class="status">${escapeHtml(status)}</span></h3>
          <p>${escapeHtml(user.email)}${user.lastSignInAt ? ` · Last sign-in ${formatDate(user.lastSignInAt)}` : ""}</p>
          ${user.inviteExpiresAt ? `<p class="muted small-text">Invite expires ${formatDate(user.inviteExpiresAt)}</p>` : ""}
          <p class="muted small-text">Managers have full access. To remove a manager, reset the workspace.</p>
        </div>
        ${backendReady && auth.serverManaged ? `
          <div class="button-row">
            <button class="btn small secondary" type="button" data-action="reset-user-password" data-id="${escapeHtml(user.id)}">Issue recovery code</button>
          </div>
        ` : ""}
      </article>
    `;
  }

  return `
    <article class="team-card">
      <div>
        <h3>${escapeHtml(user.name)} <span class="status">${escapeHtml(status)}</span></h3>
        <p>${escapeHtml(user.email)}${user.lastSignInAt ? ` · Last sign-in ${formatDate(user.lastSignInAt)}` : ""}</p>
        ${user.inviteExpiresAt ? `<p class="muted small-text">Invite expires ${formatDate(user.inviteExpiresAt)}</p>` : ""}
      </div>
      <form data-staff-access="${escapeHtml(user.id)}">
        ${renderAccessChecks(user.access, `access-${user.id}`)}
        <div class="button-row">
          <button class="btn small secondary" type="submit">Save access</button>
          ${user.status === "suspended"
            ? `<button class="btn small secondary" type="button" data-action="reactivate-staff" data-id="${escapeHtml(user.id)}">Reactivate</button>`
            : `<button class="btn small secondary" type="button" data-action="suspend-staff" data-id="${escapeHtml(user.id)}">Suspend</button>`}
          ${backendReady && auth.serverManaged
            ? `<button class="btn small secondary" type="button" data-action="reset-user-password" data-id="${escapeHtml(user.id)}">Issue recovery code</button>`
            : ""}
          <button class="btn small danger" type="button" data-action="delete-staff" data-id="${escapeHtml(user.id)}">Remove</button>
        </div>
      </form>
    </article>
  `;
}

function renderAuditPanel() {
  const events = normalizeAuditEvents(auth.auditEvents).slice().reverse().slice(0, 8);
  return `
    <div class="audit-panel">
      <div class="panel-header compact">
        <div>
          <h3>Access audit</h3>
          <p>Recent account and staff permission events.</p>
        </div>
      </div>
      <div class="audit-list">
        ${events.map((event) => `
          <div class="audit-row">
            <span>${escapeHtml(event.detail || event.type)}</span>
            <span class="muted small-text">${escapeHtml(event.actorEmail || "system")} · ${formatDate(event.createdAt)}</span>
          </div>
        `).join("") || emptyState("No access events yet.")}
      </div>
    </div>
  `;
}

function renderAccessChecks(selected = [], name = "access") {
  const allowed = new Set(normalizeAccess(selected));
  return `
    <div class="access-grid">
      ${navItems.map(([view, icon, label]) => `
        <label class="access-tile">
          <input name="${escapeHtml(name)}" type="checkbox" value="${escapeHtml(view)}" ${allowed.has(view) ? "checked" : ""}>
          <span class="nav-icon">${iconSvg(icon)}</span>
          <span>${escapeHtml(label)}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function renderProfileFields(theme, profile = {}) {
  const businessTypes = ["Tailoring studio", "Fashion designer", "Garment maker", "Fashion brand", "Alterations studio", "Production house", "Contemporary fashion studio"];
  return `
    <div class="form-grid">
      <label class="field">
        <span>Business name</span>
        <input name="businessName" required value="${escapeHtml(profile.businessName || "")}" placeholder="Needle House Studio">
      </label>
      <label class="field">
        <span>Business display name</span>
        <input name="displayName" value="${escapeHtml(profile.displayName || profile.businessName || "")}" placeholder="Needle House">
      </label>
      <label class="field">
        <span>Business type</span>
        <select name="businessType">
          ${businessTypes.map((type) => `<option ${type === profile.businessType ? "selected" : ""}>${type}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span>Logo/business mark</span>
        <input name="logo" type="file" accept="image/*">
      </label>
      <label class="field">
        <span>Logo view</span>
        <select name="logoView">
          <option value="square" ${(profile.logoView || "square") === "square" ? "selected" : ""}>1:1 square</option>
          <option value="circle" ${profile.logoView === "circle" ? "selected" : ""}>Circle</option>
        </select>
      </label>
      <label class="field">
        <span>Phone</span>
        <input name="phone" value="${escapeHtml(profile.phone || "")}">
      </label>
      <label class="field">
        <span>Email</span>
        <input name="email" type="email" value="${escapeHtml(profile.email || "")}">
      </label>
      <label class="field full">
        <span>Address</span>
        <input name="address" value="${escapeHtml(profile.address || "")}">
      </label>
      <label class="field full">
        <span>Tagline</span>
        <input name="tagline" value="${escapeHtml(profile.tagline || "")}" placeholder="Beyond Fabric.">
      </label>
      <label class="field">
        <span>Currency</span>
        <select name="currency">
          ${["NGN", "USD", "GHS", "KES", "ZAR", "GBP", "EUR"].map((currency) => `<option ${currency === (profile.currency || "NGN") ? "selected" : ""}>${currency}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span>Preferred measurement unit</span>
        <select name="measurementUnit">
          ${["inches", "centimeters"].map((unit) => `<option ${unit === (profile.measurementUnit || "inches") ? "selected" : ""}>${unit}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span>Preferred fabric unit</span>
        <select name="fabricUnit">
          ${["yards", "meters"].map((unit) => `<option ${unit === (profile.fabricUnit || "yards") ? "selected" : ""}>${unit}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span>Background mode</span>
        <select name="backgroundMode">
          <option value="light" ${theme.backgroundMode === "light" ? "selected" : ""}>Light</option>
          <option value="dark" ${theme.backgroundMode === "dark" ? "selected" : ""}>Dark</option>
        </select>
      </label>
      <label class="field">
        <span>Background</span>
        <input name="background" type="color" value="${escapeHtml(theme.background)}">
      </label>
      <label class="field">
        <span>Surface</span>
        <input name="surface" type="color" value="${escapeHtml(theme.surface)}">
      </label>
      <label class="field">
        <span>Elevated surface</span>
        <input name="surfaceElevated" type="color" value="${escapeHtml(theme.surfaceElevated)}">
      </label>
      <label class="field">
        <span>Primary text</span>
        <input name="textPrimary" type="color" value="${escapeHtml(theme.textPrimary)}">
      </label>
      <label class="field">
        <span>Muted text</span>
        <input name="textMuted" type="color" value="${escapeHtml(theme.textMuted)}">
      </label>
      <label class="field">
        <span>Primary color</span>
        <input name="primary" type="color" value="${escapeHtml(theme.primary)}">
      </label>
      <label class="field">
        <span>Accent color</span>
        <input name="accent" type="color" value="${escapeHtml(theme.accent)}">
      </label>
      <label class="field">
        <span>Header/sidebar color</span>
        <input name="sidebar" type="color" value="${escapeHtml(theme.sidebar)}">
      </label>
      <label class="field">
        <span>Highlight/success color</span>
        <input name="success" type="color" value="${escapeHtml(theme.success)}">
      </label>
      <label class="field">
        <span>Warning color</span>
        <input name="warning" type="color" value="${escapeHtml(theme.warning || theme.accent)}">
      </label>
      <label class="field">
        <span>Sand</span>
        <input name="sand" type="color" value="${escapeHtml(theme.sand)}">
      </label>
      <label class="field">
        <span>Warm surface</span>
        <input name="warmSurface" type="color" value="${escapeHtml(theme.warmSurface)}">
      </label>
      <label class="field">
        <span>Border token</span>
        <input name="border" value="${escapeHtml(theme.border)}" placeholder="rgba(245, 241, 232, 0.12)">
      </label>
    </div>
  `;
}

function wireEvents() {
  app.onclick = (event) => {
    const authModeButton = event.target.closest("[data-auth-mode]");
    if (authModeButton) {
      authMode = ["signin", "signup", "invite", "recover"].includes(authModeButton.dataset.authMode) ? authModeButton.dataset.authMode : "signin";
      render();
      return;
    }

    const navButton = event.target.closest("[data-nav]");
    if (navButton) {
      currentView = navButton.dataset.nav;
      mobileNavOpen = false;
      localStorage.setItem(VIEW_KEY, currentView);
      render();
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    const { action, id, label } = actionButton.dataset;
    if (action === "toggle-mobile-nav") {
      mobileNavOpen = !mobileNavOpen;
      render();
      return;
    }
    if (action === "close-mobile-nav") {
      mobileNavOpen = false;
      render();
      return;
    }
    if (action === "route-channel-message") routeChannelMessage(id);
    if (action === "archive-channel-message") updateChannelRouting(id, "Archived");
    if (action === "reopen-channel-message") updateChannelRouting(id, "New");
    if (action === "convert-inquiry") convertInquiry(id);
    if (action === "open-measurements") openMeasurements(id);
    if (action === "delete-measurement") deleteMeasurement(label);
    if (action === "reserve-order") reserveOrder(id);
    if (action === "cut-order") cutOrder(id);
    if (action === "advance-order") advanceOrder(id);
    if (action === "complete-order") completeOrder(id);
    if (action === "cancel-order") cancelOrder(id);
    if (action === "record-payment") recordPayment(id);
    if (action === "schedule-fitting") scheduleFitting(id);
    if (action === "complete-fitting") completeLatestFitting(id);
    if (action === "request-manager-review") requestManagerReview(id);
    if (action === "approve-manager-review") approveManagerReview(id);
    if (action === "request-review-changes") requestReviewChanges(id);
    if (action === "update-follow-up") updateFollowUp(id);
    if (action === "handoff-order") handoffOrder(id);
    if (action === "restock-item") restockItem(id);
    if (action === "adjust-item") adjustInventoryItem(id);
    if (action === "apply-premium-brand") applyPremiumBrand();
    if (action === "apply-neutral-brand") applyNeutralBrand();
    if (action === "close-modal") closeModal();
    if (action === "confirm-delete-staff") confirmDeleteStaff(id);
    if (action === "confirm-reset-data") confirmResetLocalData();
    if (action === "sign-out") signOut();
    if (action === "suspend-staff") updateStaffStatus(id, "suspend-staff");
    if (action === "reactivate-staff") updateStaffStatus(id, "reactivate-staff");
    if (action === "delete-staff") deleteStaff(id);
    if (action === "create-recovery-code") createRecoveryCode();
    if (action === "reset-user-password") issueRecoveryCodeForUser(id);
    if (action === "dismiss-recovery-code") dismissRecoveryCode();
    if (action === "reset-demo") resetLocalData();
  };

  app.onchange = (event) => {
    const target = event.target;
    if (target.id === "orderStyle") {
      draftOrderStyleId = target.value;
      render();
      return;
    }
    if (target.id === "measurementClient") {
      selectedClientId = target.value;
      render();
      return;
    }
    if (target.matches("[data-inquiry-status]")) {
      const inquiry = state.inquiries.find((item) => item.id === target.dataset.inquiryStatus);
      if (inquiry) {
        inquiry.status = target.value;
        saveState();
        render();
      }
    }
    if (target.matches("[data-channel-followup]")) {
      const message = state.channelMessages.find((item) => item.id === target.dataset.channelFollowup);
      if (message) {
        message.followUpStatus = normalizeChoice(target.value, channelFollowUpStatuses, "Needs reply");
        saveState();
        showToast("Follow-up state updated.");
        render();
      }
    }
  };

  app.onkeydown = (event) => {
    if (event.key === "Escape" && mobileNavOpen) {
      mobileNavOpen = false;
      render();
      return;
    }
    if (event.key === "Escape" && modalState) {
      closeModal();
    }
  };

  app.onsubmit = (event) => {
    event.preventDefault();
    const form = event.target;
    if (form.id === "signinForm") handleSignIn(form);
    if (form.id === "signupForm") handleSignUp(form);
    if (form.id === "recoveryForm") handleRecoverySubmit(form);
    if (form.id === "inviteForm") handleInviteAccept(form);
    if (form.id === "setupForm") handleProfileSubmit(form, true);
    if (form.id === "settingsForm") handleProfileSubmit(form, false);
    if (form.id === "staffForm") handleStaffSubmit(form);
    if (form.id === "staffInviteForm") handleStaffInviteSubmit(form);
    if (form.id === "passwordForm") handlePasswordSubmit(form);
    if (form.dataset.staffAccess) handleStaffAccessSubmit(form);
    if (form.id === "channelMessageForm") handleChannelMessageSubmit(form);
    if (form.id === "inquiryForm") handleInquirySubmit(form);
    if (form.id === "clientForm") handleClientSubmit(form);
    if (form.id === "measurementForm") handleMeasurementSubmit(form);
    if (form.id === "inventoryForm") handleInventorySubmit(form);
    if (form.id === "recipeForm") handleRecipeSubmit(form);
    if (form.id === "orderForm") handleOrderSubmit(form);
    if (form.id === "restockForm") handleRestockSubmit(form);
    if (form.id === "paymentForm") handlePaymentSubmit(form);
    if (form.id === "fittingForm") handleFittingSubmit(form);
    if (form.id === "managerReviewForm") handleManagerReviewSubmit(form);
    if (form.id === "followUpForm") handleFollowUpSubmit(form);
    if (form.id === "handoffForm") handleHandoffSubmit(form);
    if (form.id === "inventoryAdjustmentForm") handleInventoryAdjustmentSubmit(form);
  };
}

async function handleSignUp(form) {
  const data = new FormData(form);
  const name = clean(data.get("name"));
  const email = clean(data.get("email")).toLowerCase();
  const password = String(data.get("password") || "");
  const confirmPassword = String(data.get("confirmPassword") || "");

  if (password.length < MIN_PASSWORD_LENGTH || password !== confirmPassword) {
    showToast(`Passwords must match and be at least ${MIN_PASSWORD_LENGTH} characters.`);
    return;
  }

  if (backendReady) {
    const result = await runServerAuthAction("signup", { name, email, password, confirmPassword }, {
      successMessage: "Manager access created.",
      nextView: "dashboard",
      // Signup is refused when this workspace already has a manager. Leaving the
      // user on the signup tab strands them: "Forgot password" only exists on
      // the sign-in tab, so the recovery route is invisible from here.
      onError: (error) => {
        if (/already exists/i.test(error?.message || "")) {
          authMode = "signin";
          render();
        }
      },
    });
    // Shown once and never stored. Without it, a forgotten password would make
    // this workspace unrecoverable.
    if (result?.recovery?.recoveryCode) {
      lastRecoveryResult = {
        email,
        recoveryCode: result.recovery.recoveryCode,
        context: "signup",
      };
      render();
    }
    return;
  }

  if (auth.users.some((user) => user.email === email)) {
    showToast("An account already exists for that email.");
    return;
  }
  if (auth.users.some((user) => user.role === "manager")) {
    authMode = "signin";
    showToast("Manager access already exists. Sign in, or use Forgot password if you have a recovery code.");
    render();
    return;
  }
  const manager = {
    id: uid("user"),
    name,
    email,
    password,
    role: "manager",
    access: fullAccess(),
    createdAt: isoDate(0),
  };
  auth.users.push(manager);
  auth.sessionUserId = manager.id;
  saveAuth();
  currentView = "dashboard";
  localStorage.setItem(VIEW_KEY, currentView);
  showToast("Manager access created.");
  render();
}

async function handleRecoverySubmit(form) {
  const data = new FormData(form);
  const email = clean(data.get("email")).toLowerCase();
  const recoveryCode = clean(data.get("recoveryCode"));
  const password = String(data.get("password") || "");
  const confirmPassword = String(data.get("confirmPassword") || "");

  if (!backendReady) {
    showToast("Account recovery requires server-managed auth.");
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH || password !== confirmPassword) {
    showToast(`Passwords must match and be at least ${MIN_PASSWORD_LENGTH} characters.`);
    return;
  }

  const result = await runServerAuthAction("redeem-recovery-code", { email, recoveryCode, password, confirmPassword }, {
    successMessage: "Password reset. Sign in with your new password.",
  });
  // Redeeming grants no session by design, so land on sign-in and let the new
  // password prove itself rather than assuming the reset worked.
  if (result?.passwordReset) {
    authMode = "signin";
    render();
  }
}

async function handleSignIn(form) {
  const data = new FormData(form);
  const email = clean(data.get("email")).toLowerCase();
  const password = String(data.get("password") || "");

  if (backendReady) {
    await runServerAuthAction("signin", { email, password }, {
      successMessage: "Signed in.",
      nextView: "first-accessible",
    });
    return;
  }

  const user = auth.users.find((item) => item.email === email && item.password === password);
  if (!user) {
    showToast("Sign in details do not match.");
    return;
  }
  auth.sessionUserId = user.id;
  saveAuth();
  const nav = accessibleNavItems();
  currentView = nav[0]?.[0] || "dashboard";
  localStorage.setItem(VIEW_KEY, currentView);
  showToast(`Welcome, ${user.name}.`);
  render();
}

async function handleInviteAccept(form) {
  const data = new FormData(form);
  const name = clean(data.get("name"));
  const email = clean(data.get("email")).toLowerCase();
  const inviteToken = clean(data.get("inviteToken"));
  const password = String(data.get("password") || "");
  const confirmPassword = String(data.get("confirmPassword") || "");

  if (!backendReady) {
    showToast("Staff invites are only available when you're signed in online.");
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH || password !== confirmPassword) {
    showToast(`Passwords must match and be at least ${MIN_PASSWORD_LENGTH} characters.`);
    return;
  }

  await runServerAuthAction("accept-invite", { name, email, inviteToken, password, confirmPassword }, {
    successMessage: "Invite accepted.",
    nextView: "first-accessible",
  });
}

async function signOut() {
  mobileNavOpen = false;

  if (backendReady && auth.serverManaged) {
    await runServerAuthAction("signout", {}, {
      successMessage: "Signed out.",
      clearState: true,
    });
    return;
  }

  auth.sessionUserId = "";
  saveAuth();
  authMode = auth.users.length ? "signin" : "signup";
  showToast("Signed out.");
  render();
}

async function handleProfileSubmit(form, isFirstLaunch) {
  const data = new FormData(form);
  const existing = state.profile || {};
  const logoFile = data.get("logo");
  const logo = logoFile && logoFile.size ? await fileToDataUrl(logoFile) : existing.logo || "";
  const businessName = clean(data.get("businessName"));

  state.profile = {
    ...existing,
    businessName,
    displayName: clean(data.get("displayName")) || businessName,
    businessType: clean(data.get("businessType")),
    tagline: clean(data.get("tagline")),
    logo,
    logoView: clean(data.get("logoView")) === "circle" ? "circle" : "square",
    phone: clean(data.get("phone")),
    email: clean(data.get("email")),
    address: clean(data.get("address")),
    currency: clean(data.get("currency")) || "NGN",
    measurementUnit: clean(data.get("measurementUnit")) || "inches",
    fabricUnit: clean(data.get("fabricUnit")) || "yards",
    theme: {
      primary: clean(data.get("primary")) || defaultTheme.primary,
      accent: clean(data.get("accent")) || defaultTheme.accent,
      sidebar: clean(data.get("sidebar")) || defaultTheme.sidebar,
      success: clean(data.get("success")) || defaultTheme.success,
      warning: clean(data.get("warning")) || defaultTheme.warning,
      background: clean(data.get("background")) || defaultTheme.background,
      surface: clean(data.get("surface")) || defaultTheme.surface,
      surfaceElevated: clean(data.get("surfaceElevated")) || defaultTheme.surfaceElevated,
      textPrimary: clean(data.get("textPrimary")) || defaultTheme.textPrimary,
      textMuted: clean(data.get("textMuted")) || defaultTheme.textMuted,
      border: clean(data.get("border")) || defaultTheme.border,
      sand: clean(data.get("sand")) || defaultTheme.sand,
      warmSurface: clean(data.get("warmSurface")) || defaultTheme.warmSurface,
      backgroundMode: clean(data.get("backgroundMode")) || "dark",
    },
  };

  currentView = isFirstLaunch ? "dashboard" : currentView;
  saveState();
  showToast(isFirstLaunch ? "Business profile created." : "Branding updated.");
  render();
}

function applyPremiumBrand() {
  const existing = state.profile || {};
  state.profile = normalizeProfile({
    ...existing,
    businessName: existing.businessName || "Atelier Studio",
    displayName: existing.displayName || existing.businessName || "Atelier Studio",
    businessType: existing.businessType || "Tailoring studio",
    brandPersonality: "Precise, premium, client-conscious, and production-aware",
    tagline: existing.tagline || "Measured. Made. Managed.",
    logo: existing.logo || "",
    logoView: existing.logoView || "square",
    phone: existing.phone || "",
    email: existing.email || "",
    address: existing.address || "",
    currency: existing.currency || "NGN",
    measurementUnit: existing.measurementUnit || "inches",
    fabricUnit: existing.fabricUnit || "yards",
    theme: { ...defaultTheme },
  });
  saveState();
  showToast("Premium atelier preset applied.");
  render();
}

function applyNeutralBrand() {
  const existing = state.profile || {};
  state.profile = normalizeProfile({
    ...existing,
    businessName: "Fashion Studio OS",
    displayName: "Fashion Studio OS",
    businessType: "Tailoring studio",
    tagline: "",
    logo: "",
    theme: { ...neutralTheme },
  });
  saveState();
  showToast("Neutral studio theme applied.");
  render();
}

async function handleStaffSubmit(form) {
  if (currentUser()?.role !== "manager") {
    showToast("Only a manager can create accounts.");
    return;
  }
  if (auth.users.length >= TEAM_LIMIT) {
    showToast("User limit reached. Remove an account before adding another.");
    return;
  }

  const data = new FormData(form);
  const role = data.get("role") === "manager" ? "manager" : "staff";
  const name = clean(data.get("name"));
  const email = clean(data.get("email")).toLowerCase();
  const password = String(data.get("password") || "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    showToast(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    return;
  }

  if (backendReady && auth.serverManaged) {
    await runServerAuthAction("create-staff", { name, email, password, role, access: selectedAccessFrom(form) }, {
      successMessage: `${role === "manager" ? "Manager" : "Staff"} account created.`,
    });
    return;
  }

  if (auth.users.some((user) => user.email === email)) {
    showToast("An account already exists for that email.");
    return;
  }

  auth.users.push({
    id: uid(role),
    name,
    email,
    password,
    role,
    access: role === "manager" ? fullAccess() : selectedAccessFrom(form),
    createdAt: isoDate(0),
  });
  saveAuth();
  showToast(`${role === "manager" ? "Manager" : "Staff"} account created.`);
  render();
}

async function handleStaffInviteSubmit(form) {
  if (currentUser()?.role !== "manager") {
    showToast("Only the manager can create staff invites.");
    return;
  }
  if (!backendReady || !auth.serverManaged) {
    showToast("Invites require being signed in online.");
    return;
  }
  if (auth.users.length >= TEAM_LIMIT) {
    showToast("User limit reached. Remove an account before adding another.");
    return;
  }

  const data = new FormData(form);
  const role = data.get("role") === "manager" ? "manager" : "staff";
  const result = await runServerAuthAction("create-staff-invite", {
    name: clean(data.get("name")),
    email: clean(data.get("email")).toLowerCase(),
    role,
    access: selectedAccessFrom(form),
  }, {
    successMessage: `${role === "manager" ? "Manager" : "Staff"} invite created.`,
  });
  if (result?.invite) {
    lastInviteResult = result.invite;
    render();
  }
}

async function handlePasswordSubmit(form) {
  if (!backendReady || !auth.serverManaged) {
    showToast("Password changes require server-managed auth.");
    return;
  }
  const data = new FormData(form);
  const password = String(data.get("password") || "");
  const confirmPassword = String(data.get("confirmPassword") || "");
  if (password.length < MIN_PASSWORD_LENGTH || password !== confirmPassword) {
    showToast(`Passwords must match and be at least ${MIN_PASSWORD_LENGTH} characters.`);
    return;
  }
  await runServerAuthAction("change-password", {
    currentPassword: String(data.get("currentPassword") || ""),
    password,
    confirmPassword,
  }, {
    successMessage: "Password changed.",
  });
}

async function handleStaffAccessSubmit(form) {
  if (currentUser()?.role !== "manager") {
    showToast("Only the manager can update staff access.");
    return;
  }

  if (backendReady && auth.serverManaged) {
    await runServerAuthAction("update-staff-access", { id: form.dataset.staffAccess, access: selectedAccessFrom(form) }, {
      successMessage: "Staff access updated.",
    });
    return;
  }

  const staff = auth.users.find((user) => user.id === form.dataset.staffAccess && user.role === "staff");
  if (!staff) return;
  staff.access = selectedAccessFrom(form);
  saveAuth();
  showToast("Staff access updated.");
  render();
}

async function updateStaffStatus(id, action) {
  if (currentUser()?.role !== "manager") {
    showToast("Only the manager can update staff status.");
    return;
  }

  if (backendReady && auth.serverManaged) {
    await runServerAuthAction(action, { id }, {
      successMessage: action === "suspend-staff" ? "Staff account suspended." : "Staff account reactivated.",
    });
    return;
  }

  const staff = auth.users.find((user) => user.id === id && user.role === "staff");
  if (!staff) return;
  staff.status = action === "suspend-staff" ? "suspended" : "active";
  staff.updatedAt = isoDate(0);
  saveAuth();
  showToast(action === "suspend-staff" ? "Staff account suspended." : "Staff account reactivated.");
  render();
}

async function createRecoveryCode() {
  if (!backendReady || !auth.serverManaged) {
    showToast("Recovery codes require server-managed auth.");
    return;
  }
  const result = await runServerAuthAction("create-recovery-code", {}, {
    successMessage: "Recovery code generated.",
  });
  if (result?.recovery?.recoveryCode) {
    lastRecoveryResult = {
      email: result.recovery.email,
      recoveryCode: result.recovery.recoveryCode,
      context: "self",
    };
    render();
  }
}

async function issueRecoveryCodeForUser(id) {
  if (currentUser()?.role !== "manager") {
    showToast("Only a manager can issue a recovery code for another account.");
    return;
  }
  if (!backendReady || !auth.serverManaged) {
    showToast("Recovery codes require server-managed auth.");
    return;
  }
  // The manager hands the code over; the colleague chooses their own password,
  // so the manager never learns it.
  const result = await runServerAuthAction("reset-user-password", { id }, {
    successMessage: "Recovery code issued. Share it once with that person.",
  });
  if (result?.recovery?.recoveryCode) {
    lastRecoveryResult = {
      email: result.recovery.email,
      recoveryCode: result.recovery.recoveryCode,
      context: "team",
    };
    render();
  }
}

function dismissRecoveryCode() {
  lastRecoveryResult = null;
  render();
}

function deleteStaff(id) {
  if (currentUser()?.role !== "manager") {
    showToast("Only the manager can remove staff accounts.");
    return;
  }
  const staff = auth.users.find((user) => user.id === id && user.role === "staff");
  if (!staff) return;
  modalState = { type: "delete-staff", id };
  render();
}

async function confirmDeleteStaff(id) {
  if (currentUser()?.role !== "manager") {
    showToast("Only the manager can remove staff accounts.");
    return;
  }

  if (backendReady && auth.serverManaged) {
    closeModal(false);
    await runServerAuthAction("delete-staff", { id }, {
      successMessage: "Staff account removed.",
    });
    return;
  }

  const staff = auth.users.find((user) => user.id === id && user.role === "staff");
  if (!staff) return;
  auth.users = auth.users.filter((user) => user.id !== id);
  closeModal(false);
  saveAuth();
  showToast("Staff account removed.");
  render();
}

function handleInquirySubmit(form) {
  const data = new FormData(form);
  state.inquiries.unshift({
    id: uid("inq"),
    clientName: clean(data.get("clientName")),
    channel: clean(data.get("channel")),
    contact: clean(data.get("contact")),
    desiredStyle: clean(data.get("desiredStyle")),
    occasion: clean(data.get("occasion")),
    deadline: clean(data.get("deadline")),
    budget: numberValue(data.get("budget")),
    notes: clean(data.get("notes")),
    status: "New",
    createdAt: isoDate(0),
  });
  saveState();
  showToast("Inquiry saved.");
  render();
}

function handleChannelMessageSubmit(form) {
  const data = new FormData(form);
  const message = normalizeChannelMessage({
    id: uid("msg"),
    channel: data.get("channel"),
    senderName: data.get("senderName"),
    contact: data.get("contact"),
    message: data.get("message"),
    desiredStyle: data.get("desiredStyle"),
    occasion: data.get("occasion"),
    deadline: data.get("deadline"),
    budget: data.get("budget"),
    followUpStatus: data.get("followUpStatus"),
    consentStatus: data.get("consentStatus"),
    routingStatus: "New",
    notes: data.get("notes"),
    receivedAt: isoDate(0),
  });

  if (!message.senderName || !message.message) {
    showToast("Add a sender name and raw message before saving.");
    return;
  }

  state.channelMessages.unshift(message);
  saveState();
  showToast("Channel message saved.");
  render();
}

function handleClientSubmit(form) {
  const data = new FormData(form);
  const client = {
    id: uid("client"),
    name: clean(data.get("name")),
    phone: clean(data.get("phone")),
    email: clean(data.get("email")),
    address: clean(data.get("address")),
    measurements: {},
    stylePreferences: clean(data.get("stylePreferences")),
    fittingNotes: clean(data.get("fittingNotes")),
    importantDates: clean(data.get("importantDates")),
  };
  state.clients.unshift(client);
  selectedClientId = client.id;
  saveState();
  showToast("Client profile saved.");
  render();
}

function handleMeasurementSubmit(form) {
  const client = state.clients.find((item) => item.id === selectedClientId);
  if (!client) return;

  const data = new FormData(form);
  const label = clean(data.get("label"));
  const value = clean(data.get("value"));
  if (!label || !value) return;

  client.measurements = client.measurements || {};
  client.measurements[label] = value;
  saveState();
  showToast("Measurement saved.");
  render();
}

function handleInventorySubmit(form) {
  const data = new FormData(form);
  const category = clean(data.get("category"));
  state.inventory.unshift({
    id: uid("mat"),
    name: clean(data.get("name")),
    type: category === "Fabric" ? "Fabric" : "Non-fabric",
    category,
    fabricType: clean(data.get("fabricType")),
    colorPattern: clean(data.get("colorPattern")),
    width: numberValue(data.get("width")),
    unit: clean(data.get("unit")),
    quantity: numberValue(data.get("quantity")),
    reserved: 0,
    minimumStock: numberValue(data.get("minimumStock")),
    supplier: clean(data.get("supplier")),
    costPerUnit: numberValue(data.get("costPerUnit")),
    notes: clean(data.get("notes")),
  });
  saveState();
  showToast("Material added to inventory.");
  render();
}

function handleRecipeSubmit(form) {
  const data = new FormData(form);
  const modifierName = clean(data.get("modifierName"));
  const modifier = modifierName
    ? [{
        id: slugify(modifierName),
        name: modifierName,
        fabricDelta: numberValue(data.get("modifierFabricDelta")),
        costDelta: 0,
        timeDelta: 0,
        materialRequirements: [],
      }]
    : [];

  state.styles.unshift({
    id: uid("style"),
    name: clean(data.get("name")),
    category: clean(data.get("category")),
    basePrice: numberValue(data.get("basePrice")),
    productionDays: numberValue(data.get("productionDays")) || 7,
    requiredMeasurements: splitCsv(data.get("requiredMeasurements")),
    baseFabric: numberValue(data.get("baseFabric")),
    fabricUnit: state.profile.fabricUnit || "yards",
    fabricWidth: numberValue(data.get("fabricWidth")) || 45,
    supportedWidths: [45, 54, 60],
    wastagePercent: numberValue(data.get("wastagePercent")),
    fixedItems: defaultFixedItems(),
    modifiers: modifier,
    notes: clean(data.get("notes")),
  });
  draftOrderStyleId = state.styles[0].id;
  saveState();
  showToast("Style recipe saved.");
  render();
}

function handleOrderSubmit(form) {
  const data = new FormData(form);
  const style = getStyle(clean(data.get("styleId")));
  const modifiers = data.getAll("modifiers").map(clean);
  const quote = numberValue(data.get("quote")) || adjustedPrice(style, modifiers);
  const deposit = numberValue(data.get("deposit"));
  const fittingDate = clean(data.get("fittingDate"));

  const order = {
    id: uid("ord"),
    clientId: clean(data.get("clientId")),
    styleId: clean(data.get("styleId")),
    fabricId: clean(data.get("fabricId")),
    modifiers,
    status: "Quoted",
    productionStep: "Consultation",
    deadline: clean(data.get("deadline")),
    fittingDate,
    quote,
    deposit,
    assignedTo: clean(data.get("assignedTo")),
    notes: clean(data.get("notes")),
    estimatedMaterials: [],
    reservedMaterials: [],
    actualMaterials: [],
    stockWarnings: [],
    paymentRecords: deposit > 0
      ? [{
          id: uid("pay"),
          amount: deposit,
          method: "Cash",
          receivedAt: isoDate(0),
          note: "Initial deposit",
          recordedBy: currentUserLabel(),
        }]
      : [],
    fittingEvents: fittingDate
      ? [{
          id: uid("fit"),
          type: "First fitting",
          date: fittingDate,
          status: "Scheduled",
          assignedTo: clean(data.get("assignedTo")),
          notes: "Initial order fitting.",
          createdAt: isoDate(0),
        }]
      : [],
    followUpStatus: deposit > 0 ? "No follow-up" : "Deposit reminder",
    followUpNote: "",
    followUpAt: "",
    managerReview: normalizeManagerReview(),
    handoff: null,
    activity: [{
      id: uid("act"),
      label: "Order draft created",
      detail: deposit > 0 ? `Deposit recorded: ${money(deposit)}` : "Awaiting deposit or confirmation.",
      actor: currentUserLabel(),
      createdAt: isoDate(0),
    }],
    createdAt: isoDate(0),
  };

  order.estimatedMaterials = estimateOrder(order).lineItems;
  state.orders.unshift(order);
  saveState();
  showToast("Order draft created.");
  render();
}

function convertInquiry(id) {
  const inquiry = state.inquiries.find((item) => item.id === id);
  if (!inquiry) return;

  let client = state.clients.find((item) => item.name.toLowerCase() === inquiry.clientName.toLowerCase() || item.phone === inquiry.contact || item.email === inquiry.contact);
  if (!client) {
    client = {
      id: uid("client"),
      name: inquiry.clientName,
      phone: inquiry.contact && inquiry.contact.startsWith("+") ? inquiry.contact : "",
      email: inquiry.contact && inquiry.contact.includes("@") ? inquiry.contact : "",
      address: "",
      measurements: {},
      stylePreferences: inquiry.desiredStyle,
      fittingNotes: inquiry.notes,
      importantDates: inquiry.occasion,
    };
    state.clients.unshift(client);
  }

  const style = findBestStyle(inquiry.desiredStyle) || state.styles[0];
  const fabric = state.inventory.find((item) => item.category === "Fabric");
  const order = {
    id: uid("ord"),
    clientId: client.id,
    styleId: style?.id || "",
    fabricId: fabric?.id || "",
    modifiers: [],
    status: "Quoted",
    productionStep: "Consultation",
    deadline: inquiry.deadline || isoDate(14),
    fittingDate: "",
    quote: inquiry.budget || (style ? style.basePrice : 0),
    deposit: 0,
    assignedTo: "",
    notes: inquiry.notes,
    estimatedMaterials: [],
    reservedMaterials: [],
    actualMaterials: [],
    stockWarnings: [],
    paymentRecords: [],
    fittingEvents: [],
    followUpStatus: "Deposit reminder",
    followUpNote: "",
    followUpAt: "",
    managerReview: normalizeManagerReview(),
    handoff: null,
    activity: [{
      id: uid("act"),
      label: "Converted from inquiry",
      detail: inquiry.desiredStyle || "CRM inquiry converted to order.",
      actor: currentUserLabel(),
      createdAt: isoDate(0),
    }],
    createdAt: isoDate(0),
  };
  order.estimatedMaterials = estimateOrder(order).lineItems;
  state.orders.unshift(order);
  inquiry.status = "Converted to Order";
  currentView = "orders";
  saveState();
  showToast("Inquiry converted to an order draft.");
  render();
}

function routeChannelMessage(id) {
  const message = state.channelMessages.find((item) => item.id === id);
  if (!message) return;

  const inquiry = {
    id: uid("inq"),
    clientName: message.senderName || message.contact || "Channel lead",
    channel: message.channel,
    contact: message.contact,
    desiredStyle: message.desiredStyle || "Custom garment",
    occasion: message.occasion,
    deadline: message.deadline,
    budget: message.budget,
    notes: channelMessageInquiryNotes(message),
    status: "New",
    sourceMessageId: message.id,
    consentStatus: message.consentStatus,
    providerMessageId: message.providerMessageId,
    followUpStatus: message.followUpStatus,
    createdAt: isoDate(0),
  };

  state.inquiries.unshift(inquiry);
  message.routingStatus = "Routed to Inquiry";
  message.inquiryId = inquiry.id;
  if (message.followUpStatus === "Needs reply") {
    message.followUpStatus = "Follow-up scheduled";
  }

  saveState();
  showToast("Channel message routed into the inquiry pipeline.");
  render();
}

function updateChannelRouting(id, routingStatus) {
  const message = state.channelMessages.find((item) => item.id === id);
  if (!message) return;
  message.routingStatus = normalizeChoice(routingStatus, channelRoutingStatuses, "New");
  if (message.routingStatus === "Archived" && message.followUpStatus !== "Closed") {
    message.followUpStatus = "Closed";
  }
  if (message.routingStatus === "New" && message.followUpStatus === "Closed") {
    message.followUpStatus = "Needs reply";
  }
  saveState();
  showToast(message.routingStatus === "Archived" ? "Channel message archived." : "Channel message reopened.");
  render();
}

function channelMessageInquiryNotes(message) {
  return [
    message.message ? `Channel message: ${message.message}` : "",
    message.notes ? `Internal notes: ${message.notes}` : "",
    message.followUpStatus ? `Follow-up: ${message.followUpStatus}` : "",
    message.consentStatus ? `Consent: ${message.consentStatus}` : "",
    message.providerMessageId ? `Provider message id: ${message.providerMessageId}` : "",
  ].filter(Boolean).join("\n");
}

function openMeasurements(id) {
  selectedClientId = id;
  currentView = "measurements";
  localStorage.setItem(VIEW_KEY, currentView);
  render();
}

function deleteMeasurement(label) {
  const client = state.clients.find((item) => item.id === selectedClientId);
  if (!client || !client.measurements) return;
  delete client.measurements[label];
  saveState();
  showToast("Measurement removed.");
  render();
}

function reserveOrder(id) {
  const order = getOrder(id);
  if (!order) return;
  if (order.reservedMaterials?.length) {
    showToast("This order already has reserved materials.");
    return;
  }

  const estimate = estimateOrder(order);
  const shortages = estimate.lineItems.filter((line) => {
    if (line.missing) return true;
    const item = getInventoryItem(line.itemId);
    return !item || availableQty(item) < line.quantity;
  });

  if (shortages.length) {
    order.stockWarnings = shortages.map((line) => line.missing
      ? `${line.role}: missing ${line.category || "inventory item"}`
      : `${line.name}: needs ${line.quantity} ${line.unit}, available ${availableQty(getInventoryItem(line.itemId))}`);
    saveState();
    showToast("Stock warning: some materials cannot be fully reserved.");
    render();
    return;
  }

  estimate.lineItems.forEach((line) => {
    const item = getInventoryItem(line.itemId);
    item.reserved = round2(Number(item.reserved || 0) + Number(line.quantity || 0));
  });

  order.estimatedMaterials = estimate.lineItems;
  order.reservedMaterials = clone(estimate.lineItems);
  order.status = "Materials Reserved";
  order.productionStep = "Materials Reserved";
  order.stockWarnings = [];
  order.followUpStatus = orderPaidTotal(order) > 0 ? "No follow-up" : "Deposit reminder";
  recordOrderActivity(order, "Materials reserved", `${estimate.lineItems.length} material lines reserved.`);
  saveState();
  showToast("Estimated materials reserved.");
  render();
}

function cutOrder(id) {
  const order = getOrder(id);
  if (!order || !order.reservedMaterials?.length) {
    showToast("Reserve materials before cutting.");
    return;
  }

  const mainFabric = order.reservedMaterials.find((line) => line.role === "Main fabric");
  if (!mainFabric) {
    showToast("No main fabric reservation found.");
    return;
  }

  const input = app.querySelector(`[data-cut-input="${id}"]`);
  const actual = round2(Number(input?.value || mainFabric.quantity || 0));
  if (!actual || actual <= 0) {
    showToast("Enter the actual fabric used.");
    return;
  }

  const item = getInventoryItem(mainFabric.itemId);
  const extraNeeded = Math.max(0, actual - mainFabric.quantity);
  if (extraNeeded > availableQty(item)) {
    showToast(`Not enough unreserved fabric for the extra ${extraNeeded} ${mainFabric.unit}.`);
    return;
  }

  item.quantity = round2(Number(item.quantity || 0) - actual);
  item.reserved = Math.max(0, round2(Number(item.reserved || 0) - mainFabric.quantity));
  mainFabric.consumed = true;

  order.actualMaterials = order.actualMaterials || [];
  order.actualMaterials.push({
    itemId: mainFabric.itemId,
    name: mainFabric.name,
    role: "Main fabric",
    estimated: mainFabric.quantity,
    actual,
    unit: mainFabric.unit,
    difference: round2(actual - mainFabric.quantity),
  });
  order.status = "Cutting";
  order.productionStep = "Cutting";
  order.stockWarnings = actual > mainFabric.quantity
    ? [`Actual fabric exceeded estimate by ${round2(actual - mainFabric.quantity)} ${mainFabric.unit}.`]
    : [];
  recordOrderActivity(order, "Cutting recorded", `${actual} ${mainFabric.unit} actual main fabric used.`);

  saveState();
  showToast(actual > mainFabric.quantity ? "Cutting recorded with extra usage warning." : "Cutting recorded and unused reserve released.");
  render();
}

function advanceOrder(id) {
  const order = getOrder(id);
  if (!order) return;

  const currentIndex = productionSteps.indexOf(order.productionStep);
  if (currentIndex < 0) {
    order.productionStep = "Consultation";
  } else if (order.productionStep === "Materials Reserved") {
    showToast("Use Start cutting in Orders so actual fabric usage is recorded.");
    return;
  } else if (currentIndex < productionSteps.length - 1) {
    order.productionStep = productionSteps[currentIndex + 1];
  }

  order.status = productionStepToStatus(order.productionStep);
  recordOrderActivity(order, "Production advanced", order.productionStep);
  saveState();
  render();
}

function completeOrder(id) {
  const order = getOrder(id);
  if (!order) return;

  finalizeOrderCompletion(order);
  recordOrderActivity(order, "Order completed", "Marked complete without handoff details.");
  saveState();
  showToast("Order completed and learning record saved.");
  render();
}

function finalizeOrderCompletion(order) {
  const alreadyCompleted = order.status === "Completed";
  consumeRemainingReserved(order);
  const mainEstimate = (order.estimatedMaterials || order.reservedMaterials || []).find((line) => line.role === "Main fabric");
  const mainActual = (order.actualMaterials || []).find((line) => line.role === "Main fabric");
  const estimated = mainEstimate?.quantity || mainActual?.estimated || 0;
  const actual = mainActual?.actual || estimated;

  if (!alreadyCompleted && mainEstimate && !state.usageRecords.some((record) => record.orderId === order.id)) {
    state.usageRecords.unshift({
      id: uid("learn"),
      orderId: order.id,
      styleName: getStyle(order.styleId)?.name || "Custom style",
      estimated,
      actual,
      unit: mainEstimate.unit || state.profile.fabricUnit || "yards",
      difference: round2(actual - estimated),
      notes: order.notes || "",
      completedAt: isoDate(0),
    });
  }

  order.status = "Completed";
  order.productionStep = "Delivered/Collected";
  order.completedAt = order.completedAt || isoDate(0);
  if (order.followUpStatus !== "Closed") {
    order.followUpStatus = "Collection reminder";
  }
}

function cancelOrder(id) {
  const order = getOrder(id);
  if (!order) return;
  releaseReservation(order);
  order.status = "Cancelled";
  order.productionStep = "Consultation";
  order.followUpStatus = "Closed";
  recordOrderActivity(order, "Order cancelled", "Reservations released.");
  saveState();
  showToast("Order cancelled and reservations released.");
  render();
}

function recordPayment(id) {
  const order = getOrder(id);
  if (!order) return;
  modalState = { type: "payment", id };
  render();
}

function handlePaymentSubmit(form) {
  const order = getOrder(form.dataset.id);
  if (!order) return;
  const data = new FormData(form);
  const amount = numberValue(data.get("amount"));
  if (!amount || amount <= 0) {
    showToast("Enter a payment amount.");
    return;
  }

  order.paymentRecords = normalizePaymentRecords(order.paymentRecords);
  order.paymentRecords.push({
    id: uid("pay"),
    amount,
    method: normalizeChoice(data.get("method"), paymentMethods, "Cash"),
    receivedAt: clean(data.get("receivedAt")) || isoDate(0),
    note: clean(data.get("note")),
    recordedBy: currentUserLabel(),
  });
  order.deposit = round2(orderPaidTotal(order));
  if (orderBalanceDue(order) <= 0 && !["Completed", "Cancelled"].includes(order.status)) {
    order.followUpStatus = "Collection reminder";
  }
  recordOrderActivity(order, "Payment recorded", `${money(amount)} via ${normalizeChoice(data.get("method"), paymentMethods, "Cash")}.`);
  closeModal(false);
  saveState();
  showToast("Payment recorded.");
  render();
}

function scheduleFitting(id) {
  const order = getOrder(id);
  if (!order) return;
  modalState = { type: "fitting", id };
  render();
}

function handleFittingSubmit(form) {
  const order = getOrder(form.dataset.id);
  if (!order) return;
  const data = new FormData(form);
  const date = clean(data.get("date"));
  if (!date) {
    showToast("Choose a fitting date.");
    return;
  }

  order.fittingEvents = normalizeFittingEvents(order.fittingEvents);
  order.fittingEvents.push({
    id: uid("fit"),
    type: normalizeChoice(data.get("type"), fittingTypes, "First fitting"),
    date,
    status: "Scheduled",
    assignedTo: clean(data.get("assignedTo")),
    notes: clean(data.get("notes")),
    createdAt: isoDate(0),
  });
  order.fittingDate = date;
  order.followUpStatus = "Fitting reminder";
  order.followUpAt = date;
  recordOrderActivity(order, "Fitting scheduled", `${formatDate(date)} ${clean(data.get("assignedTo")) ? `with ${clean(data.get("assignedTo"))}` : ""}`.trim());
  closeModal(false);
  saveState();
  showToast("Fitting scheduled.");
  render();
}

function completeLatestFitting(id) {
  const order = getOrder(id);
  if (!order) return;
  const fittings = normalizeFittingEvents(order.fittingEvents);
  const fitting = [...fittings].reverse().find((event) => event.status === "Scheduled" || event.status === "Rescheduled");
  if (!fitting) {
    showToast("No scheduled fitting to complete.");
    return;
  }

  fitting.status = "Completed";
  fitting.completedAt = isoDate(0);
  order.fittingEvents = fittings;
  if (!["Completed", "Cancelled"].includes(order.status)) {
    order.productionStep = order.productionStep === "First Fitting" ? "Adjustments" : order.productionStep;
    order.status = productionStepToStatus(order.productionStep);
  }
  order.followUpStatus = "No follow-up";
  recordOrderActivity(order, "Fitting completed", `${fitting.type} on ${formatDate(fitting.date)}.`);
  saveState();
  showToast("Fitting marked complete.");
  render();
}

function requestManagerReview(id) {
  const order = getOrder(id);
  if (!order) return;
  modalState = { type: "review", id };
  render();
}

function handleManagerReviewSubmit(form) {
  const order = getOrder(form.dataset.id);
  if (!order) return;
  const data = new FormData(form);
  order.managerReview = {
    status: "Review requested",
    requestedAt: isoDate(0),
    requestedBy: currentUserLabel(),
    decisionAt: "",
    decisionBy: "",
    note: clean(data.get("note")),
  };
  if (!["Completed", "Cancelled"].includes(order.status)) {
    order.productionStep = "Quality Check";
    order.status = "Quality Check";
  }
  recordOrderActivity(order, "Manager review requested", order.managerReview.note || "Quality review requested.");
  closeModal(false);
  saveState();
  showToast("Manager review requested.");
  render();
}

function approveManagerReview(id) {
  const order = getOrder(id);
  if (!order) return;
  order.managerReview = {
    ...normalizeManagerReview(order.managerReview),
    status: "Approved",
    decisionAt: isoDate(0),
    decisionBy: currentUserLabel(),
  };
  if (!["Completed", "Cancelled"].includes(order.status)) {
    order.productionStep = "Ready";
    order.status = "Ready for Collection";
    order.followUpStatus = "Collection reminder";
  }
  recordOrderActivity(order, "Manager review approved", "Order moved to ready state.");
  saveState();
  showToast("Manager review approved.");
  render();
}

function requestReviewChanges(id) {
  const order = getOrder(id);
  if (!order) return;
  order.managerReview = {
    ...normalizeManagerReview(order.managerReview),
    status: "Changes requested",
    decisionAt: isoDate(0),
    decisionBy: currentUserLabel(),
  };
  if (!["Completed", "Cancelled"].includes(order.status)) {
    order.productionStep = "Adjustments";
    order.status = "Adjustments";
    order.followUpStatus = "Fitting reminder";
  }
  recordOrderActivity(order, "Review changes requested", order.managerReview.note || "Adjustments requested before approval.");
  saveState();
  showToast("Changes requested.");
  render();
}

function updateFollowUp(id) {
  const order = getOrder(id);
  if (!order) return;
  modalState = { type: "follow-up", id };
  render();
}

function handleFollowUpSubmit(form) {
  const order = getOrder(form.dataset.id);
  if (!order) return;
  const data = new FormData(form);
  order.followUpStatus = normalizeChoice(data.get("followUpStatus"), orderFollowUpStatuses, "No follow-up");
  order.followUpAt = clean(data.get("followUpAt"));
  order.followUpNote = clean(data.get("followUpNote"));
  recordOrderActivity(order, "Follow-up updated", `${order.followUpStatus}${order.followUpAt ? ` for ${formatDate(order.followUpAt)}` : ""}.`);
  closeModal(false);
  saveState();
  showToast("Follow-up updated.");
  render();
}

function handoffOrder(id) {
  const order = getOrder(id);
  if (!order) return;
  modalState = { type: "handoff", id };
  render();
}

function handleHandoffSubmit(form) {
  const order = getOrder(form.dataset.id);
  if (!order) return;
  const data = new FormData(form);
  const balance = orderBalanceDue(order);
  const acknowledged = data.get("balanceAcknowledged") === "on" || balance <= 0;
  if (balance > 0 && !acknowledged) {
    showToast("Acknowledge the open balance before closing handoff.");
    return;
  }

  finalizeOrderCompletion(order);
  order.handoff = {
    method: normalizeChoice(data.get("method"), handoffMethods, "Collection"),
    recipient: clean(data.get("recipient")),
    completedAt: clean(data.get("completedAt")) || isoDate(0),
    note: clean(data.get("note")),
    balanceAcknowledged: acknowledged,
  };
  order.followUpStatus = "Closed";
  recordOrderActivity(order, "Order handed off", `${order.handoff.method} to ${order.handoff.recipient || "client"}.`);
  closeModal(false);
  saveState();
  showToast("Order handoff completed.");
  render();
}

function restockItem(id) {
  const item = getInventoryItem(id);
  if (!item) return;
  modalState = { type: "restock", id };
  render();
}

function handleRestockSubmit(form) {
  const item = getInventoryItem(form.dataset.id);
  if (!item) return;
  const amount = Number(new FormData(form).get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return;
  recordInventoryAdjustment(item, amount, "Restock", "Restock entry");
  closeModal(false);
  saveState();
  showToast("Inventory updated.");
  render();
}

function adjustInventoryItem(id) {
  const item = getInventoryItem(id);
  if (!item) return;
  modalState = { type: "inventory-adjust", id };
  render();
}

function handleInventoryAdjustmentSubmit(form) {
  const item = getInventoryItem(form.dataset.id);
  if (!item) return;
  const data = new FormData(form);
  const change = numberValue(data.get("change"));
  if (!change) {
    showToast("Enter an inventory adjustment.");
    return;
  }
  const after = round2(Number(item.quantity || 0) + change);
  if (after < Number(item.reserved || 0)) {
    showToast("Stock cannot be adjusted below reserved quantity.");
    return;
  }

  recordInventoryAdjustment(item, change, normalizeChoice(data.get("reason"), inventoryAdjustmentReasons, "Other"), clean(data.get("note")));
  closeModal(false);
  saveState();
  showToast("Inventory adjustment saved.");
  render();
}

function recordInventoryAdjustment(item, change, reason, note = "") {
  const before = round2(Number(item.quantity || 0));
  const after = round2(before + Number(change || 0));
  item.quantity = after;
  state.inventoryAdjustments = normalizeInventoryAdjustments(state.inventoryAdjustments);
  state.inventoryAdjustments.unshift({
    id: uid("adj"),
    itemId: item.id,
    itemName: item.name,
    change: round2(change),
    quantityBefore: before,
    quantityAfter: after,
    unit: item.unit,
    reason: normalizeChoice(reason, inventoryAdjustmentReasons, "Other"),
    note,
    actor: currentUserLabel(),
    createdAt: new Date().toISOString(),
  });
  state.inventoryAdjustments = state.inventoryAdjustments.slice(0, 200);
}

function resetLocalData() {
  modalState = { type: "reset-data" };
  render();
}

async function confirmResetLocalData() {
  closeModal(false);
  if (backendReady) {
    try {
      const response = await fetch(API_DATA_PATH, { method: "DELETE", headers: apiHeaders(), credentials: "same-origin" });
      if (!response.ok) {
        throw new Error(`Reset failed with ${response.status}`);
      }
    } catch (error) {
      console.warn("Could not reset backend data. Clearing browser storage only.", error);
      backendReady = false;
      storageMode = "local";
      storageMessage = "Saved on this device";
    }
  }
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(VIEW_KEY);
  localStorage.removeItem(AUTH_KEY);
  state = createSeedState();
  auth = normalizeAuth();
  authMode = "signup";
  mobileNavOpen = false;
  currentView = "dashboard";
  selectedClientId = state.clients[0]?.id || "";
  draftOrderStyleId = state.styles[0]?.id || "";
  showToast("Workspace data reset.");
  render();
}

function estimateOrder(order) {
  const style = getStyle(order.styleId);
  const fabric = getInventoryItem(order.fabricId);
  const client = getClient(order.clientId);
  if (!style) return { lineItems: [] };

  const width = Number(fabric?.width || style.fabricWidth || 45);
  const basisWidth = Number(style.fabricWidth || 45);
  const widthFactor = width > 0 ? basisWidth / width : 1;
  const modifierObjects = (order.modifiers || []).map((id) => style.modifiers.find((modifier) => modifier.id === id)).filter(Boolean);
  const modifierFabric = modifierObjects.reduce((sum, modifier) => sum + Number(modifier.fabricDelta || 0), 0);
  const sizeAdjustment = calculateSizeAdjustment(client?.measurements || {});
  const fabricQty = round2((Number(style.baseFabric || 0) * widthFactor + modifierFabric + sizeAdjustment) * (1 + Number(style.wastagePercent || 0) / 100));
  const lineItems = [];

  if (fabric) {
    lineItems.push({
      itemId: fabric.id,
      name: fabric.name,
      role: "Main fabric",
      category: "Fabric",
      quantity: fabricQty,
      unit: fabric.unit || style.fabricUnit || state.profile.fabricUnit || "yards",
    });
  } else {
    lineItems.push({
      itemId: "",
      name: "Main fabric",
      role: "Main fabric",
      category: "Fabric",
      quantity: fabricQty,
      unit: style.fabricUnit || state.profile.fabricUnit || "yards",
      missing: true,
    });
  }

  (style.fixedItems || []).forEach((fixed) => {
    const item = getInventoryItem(fixed.itemId);
    lineItems.push({
      itemId: fixed.itemId,
      name: item?.name || fixed.role,
      role: fixed.role,
      category: item?.category || "",
      quantity: Number(fixed.quantity || 0),
      unit: fixed.unit || item?.unit || "piece",
      missing: !item,
    });
  });

  modifierObjects.forEach((modifier) => {
    (modifier.materialRequirements || []).forEach((requirement) => {
      const item = state.inventory.find((material) => material.category === requirement.category);
      lineItems.push({
        itemId: item?.id || "",
        name: item?.name || requirement.category,
        role: requirement.role || requirement.category,
        category: requirement.category,
        quantity: Number(requirement.quantity || 0),
        unit: requirement.unit || item?.unit || "unit",
        missing: !item,
      });
    });
  });

  return { lineItems: mergeLineItems(lineItems), fabricQty, sizeAdjustment, modifierFabric };
}

function mergeLineItems(lineItems) {
  const merged = new Map();
  lineItems.forEach((line) => {
    const key = `${line.itemId || line.name}-${line.role}-${line.unit}`;
    if (!merged.has(key)) {
      merged.set(key, { ...line, quantity: round2(line.quantity) });
      return;
    }
    const existing = merged.get(key);
    existing.quantity = round2(Number(existing.quantity || 0) + Number(line.quantity || 0));
  });
  return [...merged.values()];
}

function consumeRemainingReserved(order) {
  (order.reservedMaterials || []).forEach((line) => {
    if (line.consumed) return;
    const item = getInventoryItem(line.itemId);
    if (!item) return;
    item.quantity = Math.max(0, round2(Number(item.quantity || 0) - Number(line.quantity || 0)));
    item.reserved = Math.max(0, round2(Number(item.reserved || 0) - Number(line.quantity || 0)));
    line.consumed = true;
  });
}

function releaseReservation(order) {
  (order.reservedMaterials || []).forEach((line) => {
    if (line.consumed) return;
    const item = getInventoryItem(line.itemId);
    if (!item) return;
    item.reserved = Math.max(0, round2(Number(item.reserved || 0) - Number(line.quantity || 0)));
  });
  order.reservedMaterials = [];
}

function renderCompactOrder(order) {
  const client = getClient(order.clientId);
  const style = getStyle(order.styleId);
  return `
    <article class="record">
      <div class="record-header">
        <div>
          <strong>${escapeHtml(client?.name || "Unknown client")}</strong>
          <p class="muted small-text">${escapeHtml(style?.name || "Custom style")} - due ${formatDate(order.deadline)}</p>
        </div>
        <span class="status ${statusTone(order.status)}">${escapeHtml(order.status)}</span>
      </div>
    </article>
  `;
}

function renderClientCard(client) {
  const orderCount = state.orders.filter((order) => order.clientId === client.id).length;
  const measurementCount = Object.keys(client.measurements || {}).length;
  return `
    <article class="client-card">
      <div class="card-header">
        <div>
          <h3>${escapeHtml(client.name)}</h3>
          <p class="muted small-text">${escapeHtml(client.phone || client.email || "No contact saved")}</p>
        </div>
        <span class="pill">${orderCount} orders</span>
      </div>
      <div class="tag-list">
        <span class="pill">${measurementCount} measurements</span>
        ${client.importantDates ? `<span class="pill">${escapeHtml(client.importantDates)}</span>` : ""}
      </div>
      ${client.stylePreferences ? `<p class="muted small-text" style="margin-top: 10px;">${escapeHtml(client.stylePreferences)}</p>` : ""}
      <div class="button-row" style="margin-top: 12px;">
        <button class="btn small secondary" type="button" data-action="open-measurements" data-id="${escapeHtml(client.id)}">Measurements</button>
      </div>
    </article>
  `;
}

function renderOrderCard(order) {
  const client = getClient(order.clientId);
  const style = getStyle(order.styleId);
  const fabric = getInventoryItem(order.fabricId);
  const estimate = order.estimatedMaterials?.length ? order.estimatedMaterials : estimateOrder(order).lineItems;
  const isReserved = order.reservedMaterials?.length;
  const isTerminal = ["Completed", "Cancelled"].includes(order.status);
  const paid = orderPaidTotal(order);
  const balance = orderBalanceDue(order);
  const latestFitting = latestOrderFitting(order);
  const pendingFitting = latestPendingFitting(order);
  const review = normalizeManagerReview(order.managerReview);
  const handoff = normalizeHandoff(order.handoff);

  return `
    <article class="order-card">
      <div class="card-header">
        <div>
          <h3>${escapeHtml(client?.name || "Unknown client")} - ${escapeHtml(style?.name || "Custom style")}</h3>
          <p class="muted small-text">${escapeHtml(fabric?.name || "No fabric selected")} - due ${formatDate(order.deadline)} - ${money(order.quote)}</p>
        </div>
        <span class="status ${statusTone(order.status)}">${escapeHtml(order.status)}</span>
      </div>
      <div class="tag-list">
        <span class="pill">Step: ${escapeHtml(order.productionStep)}</span>
        ${order.fittingDate ? `<span class="pill">Fitting ${formatDate(order.fittingDate)}</span>` : ""}
        ${order.assignedTo ? `<span class="pill">${escapeHtml(order.assignedTo)}</span>` : ""}
        <span class="pill">Paid: ${money(paid)}</span>
        <span class="pill ${balance > 0 ? "warning-text" : ""}">Balance: ${money(balance)}</span>
        <span class="pill">Review: ${escapeHtml(review.status)}</span>
        <span class="pill">Follow-up: ${escapeHtml(order.followUpStatus || "No follow-up")}</span>
        ${(order.modifiers || []).map((id) => style?.modifiers.find((modifier) => modifier.id === id)?.name).filter(Boolean).map((name) => `<span class="pill">${escapeHtml(name)}</span>`).join("")}
      </div>
      ${order.notes ? `<p class="muted small-text" style="margin-top: 10px;">${escapeHtml(order.notes)}</p>` : ""}
      <div class="divider"></div>
      <div class="grid-2">
        <div>
          <strong>Estimated materials</strong>
          <div class="tag-list">
            ${estimate.map((line) => `<span class="pill ${line.missing ? "danger-text" : ""}">${escapeHtml(line.role)}: ${line.quantity} ${escapeHtml(line.unit)}</span>`).join("")}
          </div>
        </div>
        <div>
          <strong>Actual usage</strong>
          <div class="tag-list">
            ${(order.actualMaterials || []).map((line) => `<span class="pill">${escapeHtml(line.role)}: ${line.actual} ${escapeHtml(line.unit)}</span>`).join("") || `<span class="muted small-text">Not recorded yet.</span>`}
          </div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="grid-2 order-workflow-grid">
        <div>
          <strong>Payment & follow-up</strong>
          <div class="tag-list">
            ${(order.paymentRecords || []).slice(-3).map((payment) => `<span class="pill">${money(payment.amount)} ${escapeHtml(payment.method)} ${formatDate(payment.receivedAt)}</span>`).join("") || `<span class="muted small-text">No payments recorded.</span>`}
            ${order.followUpAt ? `<span class="pill">Next: ${formatDate(order.followUpAt)}</span>` : ""}
          </div>
          ${order.followUpNote ? `<p class="muted small-text" style="margin-top: 8px;">${escapeHtml(order.followUpNote)}</p>` : ""}
        </div>
        <div>
          <strong>Fitting, review & handoff</strong>
          <div class="tag-list">
            ${latestFitting ? `<span class="pill">${escapeHtml(latestFitting.type)}: ${escapeHtml(latestFitting.status)} ${formatDate(latestFitting.date)}</span>` : `<span class="muted small-text">No fitting scheduled.</span>`}
            ${review.note ? `<span class="pill">Review note saved</span>` : ""}
            ${handoff ? `<span class="pill">${escapeHtml(handoff.method)} ${formatDate(handoff.completedAt)}</span>` : ""}
          </div>
          ${handoff?.note ? `<p class="muted small-text" style="margin-top: 8px;">${escapeHtml(handoff.note)}</p>` : ""}
        </div>
      </div>
      ${(order.stockWarnings || []).length ? `<div class="divider"></div><p class="warning-text small-text">${order.stockWarnings.map(escapeHtml).join("<br>")}</p>` : ""}
      <div class="button-row" style="margin-top: 14px;">
        ${!isTerminal ? `<button class="btn small secondary" type="button" data-action="record-payment" data-id="${escapeHtml(order.id)}">Record payment</button>` : balance > 0 ? `<button class="btn small secondary" type="button" data-action="record-payment" data-id="${escapeHtml(order.id)}">Record balance</button>` : ""}
        ${!isTerminal ? `<button class="btn small secondary" type="button" data-action="schedule-fitting" data-id="${escapeHtml(order.id)}">Schedule fitting</button>` : ""}
        ${!isTerminal && pendingFitting ? `<button class="btn small secondary" type="button" data-action="complete-fitting" data-id="${escapeHtml(order.id)}">Complete fitting</button>` : ""}
        ${!isTerminal && review.status !== "Review requested" && review.status !== "Approved" ? `<button class="btn small secondary" type="button" data-action="request-manager-review" data-id="${escapeHtml(order.id)}">Request review</button>` : ""}
        ${!isTerminal && review.status === "Review requested" ? `<button class="btn small success" type="button" data-action="approve-manager-review" data-id="${escapeHtml(order.id)}">Approve review</button>` : ""}
        ${!isTerminal && review.status === "Review requested" ? `<button class="btn small secondary" type="button" data-action="request-review-changes" data-id="${escapeHtml(order.id)}">Needs changes</button>` : ""}
        ${!isTerminal ? `<button class="btn small secondary" type="button" data-action="update-follow-up" data-id="${escapeHtml(order.id)}">Follow-up</button>` : ""}
        ${!isReserved && !isTerminal ? `<button class="btn small" type="button" data-action="reserve-order" data-id="${escapeHtml(order.id)}">Confirm & reserve</button>` : ""}
        ${isReserved && order.productionStep === "Materials Reserved" ? `
          <input data-cut-input="${escapeHtml(order.id)}" type="number" min="0" step="0.1" placeholder="Actual fabric used">
          <button class="btn small accent" type="button" data-action="cut-order" data-id="${escapeHtml(order.id)}">Start cutting</button>
        ` : ""}
        ${!isTerminal && order.productionStep !== "Materials Reserved" ? `<button class="btn small secondary" type="button" data-action="advance-order" data-id="${escapeHtml(order.id)}">Advance</button>` : ""}
        ${!isTerminal ? `<button class="btn small success" type="button" data-action="handoff-order" data-id="${escapeHtml(order.id)}">Handoff</button>` : ""}
        ${!isTerminal ? `<button class="btn small success" type="button" data-action="complete-order" data-id="${escapeHtml(order.id)}">Complete</button>` : ""}
        ${!isTerminal ? `<button class="btn small secondary" type="button" data-action="cancel-order" data-id="${escapeHtml(order.id)}">Cancel</button>` : ""}
      </div>
    </article>
  `;
}

function renderRecipeCard(style) {
  return `
    <article class="recipe-card">
      <div class="card-header">
        <div>
          <h3>${escapeHtml(style.name)}</h3>
          <p class="muted small-text">${escapeHtml(style.category)} - ${money(style.basePrice)} base</p>
        </div>
        <span class="pill">${style.productionDays} days</span>
      </div>
      <div class="tag-list">
        <span class="pill">${style.baseFabric} ${escapeHtml(style.fabricUnit)} at ${style.fabricWidth} in</span>
        <span class="pill">${style.wastagePercent}% wastage</span>
        <span class="pill">Widths: ${style.supportedWidths.join(", ")}</span>
      </div>
      <div class="divider"></div>
      <p class="muted small-text"><strong>Measurements:</strong> ${(style.requiredMeasurements || []).map(escapeHtml).join(", ") || "Flexible/custom"}</p>
      <p class="muted small-text" style="margin-top: 8px;"><strong>Modifiers:</strong> ${(style.modifiers || []).map((modifier) => `${escapeHtml(modifier.name)} (${modifier.fabricDelta >= 0 ? "+" : ""}${modifier.fabricDelta} ${escapeHtml(style.fabricUnit)})`).join(", ") || "None"}</p>
      ${style.notes ? `<p class="muted small-text" style="margin-top: 8px;">${escapeHtml(style.notes)}</p>` : ""}
    </article>
  `;
}

function renderMaterialRow(item) {
  const available = availableQty(item);
  const low = available <= Number(item.minimumStock || 0);
  return `
    <div class="material-row">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <p class="muted small-text">${escapeHtml(item.colorPattern || item.fabricType || item.supplier || "")}</p>
      </div>
      <span>${escapeHtml(item.category)}</span>
      <span>${round2(item.quantity)} ${escapeHtml(item.unit)}</span>
      <span>${round2(item.reserved)} ${escapeHtml(item.unit)}</span>
      <span>${available} ${escapeHtml(item.unit)}</span>
      <div class="button-row">
        <span class="status ${low ? "danger" : "success"}">${low ? "Low" : "OK"}</span>
        <button class="btn small secondary" type="button" data-action="restock-item" data-id="${escapeHtml(item.id)}">Restock</button>
        <button class="btn small secondary" type="button" data-action="adjust-item" data-id="${escapeHtml(item.id)}">Adjust</button>
      </div>
    </div>
  `;
}

function renderInventoryAdjustment(adjustment) {
  const sign = adjustment.change > 0 ? "+" : "";
  return `
    <article class="record">
      <div class="record-header">
        <div>
          <strong>${escapeHtml(adjustment.itemName || getInventoryItem(adjustment.itemId)?.name || "Inventory item")}</strong>
          <p class="muted small-text">${escapeHtml(adjustment.reason)} - ${formatDate(adjustment.createdAt)}${adjustment.actor ? ` - ${escapeHtml(adjustment.actor)}` : ""}</p>
        </div>
        <span class="status ${adjustment.change < 0 ? "warning" : "success"}">${sign}${round2(adjustment.change)} ${escapeHtml(adjustment.unit)}</span>
      </div>
      <div class="tag-list" style="margin-top: 10px;">
        <span class="pill">${round2(adjustment.quantityBefore)} to ${round2(adjustment.quantityAfter)} ${escapeHtml(adjustment.unit)}</span>
      </div>
      ${adjustment.note ? `<p class="muted small-text" style="margin-top: 8px;">${escapeHtml(adjustment.note)}</p>` : ""}
    </article>
  `;
}

function renderLearningRecord(record) {
  const tone = record.difference > 0 ? "warning" : "success";
  const sign = record.difference > 0 ? "+" : "";
  return `
    <article class="record">
      <div class="record-header">
        <div>
          <strong>${escapeHtml(record.styleName)}</strong>
          <p class="muted small-text">Estimated ${record.estimated} ${escapeHtml(record.unit)}, actual ${record.actual} ${escapeHtml(record.unit)}</p>
        </div>
        <span class="status ${tone}">${sign}${record.difference} ${escapeHtml(record.unit)}</span>
      </div>
      ${record.notes ? `<p class="muted small-text" style="margin-top: 8px;">${escapeHtml(record.notes)}</p>` : ""}
    </article>
  `;
}

function metricCard(label, value, note, icon = "dashboard", signal = "") {
  const valueClass = String(value).length > 8 ? "metric-value metric-value-long" : "metric-value";
  return `
    <article class="metric ${signal === "alert" ? "is-alert" : ""}">
      <div class="metric-head">
        <div class="metric-label">${escapeHtml(label)}</div>
        <span>${iconSvg(icon)}</span>
      </div>
      <div class="${valueClass}">${escapeHtml(value)}</div>
      <div class="metric-note ${signal ? `signal-${signal}` : ""}">${escapeHtml(note)}</div>
    </article>
  `;
}

function iconSvg(name) {
  const paths = {
    dashboard: '<path d="M4 4h7v7H4z"></path><path d="M13 4h7v4h-7z"></path><path d="M13 10h7v10h-7z"></path><path d="M4 13h7v7H4z"></path>',
    orders: '<path d="M7 4h10l2 4v12H5V8z"></path><path d="M7 8h10"></path><path d="M9 13h6"></path>',
    clients: '<path d="M16 19a4 4 0 0 0-8 0"></path><circle cx="12" cy="8" r="3"></circle><path d="M20 19a3 3 0 0 0-3-2.7"></path><path d="M4 19a3 3 0 0 1 3-2.7"></path>',
    measurements: '<path d="M12 3c2 2 4 4 4 7a4 4 0 0 1-8 0c0-3 2-5 4-7z"></path><path d="M9 21h6"></path>',
    recipes: '<path d="M6 4h12v16H6z"></path><path d="M9 8h6"></path><path d="M9 12h6"></path><path d="M9 16h3"></path>',
    inventory: '<path d="M12 3 4 7l8 4 8-4-8-4z"></path><path d="m4 11 8 4 8-4"></path><path d="m4 15 8 4 8-4"></path>',
    production: '<path d="M4 7h7"></path><path d="M13 7h7"></path><path d="M7 4v6"></path><path d="M17 4v6"></path><path d="M4 17h7"></path><path d="M13 17h7"></path><path d="M7 14v6"></path><path d="M17 14v6"></path>',
    inquiries: '<path d="M4 5h16v11H7l-3 3z"></path><path d="M8 9h8"></path><path d="M8 12h5"></path>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"></path>',
    reports: '<path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M8 16v-5"></path><path d="M12 16V8"></path><path d="M16 16v-9"></path>',
    warning: '<path d="m12 3 10 18H2z"></path><path d="M12 9v5"></path><path d="M12 17h.01"></path>',
    search: '<circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 3.5 3.5"></path>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path>',
    calendar: '<path d="M7 3v4"></path><path d="M17 3v4"></path><path d="M4 8h16"></path><rect x="4" y="5" width="16" height="16" rx="2"></rect>',
    filter: '<path d="M4 6h16"></path><path d="M7 12h10"></path><path d="M10 18h4"></path>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.dashboard}</svg>`;
}

function renderBrandMark() {
  const logo = state.profile?.logo;
  const logoView = state.profile?.logoView === "circle" ? "circle" : "square";
  if (logo) {
    return `<div class="brand-mark logo-${logoView}"><img src="${logo}" alt="${escapeHtml(displayName())} logo" loading="lazy"></div>`;
  }
  return `<div class="brand-mark logo-${logoView}">${escapeHtml(initials(displayName()))}</div>`;
}

function emptyState(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function defaultFixedItems() {
  return [
    fixedItemForCategory("Thread", 1, "Thread"),
    fixedItemForCategory("Labels/tags", 1, "Brand label"),
    fixedItemForCategory("Packaging", 1, "Packaging"),
  ].filter(Boolean);
}

function fixedItemForCategory(category, quantity, role) {
  const item = state.inventory.find((material) => material.category === category);
  if (!item) return null;
  return { itemId: item.id, quantity, unit: item.unit, role };
}

function findBestStyle(text) {
  const value = (text || "").toLowerCase();
  if (!value) return null;
  return state.styles.find((style) => value.includes(style.name.toLowerCase()) || style.name.toLowerCase().includes(value));
}

function calculateSizeAdjustment(measurements) {
  const chest = numberValue(measurements["Chest/Bust"]);
  const hip = numberValue(measurements.Hip);
  const length = numberValue(measurements["Dress length"] || measurements["Agbada length"] || measurements["Top length"]);
  let adjustment = 0;
  if (Math.max(chest, hip) >= 46) adjustment += 0.35;
  if (Math.max(chest, hip) >= 52) adjustment += 0.35;
  if (length >= 60) adjustment += 0.25;
  return adjustment;
}

function adjustedPrice(style, modifierIds) {
  if (!style) return 0;
  const modifierCost = (modifierIds || []).reduce((sum, id) => {
    const modifier = style.modifiers.find((item) => item.id === id);
    return sum + Number(modifier?.costDelta || 0);
  }, 0);
  return Number(style.basePrice || 0) + modifierCost;
}

function productionStepToStatus(step) {
  if (step === "First Fitting") return "Fitting";
  if (step === "Ready") return "Ready for Collection";
  if (step === "Delivered/Collected") return "Completed";
  return step;
}

function ordersDueWithin(days) {
  return state.orders.filter((order) => {
    const diff = daysUntil(order.deadline);
    return diff >= 0 && diff <= days && !["Completed", "Cancelled"].includes(order.status);
  });
}

function lowStockItems() {
  return state.inventory.filter((item) => availableQty(item) <= Number(item.minimumStock || 0));
}

function buildReportData() {
  const channelMessages = normalizeChannelMessages(state.channelMessages || []);
  const activeOrders = state.orders.filter((order) => !["Completed", "Cancelled"].includes(order.status));
  const convertedInquiries = state.inquiries.filter((inquiry) => ["Converted to Order", "Confirmed"].includes(inquiry.status));
  const routedMessages = channelMessages.filter((message) => message.routingStatus === "Routed to Inquiry");
  const totalLeads = state.inquiries.length + channelMessages.length;
  const convertedLeads = convertedInquiries.length + routedMessages.length;
  const dueSoon = ordersDueWithin(10);
  const overdueOrders = activeOrders.filter((order) => daysUntil(order.deadline) < 0);
  const revenuePipeline = state.orders.filter((order) => order.status !== "Cancelled").reduce((sum, order) => sum + Number(order.quote || 0), 0);
  const productionPressure = activeOrders.filter((order) => ["Cutting", "Sewing", "First Fitting", "Adjustments", "Finishing", "Quality Check"].includes(order.productionStep)).length;
  const lowStock = lowStockItems();
  const maxStepCount = Math.max(1, ...productionSteps.map((step) => activeOrders.filter((order) => order.productionStep === step).length));

  return {
    activeOrders,
    convertedLeads,
    conversionRate: totalLeads ? Math.round((convertedLeads / totalLeads) * 100) : 0,
    dueSoon,
    lowStock,
    overdueOrders,
    productionPressure,
    revenuePipeline,
    totalLeads,
    replyDrafts: channelMessages
      .filter((message) => message.routingStatus !== "Archived" && message.followUpStatus !== "Closed")
      .slice(0, 4)
      .map(replyDraftForMessage),
    quoteDrafts: state.inquiries
      .filter((inquiry) => !["Converted to Order", "Declined"].includes(inquiry.status))
      .slice(0, 4)
      .map(quoteDraftForInquiry),
    stockAlerts: stockAlerts(lowStock),
    stepLoad: productionSteps.map((step) => {
      const count = activeOrders.filter((order) => order.productionStep === step).length;
      return { step, count, percent: Math.round((count / maxStepCount) * 100) };
    }),
    learningInsights: learningInsights(),
  };
}

function replyDraftForMessage(message) {
  const name = message.senderName || "there";
  const style = message.desiredStyle || "your outfit";
  const deadline = message.deadline ? ` for ${formatDate(message.deadline)}` : "";
  const fabricAsk = message.message.toLowerCase().includes("fabric")
    ? "Please also confirm the fabric type, width, and quantity you have."
    : "Please send reference photos, preferred fit, measurements status, and fabric details if you already have fabric.";

  return {
    name: message.senderName || message.contact || "Unknown sender",
    channel: message.channel,
    contact: message.contact,
    desiredStyle: message.desiredStyle,
    deadline: message.deadline,
    followUpStatus: message.followUpStatus,
    copy: `Hi ${name}, thanks for reaching out about ${style}${deadline}. ${fabricAsk} Once I have those details, I can confirm timing and prepare a clean quote.`,
  };
}

function quoteDraftForInquiry(inquiry) {
  const style = findBestStyle(inquiry.desiredStyle);
  const estimate = style ? Number(style.basePrice || 0) : Number(inquiry.budget || 0);
  const productionDays = style ? Number(style.productionDays || 7) : 7;
  const deadlineText = inquiry.deadline ? ` Target date: ${formatDate(inquiry.deadline)}.` : "";
  const budgetText = inquiry.budget ? ` Your stated budget is ${money(inquiry.budget)}.` : "";
  const estimateText = estimate ? `A starting quote is ${money(estimate)}, subject to fabric, measurements, and finishing choices.` : "I can confirm pricing after fabric, measurements, and finishing choices are clear.";

  return {
    clientName: inquiry.clientName || "New client",
    channel: inquiry.channel || "CRM",
    desiredStyle: inquiry.desiredStyle,
    estimate,
    productionDays,
    status: inquiry.status,
    copy: `Hi ${inquiry.clientName || "there"}, thanks for the ${inquiry.desiredStyle || "custom garment"} request.${deadlineText}${budgetText} ${estimateText} Production would need about ${productionDays} working days after confirmation and material availability.`,
  };
}

function stockAlerts(lowStock = []) {
  const alerts = lowStock.map((item) => ({
    name: item.name,
    category: item.category,
    available: availableQty(item),
    unit: item.unit,
    tone: "danger",
    label: "Low",
    note: `Minimum stock is ${round2(item.minimumStock)} ${item.unit}; restock before confirming work that needs this material.`,
  }));

  const reservedPressure = state.inventory
    .filter((item) => Number(item.reserved || 0) > 0 && !lowStock.some((low) => low.id === item.id))
    .sort((a, b) => Number(b.reserved || 0) - Number(a.reserved || 0))
    .slice(0, Math.max(0, 6 - alerts.length))
    .map((item) => ({
      name: item.name,
      category: item.category,
      available: availableQty(item),
      unit: item.unit,
      tone: "warning",
      label: "Reserved",
      note: `${round2(item.reserved)} ${item.unit} is reserved for active work; check availability before quoting similar pieces.`,
    }));

  return [...alerts, ...reservedPressure].slice(0, 6);
}

function learningInsights() {
  if (!state.usageRecords.length) return [];
  const totalDifference = state.usageRecords.reduce((sum, record) => sum + Number(record.difference || 0), 0);
  const overages = state.usageRecords.filter((record) => Number(record.difference || 0) > 0);
  const savings = state.usageRecords.filter((record) => Number(record.difference || 0) < 0);
  const largestOverage = [...state.usageRecords].sort((a, b) => Number(b.difference || 0) - Number(a.difference || 0))[0];

  return [
    {
      title: "Net material variance",
      detail: "Positive values mean actual usage ran above the estimate.",
      value: `${totalDifference > 0 ? "+" : ""}${round2(totalDifference)}`,
      tone: totalDifference > 0 ? "warning" : "success",
    },
    {
      title: "Over-estimate pressure",
      detail: `${overages.length} completed ${overages.length === 1 ? "piece used" : "pieces used"} more material than planned.`,
      value: String(overages.length),
      tone: overages.length ? "warning" : "success",
    },
    {
      title: "Best savings signal",
      detail: savings.length ? `${savings.length} records came in below estimate.` : "No below-estimate usage records yet.",
      value: String(savings.length),
      tone: savings.length ? "success" : "",
    },
    largestOverage
      ? {
          title: "Largest variance",
          detail: largestOverage.styleName || "Completed order",
          value: `${Number(largestOverage.difference || 0) > 0 ? "+" : ""}${round2(largestOverage.difference)} ${largestOverage.unit || ""}`.trim(),
          tone: Number(largestOverage.difference || 0) > 0 ? "warning" : "success",
        }
      : null,
  ].filter(Boolean);
}

function availableQty(item) {
  if (!item) return 0;
  return round2(Number(item.quantity || 0) - Number(item.reserved || 0));
}

function orderPaidTotal(order) {
  const payments = normalizePaymentRecords(order.paymentRecords, { orderId: order.id, legacyDeposit: numberValue(order.deposit) });
  const total = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return round2(total || numberValue(order.deposit));
}

function orderBalanceDue(order) {
  return Math.max(0, round2(numberValue(order.quote) - orderPaidTotal(order)));
}

function latestOrderFitting(order) {
  const fittings = normalizeFittingEvents(order.fittingEvents, order.fittingDate);
  return fittings.length ? fittings[fittings.length - 1] : null;
}

function latestPendingFitting(order) {
  const fittings = normalizeFittingEvents(order.fittingEvents, order.fittingDate);
  return [...fittings].reverse().find((event) => event.status === "Scheduled" || event.status === "Rescheduled") || null;
}

function currentUserLabel() {
  const user = currentUser();
  return user?.name || user?.email || "Local user";
}

function recordOrderActivity(order, label, detail = "") {
  order.activity = normalizeOrderActivity(order.activity);
  order.activity.push({
    id: uid("act"),
    label,
    detail,
    actor: currentUserLabel(),
    createdAt: new Date().toISOString(),
  });
  order.activity = order.activity.slice(-60);
}

function displayName() {
  return state.profile?.displayName || state.profile?.businessName || "Fashion Studio OS";
}

function viewTitle(view) {
  const titles = {
    dashboard: "Studio Control Room",
    inquiries: "CRM Inbox",
    clients: "Client Profiles",
    measurements: "Measurements",
    orders: "Garment Orders",
    recipes: "Style Recipes",
    inventory: "Material Reserve",
    production: "Production Flow",
    reports: "Reports",
    settings: "Brand & Settings",
  };
  return titles[view] || "Studio Control Room";
}

function viewSubtitle(view) {
  const subtitles = {
    dashboard: "One operating map for inquiries, stock, fittings, production, and revenue.",
    inquiries: "Route Instagram, WhatsApp, walk-in, and referral demand into clear order opportunities.",
    clients: "Keep client context, measurements, notes, preferences, and history together.",
    measurements: "Flexible measurement profiles with custom fields per client.",
    orders: "Quote, reserve materials, cut, sew, fit, finish, and prepare for collection.",
    recipes: "Editable garment blueprints and bill-of-material estimates.",
    inventory: "Track fabric, trims, notions, reserved materials, and available quantity.",
    production: "Move work through the studio pipeline with accountability and QC.",
    reports: "Read conversion, quote, stock, production, and usage signals from current records.",
    settings: "Customize identity, brand colors, units, and reusable business details.",
  };
  return subtitles[view] || "";
}

function statusTone(status) {
  if (["Completed", "Confirmed", "Converted to Order", "Ready for Pickup/Delivery", "Ready for Collection", "Ready"].includes(status)) return "success";
  if (["Routed to Inquiry"].includes(status)) return "success";
  if (["New", "Quoted", "Materials Reserved", "Cutting", "Sewing", "Fitting", "Adjustments", "Finishing", "Quality Check", "Review requested", "Changes requested"].includes(status)) return "warning";
  if (["Declined", "Cancelled", "Archived"].includes(status)) return "danger";
  return "";
}

function getClient(id) {
  return state.clients.find((client) => client.id === id);
}

function getStyle(id) {
  return state.styles.find((style) => style.id === id);
}

function getInventoryItem(id) {
  return state.inventory.find((item) => item.id === id);
}

function getOrder(id) {
  return state.orders.find((order) => order.id === id);
}

function currentUser() {
  return auth.users.find((user) => user.id === auth.sessionUserId) || null;
}

function fullAccess() {
  return navItems.map(([view]) => view);
}

function normalizeAccess(access = []) {
  const allowed = new Set(fullAccess());
  const normalized = Array.isArray(access)
    ? access.filter((view) => allowed.has(view))
    : [];
  const unique = [...new Set(normalized)];
  return unique.length ? unique : ["dashboard"];
}

function selectedAccessFrom(form) {
  return normalizeAccess([...form.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value));
}

function currentAccess() {
  const user = currentUser();
  if (!user || user.role === "manager") return fullAccess();
  return normalizeAccess(user.access);
}

function canAccess(view) {
  return currentAccess().includes(view);
}

function accessibleNavItems() {
  const allowed = new Set(currentAccess());
  const nav = navItems.filter(([view]) => allowed.has(view));
  return nav.length ? nav : navItems.filter(([view]) => view === "dashboard");
}

function staffUsers() {
  return auth.users.filter((user) => user.role === "staff");
}

function teamMembers() {
  const meId = currentUser()?.id;
  return auth.users.filter((user) => user.id !== meId);
}

function viewLabel(view) {
  return navItems.find(([key]) => key === view)?.[2] || view;
}

function statusLabel(status) {
  const normalized = normalizeChoice(status, staffStatuses, "active");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

async function runServerAuthAction(action, payload = {}, options = {}) {
  try {
    const response = await fetch(API_SESSION_PATH, {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      credentials: "same-origin",
      body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Auth request failed with ${response.status}`);
    }

    applyServerSessionResult(result, options);
    if (options.successMessage) {
      showToast(options.successMessage);
    }
    render();
    return result;
  } catch (error) {
    console.warn("Server auth action failed.", error);
    showToast(error.message || "Auth request failed.");
    if (typeof options.onError === "function") options.onError(error);
    return null;
  }
}

function applyServerSessionResult(result = {}, options = {}) {
  backendReady = true;
  storageMode = "server";
  storageMessage = "All changes saved";
  syncFailureAnnounced = false;

  if (result.auth) {
    auth = normalizeAuth(result.auth);
    persistLocalAuth();
  }

  if (options.clearState) {
    localStorage.removeItem(STORAGE_KEY);
    state = createSeedState();
  } else if (Object.prototype.hasOwnProperty.call(result, "state") && result.state) {
    state = normalizeState(result.state);
    persistLocalState();
  }

  authMode = auth.users.length ? "signin" : "signup";
  selectedClientId = state.clients[0]?.id || "";
  draftOrderStyleId = state.styles[0]?.id || "";

  if (options.nextView === "first-accessible") {
    const nav = accessibleNavItems();
    currentView = nav[0]?.[0] || "dashboard";
    localStorage.setItem(VIEW_KEY, currentView);
  } else if (options.nextView) {
    currentView = options.nextView;
    localStorage.setItem(VIEW_KEY, currentView);
  }

  if (!currentUser()) {
    mobileNavOpen = false;
  }
}

function saveState() {
  persistLocalState();
  void saveBackendData(API_STATE_PATH, state);
}

// Local-dev convenience: load the sample studio from the console. Never wired
// into the tester-facing UI; real workspaces stay empty until the owner adds data.
function loadStudioDemo() {
  state = normalizeState(createDemoState());
  selectedClientId = state.clients[0]?.id || "";
  draftOrderStyleId = state.styles[0]?.id || "";
  saveState();
  render();
  showToast("Sample studio data loaded (dev only).");
}

function isDevHost() {
  const host = window.location.hostname;
  return window.location.protocol === "file:" || host === "localhost" || host === "127.0.0.1";
}

function saveAuth() {
  persistLocalAuth();
}

function persistLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function persistLocalAuth() {
  // In server mode the session lives in the HttpOnly cookie, not the browser.
  // Never persist the session pointer at rest, so a reload can't resurrect a
  // signed-in shell without a valid server session.
  const safeAuth = backendReady || auth.serverManaged
    ? { ...auth, sessionUserId: "" }
    : auth;
  localStorage.setItem(AUTH_KEY, JSON.stringify(safeAuth));
}

async function saveBackendData(path, value) {
  if (!backendReady) return;
  try {
    const response = await fetch(path, {
      method: "PUT",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      credentials: "same-origin",
      body: JSON.stringify(value),
    });
    if (!response.ok) {
      throw new Error(`Sync failed with ${response.status}`);
    }
    storageMode = "server";
    storageMessage = "All changes saved";
    syncFailureAnnounced = false;
  } catch (error) {
    console.warn("Could not sync Studio OS data to backend. Continuing with browser storage.", error);
    backendReady = false;
    storageMode = "local";
    storageMessage = "Saved on this device";
    if (!syncFailureAnnounced) {
      syncFailureAnnounced = true;
      showToast("Couldn't save your last change online. It's kept on this device.");
      render();
    }
  }
}

function applyTheme() {
  const theme = { ...defaultTheme, ...(state.profile?.theme || {}) };
  const root = document.documentElement;
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--sidebar", theme.sidebar);
  root.style.setProperty("--success", theme.success);
  root.style.setProperty("--warning", theme.warning || theme.accent);
  root.style.setProperty("--background", theme.background);
  root.style.setProperty("--surface", theme.surface);
  root.style.setProperty("--surface-elevated", theme.surfaceElevated);
  root.style.setProperty("--text-primary", theme.textPrimary);
  root.style.setProperty("--text-muted", theme.textMuted);
  root.style.setProperty("--border", theme.border);
  root.style.setProperty("--sand", theme.sand);
  root.style.setProperty("--warm-surface", theme.warmSurface);
  root.style.setProperty("--bg", theme.background);
  root.style.setProperty("--panel", theme.surface);
  root.style.setProperty("--panel-strong", theme.surfaceElevated);
  root.style.setProperty("--text", theme.textPrimary);
  root.style.setProperty("--muted", theme.textMuted);
  root.style.setProperty("--line", theme.border);
  root.dataset.bgMode = theme.backgroundMode || "dark";
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function money(value) {
  const currency = state.profile?.currency || "NGN";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toLocaleString()}`;
  }
}

function isoDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "No date";
  const text = String(value);
  const date = new Date(text.includes("T") ? text : `${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function daysUntil(value) {
  if (!value) return Infinity;
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date - today) / 86400000);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clean(value) {
  return String(value ?? "").trim();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function splitCsv(value) {
  return clean(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugify(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || uid("modifier");
}

function initials(value) {
  return clean(value)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "FS";
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
