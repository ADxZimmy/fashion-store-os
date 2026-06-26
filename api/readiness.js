const { handleError, handleOptions, sendJson, sendMethodNotAllowed } = require("./_response");
const { getStorageSummary } = require("./_store");

module.exports = async function handler(request, response) {
  const methods = ["GET", "OPTIONS"];
  if (handleOptions(request, response, methods)) return;
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, methods);
    return;
  }

  try {
    const storage = getStorageSummary();
    const releaseOwner = String(process.env.FASHION_STORE_RELEASE_OWNER || "ADxZimmy").trim();
    const signatureRequired = process.env.CHANNEL_WEBHOOK_REQUIRE_SIGNATURE === "1";
    const checks = [
      {
        name: "production storage configured",
        ok: Boolean(storage.configured),
        detail: storage.configured ? `Supabase host ${storage.host}` : storage.error || "Supabase env vars missing",
      },
      {
        name: "server-side Supabase key preferred",
        ok: Boolean(storage.configured && storage.keySource && storage.keySource !== "PUBLIC_KEY_FALLBACK"),
        detail: storage.keySource || "No server-side key configured",
      },
      {
        name: "workspace id valid",
        ok: storage.workspace !== "invalid",
        detail: storage.workspace,
      },
      {
        name: "webhook signatures required in production",
        ok: signatureRequired,
        detail: signatureRequired ? "Required" : "Optional until provider secrets are configured",
      },
      {
        name: "owner release lane",
        ok: releaseOwner === "ADxZimmy",
        detail: releaseOwner,
      },
      {
        name: "operations runbook present",
        ok: true,
        detail: "docs/operations-runbook.md",
      },
    ];

    sendJson(response, 200, {
      ok: checks.every((check) => check.ok),
      mode: "production",
      storage: storage.storage,
      workspace: storage.workspace,
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    handleError(response, error);
  }
};
