const STORAGE_KEY = "fashion-studio-os-state-v1";
const VIEW_KEY = "fashion-studio-os-view-v1";
const AUTH_KEY = "fashion-studio-os-auth-v1";
const API_BOOTSTRAP_PATH = "/api/bootstrap";
const API_STATE_PATH = "/api/state";
const API_AUTH_PATH = "/api/auth";
const API_DATA_PATH = "/api/data";

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
  ["settings", "settings", "Settings"],
];

let state = loadState();
let auth = loadAuth();
let currentView = initialView();
let authMode = auth.users.length ? "signin" : "signup";
let selectedClientId = state.clients[0]?.id || "";
let draftOrderStyleId = state.styles[0]?.id || "";
let modalState = null;
let toastTimer;
let backendReady = false;
let storageMode = "loading";
let storageMessage = "Checking server storage";
let syncFailureAnnounced = false;

renderLoading();
initializeApp();

async function initializeApp() {
  const snapshot = await loadBackendSnapshot();

  if (snapshot) {
    const localStateExists = Boolean(localStorage.getItem(STORAGE_KEY));
    const localAuthExists = Boolean(localStorage.getItem(AUTH_KEY));

    state = normalizeState(snapshot.state || loadState());
    auth = normalizeAuth(snapshot.auth || loadAuth());
    persistLocalState();
    persistLocalAuth();

    if (!snapshot.stateExists && localStateExists) {
      void saveBackendData(API_STATE_PATH, state);
    }
    if (!snapshot.authExists && localAuthExists) {
      void saveBackendData(API_AUTH_PATH, auth);
    }
  }

  authMode = auth.users.length ? "signin" : "signup";
  selectedClientId = state.clients[0]?.id || "";
  draftOrderStyleId = state.styles[0]?.id || "";
  render();
}

async function loadBackendSnapshot() {
  if (window.location.protocol === "file:") {
    storageMode = "local";
    storageMessage = "Browser storage";
    return null;
  }

  try {
    const response = await fetch(API_BOOTSTRAP_PATH, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }
    const snapshot = await response.json();
    backendReady = true;
    storageMode = "server";
    storageMessage = "Server storage";
    syncFailureAnnounced = false;
    return snapshot;
  } catch (error) {
    console.warn("Fashion Store OS backend unavailable. Using local browser storage.", error);
    backendReady = false;
    storageMode = "local";
    storageMessage = "Browser storage fallback";
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
          access: normalizeAccess(user.access),
          createdAt: user.createdAt || isoDate(0),
        }))
        .filter((user) => user.email)
    : [];
  const sessionUserId = users.some((user) => user.id === nextAuth.sessionUserId) ? nextAuth.sessionUserId : "";
  return { users, sessionUserId };
}

