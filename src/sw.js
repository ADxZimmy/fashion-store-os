// Offline app shell for the Phase 021 local-first pivot.
//
// Business data lives on the device, but the app that reads it is served over
// the network, so without this the shop cannot open its own records with the
// network down -- the failure mode the pivot exists to remove.
//
// Deliberately narrow: it precaches the shell (HTML, JS, CSS, images) and
// never touches /api/*. Identity must always be live, because a cached
// "authenticated" answer would be a stale security decision. API requests are
// not intercepted at all, so an offline fetch fails exactly as it would
// without a worker, and the app treats that failure as "offline", not as
// "signed out".
//
// SHELL_VERSION supersedes the Cache-Control: no-store freshness story for
// these assets. Bump it in the same commit as any change to the precached
// files: a new version installs alongside the old, then activate() drops
// every other cache and claims open clients, so a reload after reconnect
// always lands on the new shell.
const SHELL_VERSION = "fso-shell-v2";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/src/app.js",
  "/src/storage.js",
  "/src/styles.css",
  "/docs/IMG-20260528-WA0025.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_VERSION);
      // Individually, so one missing optional asset cannot fail the whole
      // install and leave the app with no offline shell at all.
      await Promise.all(
        SHELL_ASSETS.map(async (asset) => {
          try {
            await cache.add(new Request(asset, { cache: "reload" }));
          } catch (error) {
            console.warn("shell precache skipped", asset, error);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== SHELL_VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache or serve API traffic. Identity answers must be live, and a
  // cached one would let a revoked session keep unlocking the UI.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      // Network-first so a deployed update is picked up as soon as the device
      // is online, with the cache as the offline fallback.
      try {
        const response = await fetch(request);
        if (response && response.ok && response.type === "basic") {
          const cache = await caches.open(SHELL_VERSION);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        // A navigation to any route falls back to the shell, so a deep link
        // opened offline still boots the app rather than showing a browser
        // error page.
        if (request.mode === "navigate") {
          const shell = await caches.match("/index.html");
          if (shell) return shell;
        }
        throw error;
      }
    })(),
  );
});
