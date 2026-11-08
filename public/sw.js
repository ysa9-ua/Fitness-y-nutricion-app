/**
 * Service worker de FORMA.
 *
 * Deixa la PWA instalable y funcional sin conexión en iOS, donde no
 * existe ninguna alternativa nativa compilable sin macOS.
 *
 * Estrategias:
 *   - Navegación: red primero, con el index.html cacheado como respaldo.
 *     Así una versión nueva se ve sin esperar y un corte de luz no deja
 *     la app en blanco.
 *   - /assets/*: cache primero. Vite pone hash a los nombres, así que un
 *     archivo con el mismo nombre nunca cambia de contenido.
 *   - Fuentes de Google: stale-while-revalidate en una cache aparte.
 *     Es la petición que hace que la app no sea 100% offline; cachearla
 *     en la primera visita lo arregla.
 *
 * No se registra en la build de Android (vease src/main.tsx): el WebView
 * ya empaqueta los assets, y un cache serviría contenido viejo tras
 * actualizar la app.
 */

const VERSION = 'v2';
const SHELL_CACHE = `forma-shell-${VERSION}`;
const ASSET_CACHE = `forma-assets-${VERSION}`;
const FONT_CACHE = `forma-fonts-${VERSION}`;
const OWN_CACHES = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll es atomico: si un recurso falla no deja un shell a medias.
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('forma-') && !OWN_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const url = new URL(request.url);
  // La navegacion al shell puede caer a index.html. Cualquier otro documento
  // del mismo origen se cachea bajo su propia URL y solo cae a si mismo, para
  // no servir el shell en su lugar.
  const isShell =
    url.pathname === '/' || url.pathname.endsWith('/index.html');
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(isShell ? './index.html' : request, fresh.clone());
    return fresh;
  } catch (error) {
    const cached = isShell
      ? (await cache.match('./index.html')) || (await cache.match('./'))
      : await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  // Las respuestas opacas (cross-origin sin CORS) no se pueden guardar y
  // fetch lanzaria al escribir en cache.
  if (fresh.ok || fresh.type === 'opaque') cache.put(request, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((fresh) => {
      if (fresh.ok || fresh.type === 'opaque') cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});