function normalizeState(nextState = {}) {
  const seed = createSeedState();
  const hasProfile = Object.prototype.hasOwnProperty.call(nextState, "profile");
  return {
    ...seed,
    ...nextState,
    profile: hasProfile && nextState.profile ? normalizeProfile(nextState.profile, createDefaultProfile()) : null,
    clients: Array.isArray(nextState.clients) ? nextState.clients : seed.clients,
    inquiries: Array.isArray(nextState.inquiries) ? nextState.inquiries : seed.inquiries,
    styles: Array.isArray(nextState.styles) ? nextState.styles : seed.styles,
    inventory: Array.isArray(nextState.inventory) ? nextState.inventory : seed.inventory,
    orders: Array.isArray(nextState.orders) ? nextState.orders : seed.orders,
    usageRecords: Array.isArray(nextState.usageRecords) ? nextState.usageRecords : seed.usageRecords,
  };
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
          <p class="lead">Checking server storage and loading the latest studio records.</p>
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
    setCurrentView(nav[0]?.[0] || "dashboard");
  }

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand-block">
          ${renderBrandMark()}
          <div>
            <div class="brand-name">${escapeHtml(displayName())}</div>
            <div class="brand-meta">${escapeHtml(state.profile.businessType || "Fashion studio")}</div>
          </div>
        </div>
        <nav class="nav" aria-label="Primary navigation">
          ${nav.map(([view, icon, label]) => `
            <button class="${view === currentView ? "active" : ""}" type="button" data-nav="${view}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
              <span class="nav-icon">${iconSvg(icon)}</span>
              <span class="nav-label">${label}</span>
            </button>
          `).join("")}
        </nav>
      </aside>
      <main class="main">
        ${renderTopbar()}
        ${renderView()}
      </main>
      ${renderModal()}
    </div>
  `;

  wireEvents();
  focusModalControl();
}

function renderOnboarding() {
  const mode = authMode === "signin" ? "signin" : "signup";
  const hasAccounts = auth.users.length > 0;
  const actionTitle = mode === "signin" ? "Sign in to Studio OS" : "Create manager access";
  const actionCopy = mode === "signin"
    ? "Use the manager account or a staff account created by the manager."
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
          <button class="${mode === "signup" ? "active" : ""}" type="button" data-auth-mode="signup" role="tab" aria-selected="${mode === "signup"}">Sign up</button>
        </div>
        <div class="panel-header">
          <div>
            <h2>${actionTitle}</h2>
            <p>${actionCopy}</p>
          </div>
        </div>
        ${mode === "signin" ? renderSignInForm(hasAccounts) : renderSignUpForm()}
      </section>
    </main>
  `;
  wireEvents();
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
        <input name="password" type="password" autocomplete="new-password" required minlength="6" placeholder="Minimum 6 characters">
      </label>
      <label class="field">
        <span>Confirm password</span>
        <input name="confirmPassword" type="password" autocomplete="new-password" required minlength="6" placeholder="Repeat password">
      </label>
      <div class="auth-note full">The first account is the manager and can create up to two staff accounts in Settings.</div>
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
    const storeLabel = backendReady ? "server workspace and browser backup" : "browser storage";
    return renderConfirmModal({
      title: "Reset workspace data",
      eyebrow: backendReady ? "Server storage" : "Local browser storage",
      message: `This clears Studio OS records, sign-in records, and staff accounts from ${storeLabel}.`,
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
            <p>This is saved to the backend when available, with browser storage as a fallback.</p>
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
        ${metricCard("New Inquiries", newInquiries.length, "Route high-intent messages into tracked order drafts", "inquiries")}
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
  return `
    <section class="content">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>New client inquiry</h2>
            <p>Capture the conversation context before it disappears inside a chat thread.</p>
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
              <option>WhatsApp</option>
              <option>Instagram</option>
              <option>Walk-in</option>
              <option>Referral</option>
              <option>Website</option>
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
            <span>Status</span>
          </div>
          ${state.inventory.map(renderMaterialRow).join("")}
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

      ${currentUser()?.role === "manager" ? renderTeamAccessPanel() : renderAccessSummaryPanel()}

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Workspace data</h2>
            <p>Records sync to the backend when the app is served through node server.js; browser storage remains the fallback.</p>
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
  const staff = staffUsers();
  const remaining = Math.max(0, 2 - staff.length);
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Staff access</h2>
          <p>Create up to two staff accounts and assign the sections each person can use.</p>
        </div>
        <span class="status">${staff.length}/2 staff</span>
      </div>
      ${remaining ? renderStaffCreateForm() : `<div class="empty">Staff limit reached. Remove a staff account before adding another.</div>`}
      <div class="team-list">
        ${staff.map(renderStaffAccessCard).join("") || emptyState("No staff accounts yet.")}
      </div>
    </section>
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
          <span>Staff name</span>
          <input name="name" required placeholder="Tailor, admin, or assistant">
        </label>
        <label class="field">
          <span>Email</span>
          <input name="email" type="email" required placeholder="staff@studio.com">
        </label>
        <label class="field">
          <span>Password</span>
          <input name="password" type="password" required minlength="6" placeholder="Minimum 6 characters">
        </label>
        <div class="field">
          <span>Access</span>
          ${renderAccessChecks(["dashboard", "orders", "clients", "measurements"])}
        </div>
      </div>
      <div class="button-row">
        <button class="btn small" type="submit">Create staff account</button>
      </div>
    </form>
  `;
}

function renderStaffAccessCard(user) {
  return `
    <article class="team-card">
      <div>
        <h3>${escapeHtml(user.name)}</h3>
        <p>${escapeHtml(user.email)}</p>
      </div>
      <form data-staff-access="${escapeHtml(user.id)}">
        ${renderAccessChecks(user.access, `access-${user.id}`)}
        <div class="button-row">
          <button class="btn small secondary" type="submit">Save access</button>
          <button class="btn small danger" type="button" data-action="delete-staff" data-id="${escapeHtml(user.id)}">Remove</button>
        </div>
      </form>
    </article>
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
      authMode = authModeButton.dataset.authMode === "signin" ? "signin" : "signup";
      render();
      return;
    }

    const navButton = event.target.closest("[data-nav]");
    if (navButton) {
      setCurrentView(navButton.dataset.nav);
      render();
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    const { action, id, label } = actionButton.dataset;
    if (action === "convert-inquiry") convertInquiry(id);
    if (action === "open-measurements") openMeasurements(id);
    if (action === "delete-measurement") deleteMeasurement(label);
    if (action === "reserve-order") reserveOrder(id);
    if (action === "cut-order") cutOrder(id);
    if (action === "advance-order") advanceOrder(id);
    if (action === "complete-order") completeOrder(id);
    if (action === "cancel-order") cancelOrder(id);
    if (action === "restock-item") restockItem(id);
    if (action === "apply-premium-brand") applyPremiumBrand();
    if (action === "apply-neutral-brand") applyNeutralBrand();
    if (action === "close-modal") closeModal();
    if (action === "confirm-delete-staff") confirmDeleteStaff(id);
    if (action === "confirm-reset-data") confirmResetLocalData();
    if (action === "sign-out") signOut();
    if (action === "delete-staff") deleteStaff(id);
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
  };

  app.onkeydown = (event) => {
    if (event.key === "Escape" && modalState) {
      closeModal();
    }
  };

  app.onsubmit = (event) => {
    event.preventDefault();
    const form = event.target;
    if (form.id === "signinForm") handleSignIn(form);
    if (form.id === "signupForm") handleSignUp(form);
    if (form.id === "setupForm") handleProfileSubmit(form, true);
    if (form.id === "settingsForm") handleProfileSubmit(form, false);
    if (form.id === "staffForm") handleStaffSubmit(form);
    if (form.dataset.staffAccess) handleStaffAccessSubmit(form);
    if (form.id === "inquiryForm") handleInquirySubmit(form);
    if (form.id === "clientForm") handleClientSubmit(form);
    if (form.id === "measurementForm") handleMeasurementSubmit(form);
    if (form.id === "inventoryForm") handleInventorySubmit(form);
    if (form.id === "recipeForm") handleRecipeSubmit(form);
    if (form.id === "orderForm") handleOrderSubmit(form);
    if (form.id === "restockForm") handleRestockSubmit(form);
  };
}

function handleSignUp(form) {
  const data = new FormData(form);
  const name = clean(data.get("name"));
  const email = clean(data.get("email")).toLowerCase();
  const password = String(data.get("password") || "");
  const confirmPassword = String(data.get("confirmPassword") || "");

  if (auth.users.some((user) => user.email === email)) {
    showToast("An account already exists for that email.");
    return;
  }
  if (auth.users.some((user) => user.role === "manager")) {
    authMode = "signin";
    showToast("Manager access already exists. Sign in or add staff from Settings.");
    render();
    return;
  }
  if (password.length < 6 || password !== confirmPassword) {
    showToast("Passwords must match and be at least 6 characters.");
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
  setCurrentView(preferredAccessibleView("dashboard"));
  showToast("Manager access created.");
  render();
}

function handleSignIn(form) {
  const data = new FormData(form);
  const email = clean(data.get("email")).toLowerCase();
  const password = String(data.get("password") || "");
  const user = auth.users.find((item) => item.email === email && item.password === password);
  if (!user) {
    showToast("Sign in details do not match.");
    return;
  }
  auth.sessionUserId = user.id;
  saveAuth();
  const nav = accessibleNavItems();
  setCurrentView(preferredAccessibleView(nav[0]?.[0] || "dashboard"));
  showToast(`Welcome, ${user.name}.`);
  render();
}

function signOut() {
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

  if (isFirstLaunch) {
    setCurrentView(preferredAccessibleView("dashboard"));
  }
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

function handleStaffSubmit(form) {
  if (currentUser()?.role !== "manager") {
    showToast("Only the manager can create staff accounts.");
    return;
  }
  if (staffUsers().length >= 2) {
    showToast("Staff limit reached. Remove one staff account before adding another.");
    return;
  }

  const data = new FormData(form);
  const name = clean(data.get("name"));
  const email = clean(data.get("email")).toLowerCase();
  const password = String(data.get("password") || "");
  if (auth.users.some((user) => user.email === email)) {
    showToast("An account already exists for that email.");
    return;
  }
  if (password.length < 6) {
    showToast("Staff password must be at least 6 characters.");
    return;
  }

  auth.users.push({
    id: uid("staff"),
    name,
    email,
    password,
    role: "staff",
    access: selectedAccessFrom(form),
    createdAt: isoDate(0),
  });
  saveAuth();
  showToast("Staff account created.");
  render();
}

function handleStaffAccessSubmit(form) {
  if (currentUser()?.role !== "manager") {
    showToast("Only the manager can update staff access.");
    return;
  }
  const staff = auth.users.find((user) => user.id === form.dataset.staffAccess && user.role === "staff");
  if (!staff) return;
  staff.access = selectedAccessFrom(form);
  saveAuth();
  showToast("Staff access updated.");
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

function confirmDeleteStaff(id) {
  if (currentUser()?.role !== "manager") {
    showToast("Only the manager can remove staff accounts.");
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

  const order = {
    id: uid("ord"),
    clientId: clean(data.get("clientId")),
    styleId: clean(data.get("styleId")),
    fabricId: clean(data.get("fabricId")),
    modifiers,
    status: "Quoted",
    productionStep: "Consultation",
    deadline: clean(data.get("deadline")),
    fittingDate: clean(data.get("fittingDate")),
    quote,
    deposit: numberValue(data.get("deposit")),
    assignedTo: clean(data.get("assignedTo")),
    notes: clean(data.get("notes")),
    estimatedMaterials: [],
    reservedMaterials: [],
    actualMaterials: [],
    stockWarnings: [],
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
    createdAt: isoDate(0),
  };
  order.estimatedMaterials = estimateOrder(order).lineItems;
  state.orders.unshift(order);
  inquiry.status = "Converted to Order";
  setCurrentView("orders");
  saveState();
  showToast("Inquiry converted to an order draft.");
  render();
}

function openMeasurements(id) {
  selectedClientId = id;
  setCurrentView("measurements");
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
  saveState();
  render();
}

function completeOrder(id) {
  const order = getOrder(id);
  if (!order) return;

  consumeRemainingReserved(order);
  const mainEstimate = (order.estimatedMaterials || order.reservedMaterials || []).find((line) => line.role === "Main fabric");
  const mainActual = (order.actualMaterials || []).find((line) => line.role === "Main fabric");
  const estimated = mainEstimate?.quantity || mainActual?.estimated || 0;
  const actual = mainActual?.actual || estimated;

  if (mainEstimate) {
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
  order.completedAt = isoDate(0);
  saveState();
  showToast("Order completed and learning record saved.");
  render();
}

function cancelOrder(id) {
  const order = getOrder(id);
  if (!order) return;
  releaseReservation(order);
  order.status = "Cancelled";
  order.productionStep = "Consultation";
  saveState();
  showToast("Order cancelled and reservations released.");
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
  item.quantity = round2(Number(item.quantity || 0) + amount);
  closeModal(false);
  saveState();
  showToast("Inventory updated.");
  render();
}

function resetLocalData() {
  modalState = { type: "reset-data" };
  render();
}

async function confirmResetLocalData() {
  closeModal(false);
  const wasBackendReady = backendReady;
  if (backendReady) {
    try {
      const response = await fetch(API_DATA_PATH, { method: "DELETE", headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new Error(`Reset failed with ${response.status}`);
      }
    } catch (error) {
      console.warn("Could not reset backend data. Clearing browser storage only.", error);
      backendReady = false;
      storageMode = "local";
      storageMessage = "Browser storage fallback";
    }
  }
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(VIEW_KEY);
  localStorage.removeItem(AUTH_KEY);
  state = createSeedState();
  auth = normalizeAuth();
  authMode = "signup";
  setCurrentView("dashboard");
  selectedClientId = state.clients[0]?.id || "";
  draftOrderStyleId = state.styles[0]?.id || "";
  showToast(wasBackendReady && backendReady ? "Workspace data reset." : "Browser data reset.");
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
      ${(order.stockWarnings || []).length ? `<div class="divider"></div><p class="warning-text small-text">${order.stockWarnings.map(escapeHtml).join("<br>")}</p>` : ""}
      <div class="button-row" style="margin-top: 14px;">
        ${!isReserved && !isTerminal ? `<button class="btn small" type="button" data-action="reserve-order" data-id="${escapeHtml(order.id)}">Confirm & reserve</button>` : ""}
        ${isReserved && order.productionStep === "Materials Reserved" ? `
          <input data-cut-input="${escapeHtml(order.id)}" type="number" min="0" step="0.1" placeholder="Actual fabric used">
          <button class="btn small accent" type="button" data-action="cut-order" data-id="${escapeHtml(order.id)}">Start cutting</button>
        ` : ""}
        ${!isTerminal && order.productionStep !== "Materials Reserved" ? `<button class="btn small secondary" type="button" data-action="advance-order" data-id="${escapeHtml(order.id)}">Advance</button>` : ""}
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
      </div>
    </div>
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

function availableQty(item) {
  if (!item) return 0;
  return round2(Number(item.quantity || 0) - Number(item.reserved || 0));
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
    settings: "Customize identity, brand colors, units, and reusable business details.",
  };
  return subtitles[view] || "";
}

function statusTone(status) {
  if (["Completed", "Confirmed", "Converted to Order", "Ready for Pickup/Delivery", "Ready for Collection", "Ready"].includes(status)) return "success";
  if (["New", "Quoted", "Materials Reserved", "Cutting", "Sewing", "Fitting", "Adjustments", "Finishing", "Quality Check"].includes(status)) return "warning";
  if (["Declined", "Cancelled"].includes(status)) return "danger";
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

function preferredAccessibleView(fallback) {
  const access = currentAccess();
  const hashView = viewFromHash();
  if (hashView && access.includes(hashView)) return hashView;
  if (isKnownView(currentView) && access.includes(currentView)) return currentView;
  return fallback;
}

function initialView() {
  const hashView = viewFromHash();
  if (hashView) return hashView;

  const savedView = localStorage.getItem(VIEW_KEY);
  return isKnownView(savedView) ? savedView : "dashboard";
}

function viewFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const view = decodeURIComponent(hash).trim();
  return isKnownView(view) ? view : "";
}

function isKnownView(view) {
  return navItems.some(([key]) => key === view);
}

function setCurrentView(view, options = {}) {
  currentView = isKnownView(view) ? view : "dashboard";
  localStorage.setItem(VIEW_KEY, currentView);

  if (options.syncHash === false) return;

  const nextHash = `#${encodeURIComponent(currentView)}`;
  if (window.location.hash !== nextHash) {
    history.replaceState(null, "", nextHash);
  }
}

window.addEventListener("hashchange", () => {
  const hashView = viewFromHash();
  if (!hashView || hashView === currentView) return;

  setCurrentView(hashView, { syncHash: false });
  render();
});

function staffUsers() {
  return auth.users.filter((user) => user.role === "staff");
}

function viewLabel(view) {
  return navItems.find(([key]) => key === view)?.[2] || view;
}

function saveState() {
  persistLocalState();
  void saveBackendData(API_STATE_PATH, state);
}

function saveAuth() {
  persistLocalAuth();
  void saveBackendData(API_AUTH_PATH, auth);
}

function persistLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function persistLocalAuth() {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

async function saveBackendData(path, value) {
  if (!backendReady) return;
  try {
    const response = await fetch(path, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(value),
    });
    if (!response.ok) {
      throw new Error(`Sync failed with ${response.status}`);
    }
    storageMode = "server";
    storageMessage = "Server storage";
    syncFailureAnnounced = false;
  } catch (error) {
    console.warn("Could not sync Studio OS data to backend. Continuing with browser storage.", error);
    backendReady = false;
    storageMode = "local";
    storageMessage = "Browser storage fallback";
    if (!syncFailureAnnounced) {
      syncFailureAnnounced = true;
      showToast("Server sync failed. Browser storage is still active.");
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
  const date = new Date(`${value}T00:00:00`);
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
