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
 *
 * RIZA (KVKK/consent, 2026-09-23 eklendi):
 * Ilk ziyarette, karar verilmemisse bir cerez izni bannerı gosterilir.
 * Karar verilene kadar (ya da "Reddet" secilirse) HICBIR davranissal veri
 * (trackPageView/trackIntent/pageExit) gonderilmez - en guvenli varsayilan.
 * "Kabul Et" secilirse veri toplama normal sekilde baslar/devam eder.
 * NOT: Banner metni JENERIK/ORNEKTIR - gercek bir kurulumda KVKK aydinlatma
 * metni hukuk/uyumluluk surecinden gecmelidir, bu script sadece TEKNIK
 * mekanizmayi (goster/kaydet/kapiyi ac-kapa) saglar.
 */
(function (global) {
  'use strict';

  var COOKIE_NAME = 'pulse_visitor_id';
  var COOKIE_MAX_AGE_DAYS = 365;
  var CONSENT_COOKIE_NAME = 'pulse_consent'; // 'granted' | 'denied'
  var SESSION_ID_KEY = 'pulse_session_id';
  var SESSION_PAGE_INDEX_KEY = 'pulse_page_index';

  var config = { endpoint: null };
  var pageLoadedAt = Date.now();
  var currentPageViewId = null;
  var exitIntentSent = false;
  var pendingTrackPageViewArgs = null; // riza beklenirken kaybolmasin diye

  function uuidv4() {
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
    }
    // Her ziyarette cerezin omrunu tazele (kalici ID'nin "aktif kullanildikca"
    // 1 yil daha uzamasi icin - roadmap'teki "1-2 yil" kararina uygun).
    setCookie(COOKIE_NAME, id, COOKIE_MAX_AGE_DAYS);
    return id;
  }

  function hasConsent() {
    return getCookie(CONSENT_COOKIE_NAME) === 'granted';
  }

  function consentDecided() {
    return getCookie(CONSENT_COOKIE_NAME) !== null;
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

  /**
   * URL'i query string ve hash/fragment olmadan doner (sadece origin+path).
   *
   * NOT (2026-09-23, bulundu): location.href'i oldugu gibi kaydetmek, siteye
   * ozel izleme SDK'larinin (ornegin MSCI/webtracking) URL'e ekledigi
   * "#msdynmkt_trackingcontext=..." gibi rastgele parcalari da beraberinde
   * yaziyordu - ayni sayfa her ziyarette farkli bir "URL" gibi kaydediliyor,
   * bu da LastVisitedUrl/segment kosullarini ("Url contains X") tutarsiz
   * hale getiriyordu. UTM parametreleri zaten ayri alanlarda (utmSource vb.)
   * tutuldugu icin query string'i de atmanin bir dezavantaji yok.
   */
  function cleanUrl() {
    try {
      return global.location.origin + global.location.pathname;
    } catch (e) {
      return global.location.href;
    }
  }

  // ------------------------------------------------------------------
  // Riza bannerı (jenerik gorunum, ornek metin - bkz. dosya basindaki NOT)
  // ------------------------------------------------------------------

  function injectBannerStyles() {
    if (document.getElementById('pulse-consent-style')) return;
    var style = document.createElement('style');
    style.id = 'pulse-consent-style';
    style.textContent =
      '.pulse-consent-banner{position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
      'background:#111;color:#fff;padding:16px 20px;display:flex;gap:16px;' +
      'align-items:center;justify-content:space-between;flex-wrap:wrap;' +
      'font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;}' +
      '.pulse-consent-banner p{margin:0;flex:1 1 320px;}' +
      '.pulse-consent-actions{display:flex;gap:8px;flex:0 0 auto;}' +
      '.pulse-consent-actions button{cursor:pointer;border:none;border-radius:6px;' +
      'padding:8px 16px;font-size:14px;font-weight:600;}' +
      '.pulse-consent-accept{background:#fff;color:#111;}' +
      '.pulse-consent-reject{background:transparent;color:#fff;border:1px solid #666 !important;}';
    document.head.appendChild(style);
  }

  function showConsentBanner() {
    if (document.getElementById('pulse-consent-banner')) return;
    injectBannerStyles();
    var el = document.createElement('div');
    el.id = 'pulse-consent-banner';
    el.className = 'pulse-consent-banner';
    el.innerHTML =
      '<p>Bu site, deneyiminizi kisisellestirmek icin cerezler kullanir. ' +
      'Detaylar icin Gizlilik Politikamiza bakabilirsiniz. ' +
      '<em>(Ornek/jenerik metin - gercek kurulumda hukuk/uyumluluk onayli metinle degistirilmeli.)</em></p>' +
      '<div class="pulse-consent-actions">' +
      '<button type="button" class="pulse-consent-reject">Reddet</button>' +
      '<button type="button" class="pulse-consent-accept">Kabul Et</button>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('.pulse-consent-accept').addEventListener('click', function () {
      onConsentDecision(true);
    });
    el.querySelector('.pulse-consent-reject').addEventListener('click', function () {
      onConsentDecision(false);
    });
  }

  function hideConsentBanner() {
    var el = document.getElementById('pulse-consent-banner');
    if (el) el.parentNode.removeChild(el);
  }

  function onConsentDecision(granted) {
    setCookie(CONSENT_COOKIE_NAME, granted ? 'granted' : 'denied', COOKIE_MAX_AGE_DAYS);
    hideConsentBanner();

    if (config.endpoint) {
      fetch(config.endpoint + '/updateConsent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anonymousId: getOrCreateVisitorId(), granted: granted }),
        keepalive: true,
      }).catch(function (e) {
        console.warn('[Pulse] updateConsent gonderilemedi (kritik degil):', e);
      });
    }

    if (granted && pendingTrackPageViewArgs !== null) {
      var args = pendingTrackPageViewArgs;
      pendingTrackPageViewArgs = null;
      trackPageView(args);
    } else {
      pendingTrackPageViewArgs = null;
    }
  }

  // ------------------------------------------------------------------

  function init(cfg) {
    if (!cfg || !cfg.endpoint) {
      console.warn('[Pulse] init({endpoint}) zorunlu.');
      return;
    }
    config.endpoint = cfg.endpoint.replace(/\/$/, '');
    setupExitIntentDetection();
    setupDurationTracking();
    if (!consentDecided()) showConsentBanner();
  }

  function trackPageView(extra) {
    if (!config.endpoint) {
      console.warn('[Pulse] trackPageView() cagrilmadan once Pulse.init({endpoint}) yapilmali.');
      return;
    }
    if (!consentDecided()) {
      // Karar verilmeden davranissal veri gonderilmiyor - en guvenli
      // varsayilan. Kullanici karar verince (onConsentDecision) bu cagriyi
      // KENDI ARGUMANLARIYLA tekrar tetikleriz, bu sayfanin ziyareti
      // kaybolmaz.
      pendingTrackPageViewArgs = extra || {};
      return;
    }
    if (!hasConsent()) return; // acikca reddetmis - hic veri gonderme.

    var payload = {
      anonymousId: getOrCreateVisitorId(),
      sessionId: getOrCreateSessionId(),
      pageIndexInSession: nextPageIndexInSession(),
      url: cleanUrl(),
      category: (extra && extra.category) || undefined,
      referrer: document.referrer || undefined,
      utmSource: getUtmParam('utm_source'),
      utmMedium: getUtmParam('utm_medium'),
      utmCampaign: getUtmParam('utm_campaign'),
      language: navigator.language || undefined,
      screenResolution: screen && screen.width ? screen.width + 'x' + screen.height : undefined,
    };
    pageLoadedAt = Date.now();
    currentPageViewId = null;
    exitIntentSent = false;

    // fire-and-forget - sayfa yuklemesini hicbir sekilde bloklamaz/geciktirmez.
    fetch(config.endpoint + '/trackPageView', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        // pageExit (asagida) bu sayfanin PageView satirini bulabilsin diye
        // ID'yi sakliyoruz.
        if (data && data.pageViewId) currentPageViewId = data.pageViewId;
      })
      .catch(function (e) {
        console.warn('[Pulse] trackPageView gonderilemedi (kritik degil):', e);
      });
  }

  /**
   * Genel amacli niyet sinyali - bkz. backend'deki SIGNAL_FIELD_MAP.
   *
   * NOT (2026-09-23, bulundu): navigator.sendBeacon + Blob(application/json)
   * cross-origin bir istekte CORS on-kontrolu (preflight) gerektiriyor ama
   * sendBeacon bunu duzgun desteklemiyor - istek SESSIZCE hic gitmiyor,
   * hata da vermiyor (bkz. trackPageView'in App Insights'ta 200 donup
   * pageExit/trackIntent'in HIC gorunmemesi). Bu yuzden fetch+keepalive
   * kullaniliyor - trackPageView'de zaten calistigi kanitlandi.
   */
  function trackIntent(signal) {
    if (!config.endpoint || !hasConsent()) return;
    fetch(config.endpoint + '/trackIntent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anonymousId: getOrCreateVisitorId(), signal: signal }),
      keepalive: true,
    }).catch(function (e) {
      console.warn('[Pulse] trackIntent gonderilemedi (kritik degil):', e);
    });
  }

  /** Fare ust kenara (kapatma/sekme degistirme niyeti) yaklasinca bir kez tetiklenir. */
  function setupExitIntentDetection() {
    document.addEventListener('mouseout', function (e) {
      if (exitIntentSent || !hasConsent()) return;
      if (e.clientY <= 0 && !e.relatedTarget) {
        exitIntentSent = true;
        trackIntent('exit_intent');
      }
    });
  }

  /**
   * Sayfada gecirilen sureyi, sayfa kapanirken/degisirken bildirir.
   *
   * NOT: sendBeacon YERINE fetch+keepalive kullaniliyor - cross-origin +
   * JSON Blob kombinasyonunda sendBeacon'in CORS preflight'i duzgun
   * desteklememesi yuzunden istek sessizce hic gitmiyordu (bkz. trackIntent
   * ustundeki not). fetch+keepalive, "pagehide" sirasinda bile modern
   * tarayicilarda (Chrome/Edge/Firefox) guvenilir sekilde tamamlaniyor.
   */
  function setupDurationTracking() {
    function sendDuration() {
      if (!config.endpoint || !currentPageViewId || !hasConsent()) return;
      var durationSeconds = Math.round((Date.now() - pageLoadedAt) / 1000);
      fetch(config.endpoint + '/pageExit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anonymousId: getOrCreateVisitorId(),
          pageViewId: currentPageViewId,
          durationSeconds: durationSeconds,
        }),
        keepalive: true,
      }).catch(function () {});
    }
    // "pagehide", hem sekme kapatmada hem ic navigasyonda tetiklenir -
    // "beforeunload"dan daha guvenilir (bkz. MDN Page Lifecycle API).
    global.addEventListener('pagehide', sendDuration);
  }

  function identify(email) {
    if (!config.endpoint) {
      console.warn('[Pulse] identify() cagrilmadan once Pulse.init({endpoint}) yapilmali.');
      return;
    }
    if (!email || !hasConsent()) return;
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
    trackIntent: trackIntent,
  };
})(window);
