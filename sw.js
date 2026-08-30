// Mobven Notification Hub — jenerik service worker (BrowserPing).
// Sitenin köküne AYNEN kopyalanır, müşteriye özel hiçbir bilgi içermez.
// Push mesajının içeriği (başlık/gövde/ikon) tamamen backend'den (Function App -> Notification Hub) gelir.

self.addEventListener('push', function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Bildirim', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Bildirim';
  const options = {
    body: data.body || '',
    icon: data.icon || undefined,
    badge: data.badge || undefined,
    image: data.image || undefined,
    tag: data.tag || undefined,
    requireInteraction: data.requireInteraction === true || data.requireInteraction === 'true',
    data: {
      url: data.url || '/',
      requestId: data.requestId,
      channelDefinitionId: data.channelDefinitionId,
      userId: data.userId,
      trackClickUrl: data.trackClickUrl,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';

  const trackPromise = data.trackClickUrl
    ? fetch(data.trackClickUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: data.requestId,
          channelDefinitionId: data.channelDefinitionId,
          userId: data.userId,
          url: targetUrl,
        }),
      }).catch(() => {})
    : Promise.resolve();

  event.waitUntil(Promise.all([trackPromise, clients.openWindow(targetUrl)]));
});
