/* Aether 3D Engine — Service Worker (5.3 PWA).
 * Stratégie : runtime caching.
 * - Navigations : network-first (toujours la dernière version), repli cache.
 * - Assets same-origin (_next, icons, fichiers) : stale-while-revalidate.
 * - Le shell est donc utilisable hors-ligne après la première visite.
 */
const SHELL_CACHE = 'aether-shell-v1';
const ASSET_CACHE = 'aether-assets-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(['/', '/manifest.webmanifest'])).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Ne gère que le même origin (pas les CDN three.js / fonts distantes).
  if (url.origin !== self.location.origin) return;
  // Pas de cache pour les URLs de partage (hash) ni l'API live : navigation standard.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/')))
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
