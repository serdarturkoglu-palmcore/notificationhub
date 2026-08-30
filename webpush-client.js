/**
 * Mobven Notification Hub — jenerik web push istemci kütüphanesi (BrowserPing).
 * Bu dosya sitenin köküne AYNEN kopyalanır; müşteriye özel bilgi (VAPID public key,
 * backend URL, userId) config objesiyle dışarıdan verilir — kod içinde hardcode yok.
 *
 * Kullanım:
 *
 *   <script src="webpush-client.js"></script>
 *   <script>
 *     BrowserPing.init({
 *       vapidPublicKey: "BBqmD8gy...",
 *       registerEndpoint: "https://<function-app>.azurewebsites.net/api/registerInstallation",
 *       swPath: "sw.js",
 *     });
 *
 *     // Login olmadan önce, anonim bir kimlikle abone olmak için:
 *     BrowserPing.subscribeAnonymous();
 *
 *     // Kullanıcı login olduğunda, anonim aboneliği gerçek kimlikle eşleştirmek için:
 *     BrowserPing.identify(userId);
 *   </script>
 *
 * NOT: browserping/service-worker/webpush-client.js dosyasının bu kopyası,
 * anonim-önce-login-sonra-eşleştirme akışı için subscribeAnonymous() ve identify()
 * fonksiyonlarıyla genişletilmiştir. Orijinal subscribe(userId) fonksiyonu da
 * geriye dönük uyumluluk için korunmuştur.
 */
(function (global) {
  let config = null;
  const ANON_ID_STORAGE_KEY = 'browserping_anon_id';

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function bytesEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  async function endpointFingerprint(endpoint) {
    try {
      const data = new TextEncoder().encode(endpoint);
      const digest = await crypto.subtle.digest('SHA-256', data);
      const bytes = new Uint8Array(digest);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 22);
    } catch (e) {
      return endpoint.slice(-24).replace(/[^a-zA-Z0-9]/g, '').slice(0, 22) || 'noid';
    }
  }

  function getOrCreateAnonId() {
    try {
      let id = localStorage.getItem(ANON_ID_STORAGE_KEY);
      if (!id) {
        id = 'anon-' + (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2)));
        localStorage.setItem(ANON_ID_STORAGE_KEY, id);
      }
      return id;
    } catch (e) {
      // localStorage yoksa (gizli sekme vs.) oturum boyunca sabit kalan bir bellek-içi id kullan.
      if (!global.__browserping_anon_id_fallback) {
        global.__browserping_anon_id_fallback = 'anon-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      }
      return global.__browserping_anon_id_fallback;
    }
  }

  async function reuseOrDropExistingSubscription(registration, desiredKeyBytes) {
    const existing = await registration.pushManager.getSubscription();
    if (!existing) return null;

    let sameKey = false;
    try {
      const existingKey = existing.options && existing.options.applicationServerKey;
      if (existingKey) {
        sameKey = bytesEqual(new Uint8Array(existingKey), desiredKeyBytes);
      }
    } catch (e) {
      sameKey = false;
    }

    if (sameKey) return existing;

    try {
      await existing.unsubscribe();
    } catch (e) {
      // yut, subscribe zaten deneyecek
    }
    return null;
  }

  function init(userConfig) {
    if (!userConfig || !userConfig.vapidPublicKey || !userConfig.registerEndpoint) {
      throw new Error('BrowserPing.init: vapidPublicKey ve registerEndpoint zorunlu.');
    }
    config = Object.assign({ swPath: 'sw.js' }, userConfig);
  }

  async function ensureSubscription() {
    if (!config) throw new Error('Önce BrowserPing.init(...) çağrılmalı.');

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { supported: false };
    }

    const registration = await navigator.serviceWorker.register(config.swPath);
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { supported: true, permission };
    }

    const desiredKeyBytes = urlBase64ToUint8Array(config.vapidPublicKey);
    let subscription = await reuseOrDropExistingSubscription(registration, desiredKeyBytes);

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: desiredKeyBytes,
      });
    }

    return { supported: true, permission, subscription };
  }

  async function registerInstallation(userId, subscription) {
    const json = subscription.toJSON();
    const installationId = `${userId}-${await endpointFingerprint(json.endpoint)}`;

    const response = await fetch(config.registerEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installationId,
        userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      }),
    });

    if (!response.ok) {
      throw new Error('Backend kaydı başarısız: ' + response.status);
    }

    return installationId;
  }

  /**
   * Login OLMADAN önce çağrılır. Gerçek bir userId henüz yoktur — bunun yerine
   * tarayıcıda kalıcı (localStorage) bir anonim id üretilir/okunur ve o kimlikle
   * Notification Hub'a abone olunur. Ziyaretçinin login öncesi gezinmeleri bu
   * installationId üzerinden (backend/Dataverse tarafında) izlenebilir.
   */
  async function subscribeAnonymous() {
    const anonId = getOrCreateAnonId();
    const result = await ensureSubscription();
    if (!result.supported || result.permission !== 'granted') {
      return Object.assign({ anonId }, result);
    }
    const installationId = await registerInstallation(anonId, result.subscription);
    return { supported: true, permission: result.permission, registered: true, anonId, installationId };
  }

  /**
   * Login OLDUKTAN sonra çağrılır. t=0 anında anonim id ile gerçek userId'yi
   * eşleştirmek için backend'e bildirir (registerEndpoint'e userId + anonId
   * birlikte gönderilir; backend/Dataverse tarafında bu eşleştirmeyi Journey
   * "customer trigger" akışına bağlayacak alan/iş mantığı ayrıca kurulmalı).
   * Aynı zamanda aboneliği doğrudan gerçek userId ile de kaydeder ki push'lar
   * artık login olan kişiye gitsin.
   */
  async function identify(userId) {
    if (!userId) throw new Error('identify(userId): userId zorunlu.');
    const anonId = getOrCreateAnonId();
    const result = await ensureSubscription();
    if (!result.supported || result.permission !== 'granted') {
      return Object.assign({ anonId, userId }, result);
    }
    const installationId = await registerInstallation(userId, result.subscription);

    // Anonim -> gerçek kimlik eşleştirmesini backend'e ayrıca bildir.
    try {
      await fetch(config.registerEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkAnonToUser: true, anonId, userId, installationId }),
      });
    } catch (e) {
      // Eşleştirme çağrısı başarısız olsa bile ana abonelik kaydı zaten yapıldı.
    }

    return { supported: true, permission: result.permission, registered: true, anonId, userId, installationId };
  }

  /** Geriye dönük uyumluluk: doğrudan bilinen bir userId ile abone olma. */
  async function subscribe(userId) {
    if (!userId) throw new Error('subscribe(userId): userId zorunlu.');
    const result = await ensureSubscription();
    if (!result.supported || result.permission !== 'granted') {
      return result;
    }
    const installationId = await registerInstallation(userId, result.subscription);
    return { supported: true, permission: result.permission, registered: true, installationId };
  }

  async function unsubscribe() {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (!existing) return { supported: true, wasSubscribed: false };
    await existing.unsubscribe();
    return { supported: true, wasSubscribed: true, unsubscribed: true };
  }

  global.BrowserPing = { init, subscribe, subscribeAnonymous, identify, unsubscribe };
})(window);
