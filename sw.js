// Service Worker fürs Punktetagebuch.
// Ziel: nach dem ersten Laden startet die App auch bei schwachem/fehlendem
// Netz (React/Babel/Chart.js/Quagga liegen dann schon im Cache), und die
// eigentliche index.html wird bei vorhandenem Netz trotzdem immer aktuell
// nachgeladen, damit Updates sofort ankommen.

// Bei Änderungen an APP_SHELL (z. B. neue CDN-Version) die Zahl hochzählen –
// dann wird der alte Cache beim Aktivieren verworfen und neu befüllt.
const CACHE_NAME = "punktetagebuch-v2";

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

// Darf diese Antwort in den Cache? Teilinhalte (206) und Fehler nicht –
// undurchsichtige Antworten (opaque, z. B. Schriftdateien von gstatic) schon,
// denn genau die braucht die App offline.
function darfGecachtWerden(res) {
  if (!res) return false;
  if (res.status === 206) return false;
  return res.ok || res.type === "opaque";
}

function inCacheLegen(req, res) {
  if (!darfGecachtWerden(res)) return;
  const copy = res.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
}

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

  // index.html und – falls du irgendwann vorkompilierst – app.js sind der
  // eigentliche Programmcode. Beide immer zuerst aus dem Netz, damit ein
  // Update sofort ankommt und nicht in einer alten Cache-Fassung hängen bleibt.
  const isAppShellDoc =
    req.mode === "navigate" ||
    req.url.endsWith("index.html") ||
    req.url.endsWith("app.js") ||
    req.url.endsWith("/");

  if (isAppShellDoc) {
    // Network-first: bei Netz immer die aktuelle Version holen (und
    // gleichzeitig den Cache auffrischen), offline auf den Cache zurückfallen.
    event.respondWith(
      fetch(req)
        .then((res) => {
          inCacheLegen(req, res);
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match("./index.html")))
    );
    return;
  }

  const sameOrigin = new URL(req.url).origin === self.location.origin;

  if (sameOrigin) {
    // Eigene Dateien (Icons, manifest.json): sofort aus dem Cache antworten,
    // im Hintergrund aber trotzdem auffrischen. Sonst bliebe z. B. ein neues
    // App-Icon ewig die alte Fassung.
    event.respondWith(
      caches.match(req).then((cached) => {
        const netz = fetch(req)
          .then((res) => {
            inCacheLegen(req, res);
            return res;
          })
          .catch(() => cached);
        return cached || netz;
      })
    );
    return;
  }

  // Fremde Dateien mit fester Versionsnummer in der Adresse (CDN-Skripte,
  // Schriften): cache-first, die ändern sich unter derselben URL nie.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          inCacheLegen(req, res);
          return res;
        })
        .catch(
          () =>
            // Ohne Netz und ohne Cache: eine saubere Fehlerantwort zurückgeben.
            // Vorher stand hier "undefined", was den Aufruf abbrechen ließ.
            new Response("", { status: 504, statusText: "Offline und nicht im Cache" })
        );
    })
  );
});
