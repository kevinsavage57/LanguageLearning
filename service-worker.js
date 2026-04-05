// service-worker.js
// Caches all app files so the game works offline after first load.

const CACHE_NAME = "langgame-v3";

const FILES_TO_CACHE = [
  "./index.html",
  "./style.css",
  "./app_main.js",
  "./lang_es.js",
  "./lang_it.js",
  "./englishConjugation_v2.js",
  "./conjugationPatterns_es.js",
  "./conjugationPatterns_it.js",
  "./words_es.json",
  "./words_it.json",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// On install: cache everything
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
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

// On fetch: serve from cache, fall back to network
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
