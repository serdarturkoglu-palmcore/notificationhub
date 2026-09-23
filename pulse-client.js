/**
 * Pulse — istemci kutuphanesi (calisma adi: pulse-client.js)
 *
 * Musteriye ozel HICBIR bilgi icermez, jenerik olarak her siteye kopyalanir.
 * Kullanim (BrowserPing'in WebPushApp.init() deseniyle AYNI ruhta):
 *
 *   <script src="pulse-client.js"></script>
 *   <script>
 *     Pulse.init({ endpoint: "https://pulse-prod-func.azurewebsites.net/api" });
 *     Pulse.trackPageView({ category: "urun" }); // her sayfada, sayfaya ozel category ile cagir
 *     // login basarili olduktan sonra:
 *     Pulse.identify("kullanici@ornek.com");
 *   </script>
 *
 * Kalici kimlik: birinci taraf cerez (pulse_visitor_id), 1 yil.
 * Oturum kimligi: sessionStorage (pulse_session_id + pulse_page_index),
 * tarayici sekmesi/oturumu kapaninca sifirlanir.
 */
(function (global) {
  'use strict';

  var COOKIE_NAME = 'pulse_visitor_id';
  var COOKIE_MAX_AGE_DAYS = 365;
  var SESSION_ID_KEY = 'pulse_session_id';
  var SESSION_PAGE_INDEX_KEY = 'pulse_page_index';

  var config = { endpoint: null };

  function uuidv4() {
    // crypto.randomUUID varsa onu kullan, yoksa basit bir fallback.
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    // Sadece kendi domain'imizden yazilan BIRINCI TARAF cerez - ucuncu taraf
    // cerez kisitlamalarindan (Safari ITP vb.) etkilenmez.
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  function getOrCreateVisitorId() {
    var id = getCookie(COOKIE_NAME);
    if (!id) {
      id = uuidv4();
      setCookie(COOKIE_NAME, id, COOKIE_MAX_AGE_DAYS);
    } else {
      // Her ziyarette cerezin omrunu tazele (kalici ID'nin "aktif kullanildikca"
      // 1 yil daha uzamasi icin - roadmap'teki "1-2 yil" kararina uygun).
      setCookie(COOKIE_NAME, id, COOKIE_MAX_AGE_DAYS);
    }
    return id;
  }

  function getOrCreateSessionId() {
    try {
      var id = sessionStorage.getItem(SESSION_ID_KEY);
      if (!id) {
        id = uuidv4();
        sessionStorage.setItem(SESSION_ID_KEY, id);
        sessionStorage.setItem(SESSION_PAGE_INDEX_KEY, '0');
      }
      return id;
    } catch (e) {
      // sessionStorage kapali/erisilemez (ornegin bazi gizli mod durumlari) -
      // oturum takibi olmadan devam et, kalici ID yine calisir.
      return uuidv4();
    }
  }

  function nextPageIndexInSession() {
    try {
      var idx = parseInt(sessionStorage.getItem(SESSION_PAGE_INDEX_KEY) || '0', 10) + 1;
      sessionStorage.setItem(SESSION_PAGE_INDEX_KEY, String(idx));
      return idx;
    } catch (e) {
      return 1;
    }
  }

  function getUtmParam(name) {
    try {
      return new URLSearchParams(global.location.search).get(name) || undefined;
    } catch (e) {
      return undefined;
    }
  }

  function init(cfg) {
    if (!cfg || !cfg.endpoint) {
      console.warn('[Pulse] init({endpoint}) zorunlu.');
      return;
    }
    config.endpoint = cfg.endpoint.replace(/\/$/, '');
  }

  function trackPageView(extra) {
    if (!config.endpoint) {
      console.warn('[Pulse] trackPageView() cagrilmadan once Pulse.init({endpoint}) yapilmali.');
      return;
    }
    var payload = {
      anonymousId: getOrCreateVisitorId(),
      sessionId: getOrCreateSessionId(),
      pageIndexInSession: nextPageIndexInSession(),
      url: global.location.href,
      category: (extra && extra.category) || undefined,
      referrer: document.referrer || undefined,
      utmSource: getUtmParam('utm_source'),
      utmMedium: getUtmParam('utm_medium'),
      utmCampaign: getUtmParam('utm_campaign'),
      language: navigator.language || undefined,
      screenResolution: screen && screen.width ? screen.width + 'x' + screen.height : undefined,
    };
    // fire-and-forget - sayfa yuklemesini hicbir sekilde bloklamaz/geciktirmez.
    fetch(config.endpoint + '/trackPageView', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(function (e) {
      console.warn('[Pulse] trackPageView gonderilemedi (kritik degil):', e);
    });
  }

  function identify(email) {
    if (!config.endpoint) {
      console.warn('[Pulse] identify() cagrilmadan once Pulse.init({endpoint}) yapilmali.');
      return;
    }
    if (!email) return;
    fetch(config.endpoint + '/identifyVisitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anonymousId: getOrCreateVisitorId(), email: email }),
      keepalive: true,
    }).catch(function (e) {
      console.warn('[Pulse] identify gonderilemedi (kritik degil):', e);
    });
  }

  global.Pulse = {
    init: init,
    trackPageView: trackPageView,
    identify: identify,
  };
})(window);
