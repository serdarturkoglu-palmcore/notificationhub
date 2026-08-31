(function (global) {
  const VAPID_PUBLIC_KEY = "BHjzvzgEEaqyoka-PdMGo0NgqEXYK7MZ83EW4vQsz1myQFbYdkXai9aOv2mpK-hVmbwad2Q1nrPabNBbcuj3fD4";
  const REGISTER_ENDPOINT = "https://browserping-prod-func.azurewebsites.net/api/registerInstallation";

  const USER_KEY = 'mobven_user';
  const INTERESTS_KEY = 'mobven_interests';
  const PUSH_KEY = 'mobven_push_enabled';

  const CATALOG = [
    { id: 'yun-palto-camel', name: 'Yün Karışımlı Palto', color: 'Camel', price: 2450, oldPrice: null, category: 'kadin', badge: null, sizes: ['S', 'M', 'L', 'XL'] },
    { id: 'triko-kazak-yesil', name: 'Triko Kazak', color: 'Zeytin Yeşili', price: 890, oldPrice: 1190, category: 'kadin', badge: 'indirim', sizes: ['XS', 'S', 'M', 'L'] },
    { id: 'triko-elbise-siyah', name: 'Triko Elbise', color: 'Siyah', price: 1350, oldPrice: null, category: 'kadin', badge: 'yeni', sizes: ['S', 'M', 'L'] },
    { id: 'keten-gomlek-ekru', name: 'Keten Gömlek', color: 'Ekru', price: 720, oldPrice: null, category: 'erkek', badge: 'yeni', sizes: ['S', 'M', 'L', 'XL'] },
    { id: 'yun-kaban-lacivert', name: 'Yün Kaban', color: 'Lacivert', price: 3200, oldPrice: null, category: 'erkek', badge: null, sizes: ['M', 'L', 'XL', 'XXL'] },
    { id: 'triko-kazak-gri', name: 'Triko Kazak', color: 'Gri Melanj', price: 690, oldPrice: 990, category: 'erkek', badge: 'indirim', sizes: ['S', 'M', 'L', 'XL'] },
  ];

  function getCatalog() { return CATALOG; }
  function getProduct(id) { return CATALOG.find(function (p) { return p.id === id; }); }
  function getByCategory(cat) { return CATALOG.filter(function (p) { return p.category === cat; }); }
  function getByBadge(badge) { return CATALOG.filter(function (p) { return p.badge === badge; }); }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; }
  }
  function setUser(user) {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch (e) {}
  }
  function clearUser() {
    try { localStorage.removeItem(USER_KEY); } catch (e) {}
  }

  function getInterests() {
    try { return JSON.parse(localStorage.getItem(INTERESTS_KEY) || '[]'); } catch (e) { return []; }
  }
  function addInterest(productId) {
    const list = getInterests();
    if (list.indexOf(productId) === -1) {
      list.push(productId);
      try { localStorage.setItem(INTERESTS_KEY, JSON.stringify(list)); } catch (e) {}
    }
  }

  function getPushEnabled() {
    try { return localStorage.getItem(PUSH_KEY) === 'true'; } catch (e) { return false; }
  }
  function setPushEnabled(v) {
    try { localStorage.setItem(PUSH_KEY, v ? 'true' : 'false'); } catch (e) {}
  }

  function initPush(rootPath) {
    if (!global.BrowserPing) return;
    global.BrowserPing.init({
      vapidPublicKey: VAPID_PUBLIC_KEY,
      registerEndpoint: REGISTER_ENDPOINT,
      swPath: rootPath + 'sw.js',
    });
  }

  // ---- CI-Journeys custom trigger: "Ürün İlgisi Push Bildirimi" ----------
  // window["MSCI"] taban web tracking SDK'sı sayfaya <script> ile ayrıca
  // eklenmiş olmalı (bkz. her sayfanın <head>'i). Bu fonksiyon sadece
  // trigger'ı, ilgili ürün bilgileriyle tetikler.
  function trackUrunIlgisi(product, rootPath) {
    try {
      if (!global.MSCI) {
        console.warn('[Mobven] MSCI SDK bulunamadı, trigger gönderilemedi.');
        return;
      }
      const user = getUser();
      if (user && user.email) {
        console.log('[Mobven] Giriş yapılmış kullanıcı bulundu. MSCI.setUser({ authId: ... }) çağrılıyor. authId (email):', user.email);
        global.MSCI.setUser({ authId: user.email });
      } else {
        console.warn('[Mobven] GİRİŞ YAPILMAMIŞ! MSCI.setUser() çağrılmadı -> trigger anonim gidecek ve Dataverse\'teki hiçbir İlgili Kişi ile eşleşmeyecek. Önce /giris/ sayfasından, Dataverse\'te KAYITLI (emailaddress1 alanı dolu) bir İlgili Kişi kaydının e-postasıyla giriş yapın, sonra tekrar deneyin.');
      }
      const urunAdiVal = product.name + ' (' + product.color + ')';
      const urunIdVal = product.id;
      const urunUrlVal = global.location.origin + rootPath + 'urun/' + product.id + '/';
      // NOT: CI-Journeys'teki oznitelik adlari "UrunAdi/UrunId/UrunUrl" (PascalCase)
      // olarak tanimlandi. Eslesme case-sensitive olabilecegi icin, olasi tum
      // yazimlari (PascalCase + lowercase) ayni anda gonderiyoruz; boylece hangisi
      // dogruysa o eslesir ve "tanimli oznitelik bos/null geldi" -> journey
      // calismiyor sorunu (Microsoft'un bilinen sorun listesindeki Issue 1) onlenir.
      const payload = {
        name: 'msdynmkt_a9f059d4da904da18b8ece49a8ae2827',
        ingestionKey: '9109cd3cfc884abdb8026d0442d43c74-54f97fce-fe77-44f7-bf06-0e27cea05760-7501',
        version: '1.0.0',
        properties: {
          UrunAdi: urunAdiVal,
          UrunId: urunIdVal,
          UrunUrl: urunUrlVal,
          urunadi: urunAdiVal,
          urunid: urunIdVal,
          urunurl: urunUrlVal,
          bindingid: '',
        },
      };
      console.log('[Mobven] trackEvent gönderiliyor. authId gönderildi mi:', !!(user && user.email), 'payload:', payload);
      global.MSCI.trackEvent(payload);
      console.log('[Mobven] trackEvent gönderildi.');
    } catch (e) {
      console.error('[Mobven] trackUrunIlgisi hata:', e);
    }
  }

  async function requestPush() {
    const user = getUser();
    const result = user
      ? await global.BrowserPing.identify(user.email)
      : await global.BrowserPing.subscribeAnonymous();
    if (result && result.registered) setPushEnabled(true);
    return result;
  }

  function formatPrice(n) {
    return n.toLocaleString('tr-TR') + ' TL';
  }

  function renderHeader(rootPath, activeCategory) {
    const el = document.getElementById('site-header');
    if (!el) return;
    const user = getUser();
    const nav = [
      ['kadin', 'Kadın'], ['erkek', 'Erkek'], ['yeni-sezon', 'Yeni Sezon'], ['indirim', 'İndirim']
    ].map(function (item) {
      const active = activeCategory === item[0] ? ' class="active"' : '';
      return '<a href="' + rootPath + item[0] + '/"' + active + '>' + item[1] + '</a>';
    }).join('');

    const accountHtml = user
      ? '<div class="account-state"><a href="' + rootPath + 'profil/" class="account-link">' + user.adSoyad + '</a><button class="pill-btn" id="btn-logout">Çıkış</button></div>'
      : '<div class="guest-actions"><a href="' + rootPath + 'giris/" class="pill-btn">Giriş Yap</a><a href="' + rootPath + 'uye-ol/" class="pill-btn filled">Üye Ol</a></div>';

    el.innerHTML =
      '<div class="logo"><a href="' + rootPath + '">Mobven</a></div>' +
      '<nav class="site">' + nav + '</nav>' +
      '<div class="account-area">' + accountHtml + '</div>';

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        clearUser();
        window.location.href = rootPath;
      });
    }
  }

  function renderFooter() {
    const el = document.getElementById('site-footer');
    if (!el) return;
    el.innerHTML = 'Mobven — iç test ortamı. Bu sayfa yalnızca entegrasyon testleri içindir.';
  }

  function productCardHtml(rootPath, p) {
    const badgeHtml = p.badge === 'indirim'
      ? '<span class="badge badge-sale">İndirim</span>'
      : p.badge === 'yeni' ? '<span class="badge badge-new">Yeni</span>' : '';
    const priceHtml = p.oldPrice
      ? '<span class="price-old">' + formatPrice(p.oldPrice) + '</span> <span class="price-now">' + formatPrice(p.price) + '</span>'
      : '<span class="price-now">' + formatPrice(p.price) + '</span>';
    return (
      '<div class="product">' +
        '<a class="swatch-link" href="' + rootPath + 'urun/' + p.id + '/">' +
          '<div class="swatch">' + badgeHtml + '<span class="swatch-label">Ürün Görseli</span></div>' +
        '</a>' +
        '<div class="body">' +
          '<h3><a href="' + rootPath + 'urun/' + p.id + '/">' + p.name + '</a></h3>' +
          '<div class="meta">' + p.color + '</div>' +
          '<div class="price">' + priceHtml + '</div>' +
          '<a class="pill-btn detail-btn" href="' + rootPath + 'urun/' + p.id + '/">Ürün Detayı</a>' +
        '</div>' +
      '</div>'
    );
  }

  function renderProductGrid(containerId, products, rootPath) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = products.map(function (p) { return productCardHtml(rootPath, p); }).join('');
  }

  function renderProductDetail(containerId, productId, rootPath) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const p = getProduct(productId);
    if (!p) { el.innerHTML = '<p>Ürün bulunamadı.</p>'; return; }

    addInterest(productId);

    const catLabel = p.category === 'kadin' ? 'Kadın' : 'Erkek';
    const catHref = rootPath + p.category + '/';
    const priceHtml = p.oldPrice
      ? '<span class="price-old">' + formatPrice(p.oldPrice) + '</span> <span class="price-now">' + formatPrice(p.price) + '</span>'
      : '<span class="price-now">' + formatPrice(p.price) + '</span>';
    const sizesHtml = p.sizes.map(function (s) { return '<button type="button" class="size-btn">' + s + '</button>'; }).join('');

    el.innerHTML =
      '<div class="breadcrumb"><a href="' + rootPath + '">Anasayfa</a> / <a href="' + catHref + '">' + catLabel + '</a> / <span>' + p.name + '</span></div>' +
      '<div class="product-detail">' +
        '<div class="swatch large">Ürün Görseli</div>' +
        '<div class="detail-body">' +
          '<h1>' + p.name + '</h1>' +
          '<div class="meta">' + p.color + '</div>' +
          '<div class="price large">' + priceHtml + '</div>' +
          '<div class="sizes"><span class="label">Beden</span><div class="size-list">' + sizesHtml + '</div></div>' +
          '<div class="detail-actions">' +
            '<button type="button" class="pill-btn filled" id="btn-add-cart">Sepete Ekle</button>' +
            '<button type="button" class="pill-btn" id="btn-notify">Stok/Kampanya Bildirimi Al</button>' +
          '</div>' +
          '<div id="notify-status" class="status-pill" style="margin-top:10px; display:none;"></div>' +
          '<div id="cart-toast" class="toast" style="display:none;">Sepete eklendi.</div>' +
        '</div>' +
      '</div>';

    el.querySelectorAll('.size-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        el.querySelectorAll('.size-btn').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
      });
    });

    document.getElementById('btn-add-cart').addEventListener('click', function () {
      const toast = document.getElementById('cart-toast');
      toast.style.display = 'inline-block';
      setTimeout(function () { toast.style.display = 'none'; }, 2200);
    });

    document.getElementById('btn-notify').addEventListener('click', async function () {
      const statusEl = document.getElementById('notify-status');
      statusEl.style.display = 'inline-flex';
      statusEl.textContent = 'İzin isteniyor...';
      statusEl.className = 'status-pill';
      try {
        const result = await requestPush();
        if (result && result.registered) {
          statusEl.textContent = 'Bildirim aktif';
          statusEl.className = 'status-pill ok';
          trackUrunIlgisi(p, rootPath);
        } else if (result && result.permission && result.permission !== 'granted') {
          statusEl.textContent = 'İzin verilmedi';
          statusEl.className = 'status-pill warn';
        } else if (result && result.supported === false) {
          statusEl.textContent = 'Tarayıcı desteklemiyor';
          statusEl.className = 'status-pill warn';
        }
      } catch (e) {
        statusEl.textContent = 'Hata oluştu';
        statusEl.className = 'status-pill warn';
      }
    });
  }

  global.MobvenSite = {
    getCatalog: getCatalog,
    getProduct: getProduct,
    getByCategory: getByCategory,
    getByBadge: getByBadge,
    getUser: getUser,
    setUser: setUser,
    clearUser: clearUser,
    getInterests: getInterests,
    addInterest: addInterest,
    getPushEnabled: getPushEnabled,
    setPushEnabled: setPushEnabled,
    initPush: initPush,
    requestPush: requestPush,
    formatPrice: formatPrice,
    renderHeader: renderHeader,
    renderFooter: renderFooter,
    renderProductGrid: renderProductGrid,
    renderProductDetail: renderProductDetail,
    productCardHtml: productCardHtml,
    trackUrunIlgisi: trackUrunIlgisi,
  };
})(window);
