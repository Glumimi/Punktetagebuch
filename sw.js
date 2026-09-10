// Service Worker fürs Punktetagebuch.
// Ziel: nach dem ersten Laden startet die App auch bei schwachem/fehlendem
// Netz (React/Babel/Chart.js/Quagga liegen dann schon im Cache), und die
// eigentliche index.html wird bei vorhandenem Netz trotzdem immer aktuell
// nachgeladen, damit Updates sofort ankommen.

const CACHE_NAME = "punktetagebuch-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&family=Quicksand:wght@500;600;700&family=Nunito+Sans:wght@400;600;700&family=Fredoka:wght@500;600;700&family=Mulish:wght@400;600;700&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Jede Datei einzeln versuchen – schlägt eine fehl (z. B. kurzzeitig
      // kein Netz beim Erstbesuch), soll das nicht die ganze Installation
      // kippen.
      Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const isAppShellDoc = req.mode === "navigate" || req.url.endsWith("index.html") || req.url.endsWith("/");

  if (isAppShellDoc) {
    // Network-first: bei Netz immer die aktuelle Version holen (und
    // gleichzeitig den Cache auffrischen), offline auf den Cache zurückfallen.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match("./index.html")))
    );
    return;
  }

  // Alles andere (CDN-Skripte, Google Fonts, Icons): cache-first, damit
  // die App nach dem ersten Laden auch offline startet.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});
