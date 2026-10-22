/* =========================================================
   DZair Carrosse — service worker
   =========================================================
   Rôle : mettre en cache la "coquille" de l'app (HTML/CSS/JS/icônes) pour
   un démarrage rapide et un minimum de contenu hors-ligne. Ne met JAMAIS
   en cache les données (API /api/*) ni les photos (/uploads/*) : ce sont
   des données vivantes, les servir depuis un cache périmé serait pire
   qu'une erreur réseau normale (fausses infos affichées à l'utilisateur).

   Incrémenter CACHE_VERSION à chaque déploiement change le nom du cache,
   ce qui force le renouvellement de la coquille chez les utilisateurs
   (l'ancien cache est supprimé dans l'évènement "activate" ci-dessous).
   ========================================================= */
const CACHE_VERSION = 'v19';
const CACHE_NAME = `dzair-carosse-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/i18n.js',
  '/js/pwa.js',
  '/js/early-lang.js',
  '/js/guard.js',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // On ne gère que le GET same-origin. Tout le reste (API, uploads,
  // polices Google, requêtes POST/PUT/DELETE...) part directement au
  // réseau, sans passer par le cache.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  // Navigation (chargement/rechargement d'une page) : réseau en priorité
  // pour avoir la dernière version, avec repli sur la coquille en cache si
  // hors-ligne (l'app, en SPA, se recharge ensuite côté client).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Code de l'app (JS/CSS) : réseau d'abord, pour qu'un nouveau déploiement soit
  // visible dès la première actualisation ; le cache ne sert que hors-ligne.
  if (/\.(js|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Autres ressources statiques (icônes...) : cache d'abord (rapide),
  // avec une mise à jour silencieuse en arrière-plan (stale-while-revalidate).
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
