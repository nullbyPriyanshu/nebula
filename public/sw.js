// Nebula's service worker: keeps the app itself available offline. It never
// touches Google's APIs (other origins pass straight through), so files and
// logins are not cached here; the file list lives in IndexedDB.
const CACHE = "nebula-v1";
const PAGES = ["/", "/accounts/", "/analytics/", "/trash/", "/settings/", "/privacy/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PAGES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Fetch and keep a copy; fall back to the copy when offline.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);

  try {
    const response = await fetch(request);

    if (response.ok) cache.put(request, response.clone());

    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });

    if (cached) return cached;
    if (request.mode === "navigate") return (await cache.match("/")) ?? Response.error();

    throw error;
  }
}

// Build files have content hashes in their names, so a cached copy never goes stale.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  if (cached) return cached;

  const response = await fetch(request);

  if (response.ok) cache.put(request, response.clone());

  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    url.pathname.startsWith("/_next/static/") ? cacheFirst(request) : networkFirst(request),
  );
});
