const LEGACY_ORIGIN = 'https://fawxzzy-mazer.vercel.app';
const CANONICAL_ORIGIN = 'https://mazer.fawxzzy.com';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(async (cacheName) => {
      await caches.delete(cacheName);
    }));

    await self.clients.claim();
    const windowClients = await self.clients.matchAll({
      includeUncontrolled: true,
      type: 'window'
    });

    await self.registration.unregister();

    await Promise.all(windowClients.map(async (client) => {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin === LEGACY_ORIGIN) {
        const canonicalUrl = new URL(CANONICAL_ORIGIN);
        canonicalUrl.pathname = clientUrl.pathname;
        canonicalUrl.search = clientUrl.search;
        canonicalUrl.hash = clientUrl.hash;
        await client.navigate(canonicalUrl.href);
        return;
      }

      if (clientUrl.origin === CANONICAL_ORIGIN) {
        await client.navigate(clientUrl.href);
      }
    }));
  })());
});
