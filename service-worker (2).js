// service-worker.js
// Network-first for JS/HTML so updates are always picked up immediately.
// Cache-first for large static assets (JSON data, CSS, images).

const CACHE_NAME = "langgame-v5";

const STATIC_ASSETS = [
  "./style.css",
  "./words_es.json",
  "./words_it.json",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

const NETWORK_FIRST = [
  "./index.html",
  "./app_main.js",
  "./lang_es.js",
  "./lang_it.js",
  "./englishConjugation_v2.js",
  "./conjugationPatterns_es.js",
  "./conjugationPatterns_it.js"
];

// On install: pre-cache static assets only
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// On activate: delete old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// On fetch: network-first for JS/HTML, cache-first for static assets
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  const isNetworkFirst = NETWORK_FIRST.some(f => url.pathname.endsWith(f.replace("./", "")));

  if (isNetworkFirst) {
    // Always try network first; fall back to cache if offline
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first for static assets
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
