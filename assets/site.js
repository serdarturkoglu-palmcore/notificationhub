(function (global) {
  const VAPID_PUBLIC_KEY = "BHjzvzgEEaqyoka-PdMGo0NgqEXYK7MZ83EW4vQsz1myQFbYdkXai9aOv2mpK-hVmbwad2Q1nrPabNBbcuj3fD4";
  const REGISTER_ENDPOINT = "https://browserping-prod-func.azurewebsites.net/api/registerInstallation";

  const USER_KEY = 'noalie_user';
  const INTERESTS_KEY = 'noalie_interests';
  const PUSH_KEY = 'noalie_push_enabled';
  const CART_KEY = 'noalie_cart';

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

  // ---- Sepet -----------------------------------------------------------
  // Satır anahtarı productId+size kombinasyonu: aynı ürünün farklı bedenleri
  // ayrı satır, aynı beden tekrar eklenirse miktar artar.
  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveCart(cart) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
  }
  function addToCart(productId, size, qty) {
    qty = qty || 1;
    const cart = getCart();
    const line = cart.find(function (l) { return l.productId === productId && l.size === size; });
    if (line) { line.qty += qty; } else { cart.push({ productId: productId, size: size, qty: qty }); }
    saveCart(cart);
    return cart;
  }
  function updateCartQty(productId, size, qty) {
    let cart = getCart();
    if (qty <= 0) {
      cart = cart.filter(function (l) { return !(l.productId === productId && l.size === size); });
    } else {
      const line = cart.find(function (l) { return l.productId === productId && l.size === size; });
      if (line) line.qty = qty;
    }
    saveCart(cart);
    return cart;
  }
  function removeFromCart(productId, size) {
    return updateCartQty(productId, size, 0);
  }
  function clearCart() {
    saveCart([]);
  }
  function getCartLines() {
    return getCart().map(function (l) {
      const product = getProduct(l.productId);
      return product ? { product: product, size: l.size, qty: l.qty, lineTotal: product.price * l.qty } : null;
    }).filter(Boolean);
  }
  function getCartCount() {
    return getCart().reduce(function (sum, l) { return sum + l.qty; }, 0);
  }
  function getCartTotal() {
    return getCartLines().reduce(function (sum, l) { return sum + l.lineTotal; }, 0);
  }
  function refreshCartBadge() {
    const el = document.getElementById('cart-count');
    if (!el) return;
    const count = getCartCount();
    el.textContent = count;
    el.style.display = count > 0 ? '' : 'none';
  }

  // Sepet her degistiginde (ekleme/cikarma/miktar) Pulse'a GUNCEL anlik
  // goruntuyu gonderir - bkz. Pulse.trackCart yorumu (pulse-client.js).
  function pushCartToPulse(lastProduct) {
    if (!window.Pulse) return;
    Pulse.trackCart({
      itemCount: getCartCount(),
      cartValue: getCartTotal(),
      lastProductId: lastProduct ? lastProduct.id : undefined,
      lastProductName: lastProduct ? (lastProduct.name + ' (' + lastProduct.color + ')') : undefined,
    });
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
  // 2026-09-23: KOK SEBEP BULUNDU (portal-deploy/index.html'deki eski Noalie
  // Sigorta sitesinde zaten cozulmustu, bkz. commit 5b2a37b): custom trigger
  // event'leri window["MSCI"] (WebTracking.bundle.js - SADECE web izleme icin)
  // uzerinden DEGIL, ayri bir SDK olan window["msdynmkt"] (msei-0.js) uzerinden
  // gonderilmeli. MSCI ile gonderilirse event CI'a ulasir (trigger "Tumlestirildi"
  // olur) ama journey kisiyi cozemez ve YOLCULUK HIC BASLAMAZ - tam da bizim
  // yasadigimiz "Giris: 0" sorunu. window["msdynmkt"] script'i her sayfanin
  // <head>'ine ayrica eklendi.
  function trackUrunIlgisi(product, rootPath) {
    try {
      if (!global.msdynmkt) {
        console.warn('[Noalie] msdynmkt (custom trigger) SDK bulunamadı, trigger gönderilemedi.');
        return;
      }
      const user = getUser();
      if (user && user.email) {
        console.log('[Noalie] Giriş yapılmış kullanıcı bulundu. msdynmkt.setUser({ authId: ... }) çağrılıyor. authId (email):', user.email);
        global.msdynmkt.setUser({ authId: user.email });
      } else {
        console.warn('[Noalie] GİRİŞ YAPILMAMIŞ! msdynmkt.setUser() çağrılmadı -> trigger anonim gidecek ve Dataverse\'teki hiçbir İlgili Kişi ile eşleşmeyecek. Önce /giris/ sayfasından, Dataverse\'te KAYITLI (emailaddress1 alanı dolu) bir İlgili Kişi kaydının e-postasıyla giriş yapın, sonra tekrar deneyin.');
      }
      const urunAdiVal = product.name + ' (' + product.color + ')';
      const urunIdVal = product.id;
      // NOT (2026-09-23): rootPath goreli bir yol ("../../" gibi), location.origin ile
      // duz birlestirmek "https://host../../urun/..." gibi GECERSIZ bir URL uretiyordu.
      // URL() ile mevcut sayfaya gore cozerek dogru mutlak adresi elde ediyoruz.
      const urunUrlVal = new global.URL(rootPath + 'urun/' + product.id + '/', global.location.href).href;
      // 2026-09-23: Eski trigger (msdynmkt_a9f059d4da904da18b8ece49a8ae2827) silindi,
      // "Customer data" ozniteligi CI-Data profile'a bagliydi (Contact'a degil) -> journey
      // hicbir zaman tetiklenmiyordu. Yerine "BrowserPing Product Notification Trigger"
      // olusturuldu, Customer data = Ilgili Kisi (Contact). Oznitelikler lowercase
      // (urunadi/urunid/urunurl/bindingid) olarak tanimlandi, PascalCase kopyalarina artik
      // gerek yok.
      // KRITIK (bkz. portal-deploy/index.html, Noalie Sigorta sitesinde daha once
      // bulunmus Microsoft "known issue"): bir custom trigger ozniteligine BOS
      // ("") deger gonderilirse CI event'i SESSIZCE REDDEDER - konsolda hicbir
      // hata cikmaz, trigger yine de "Tumlestirildi" gorunur ama journey'e giris
      // hic olmaz. bindingid'i asla bos gonderme, her zaman dolu bir deger ver.
      const bindingIdVal = 'urun/' + urunIdVal;
      const payload = {
        name: 'msdynmkt_browserpingproductnotificationtrigger_073932189',
        ingestionKey: '9109cd3cfc884abdb8026d0442d43c74-54f97fce-fe77-44f7-bf06-0e27cea05760-7501',
        version: '1.0.0',
        properties: {
          urunadi: urunAdiVal,
          urunid: urunIdVal,
          urunurl: urunUrlVal,
          bindingid: bindingIdVal,
        },
      };
      console.log('[Noalie] trackEvent gönderiliyor. authId gönderildi mi:', !!(user && user.email), 'payload:', payload);
      global.msdynmkt.trackEvent(payload);
      console.log('[Noalie] trackEvent gönderildi.');

      // Dataverse'in bu contact icin push/ilgi bilgisinden haberi olmasi icin
      // (registerInstallation SADECE Notification Hub'a yazar, Dataverse'e hic
      // dokunmaz) - browserping-bridge-func adli AYRI, yeni bir Function App'e
      // (browserping-prod-func'a dokunulmadi) bu bilgiyi bildiriyoruz.
      if (user && user.email) {
        fetch('https://browserping-bridge-func.azurewebsites.net/api/updateContactInterest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            productId: product.id,
            productName: product.name + ' (' + product.color + ')',
          }),
        })
          .then(function (r) {
            console.log('[Noalie] updateContactInterest (Dataverse yazma) sonucu:', r.status);
          })
          .catch(function (e) {
            console.warn('[Noalie] updateContactInterest cagrisi basarisiz (kritik degil):', e);
          });
      }
    } catch (e) {
      console.error('[Noalie] trackUrunIlgisi hata:', e);
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

    const cartCount = getCartCount();
    const cartHtml =
      '<a href="' + rootPath + 'sepet/" class="cart-link">Sepet' +
        '<span id="cart-count" class="cart-count" style="display:' + (cartCount > 0 ? '' : 'none') + ';">' + cartCount + '</span>' +
      '</a>';

    el.innerHTML =
      '<div class="logo"><a href="' + rootPath + '">Noalie</a></div>' +
      '<nav class="site">' + nav + '</nav>' +
      '<div class="account-area">' + cartHtml + accountHtml + '</div>';

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
    el.innerHTML = 'Noalie — iç test ortamı. Bu sayfa yalnızca entegrasyon testleri içindir.';
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
    const sizesHtml = p.sizes.map(function (s, i) {
      return '<button type="button" class="size-btn' + (i === 0 ? ' selected' : '') + '" data-size="' + s + '">' + s + '</button>';
    }).join('');

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
      const selectedBtn = el.querySelector('.size-btn.selected');
      const size = selectedBtn ? selectedBtn.getAttribute('data-size') : p.sizes[0];
      addToCart(p.id, size, 1);
      refreshCartBadge();
      pushCartToPulse(p);

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

  function cartLineHtml(rootPath, line) {
    const p = line.product;
    return (
      '<div class="cart-line" data-product-id="' + p.id + '" data-size="' + line.size + '">' +
        '<a class="swatch-link" href="' + rootPath + 'urun/' + p.id + '/"><div class="swatch cart-swatch"><span class="swatch-label">Ürün Görseli</span></div></a>' +
        '<div class="cart-line-body">' +
          '<h3><a href="' + rootPath + 'urun/' + p.id + '/">' + p.name + '</a></h3>' +
          '<div class="meta">' + p.color + ' · Beden: ' + line.size + '</div>' +
          '<div class="price-now">' + formatPrice(p.price) + '</div>' +
        '</div>' +
        '<div class="cart-line-qty">' +
          '<button type="button" class="qty-btn" data-action="dec">−</button>' +
          '<span class="qty-value">' + line.qty + '</span>' +
          '<button type="button" class="qty-btn" data-action="inc">+</button>' +
        '</div>' +
        '<div class="cart-line-total">' + formatPrice(line.lineTotal) + '</div>' +
        '<button type="button" class="cart-line-remove" title="Kaldır">×</button>' +
      '</div>'
    );
  }

  function renderCartPage(containerId, rootPath) {
    const el = document.getElementById(containerId);
    if (!el) return;

    function paint() {
      const lines = getCartLines();
      if (lines.length === 0) {
        el.innerHTML =
          '<div class="panel"><h2>Sepetiniz boş</h2>' +
          '<p class="desc">Alışverişe devam etmek için <a href="' + rootPath + '">ürünlere</a> göz atın.</p></div>';
        refreshCartBadge();
        return;
      }

      el.innerHTML =
        '<div class="cart-lines">' + lines.map(function (l) { return cartLineHtml(rootPath, l); }).join('') + '</div>' +
        '<div class="cart-summary">' +
          '<div class="cart-summary-total"><span>Toplam</span><span>' + formatPrice(getCartTotal()) + '</span></div>' +
          '<button type="button" class="pill-btn filled" id="btn-checkout">Siparişi Tamamla</button>' +
          '<div id="checkout-status" class="status-pill" style="margin-top:10px; display:none;"></div>' +
        '</div>';

      el.querySelectorAll('.cart-line').forEach(function (lineEl) {
        const productId = lineEl.getAttribute('data-product-id');
        const size = lineEl.getAttribute('data-size');

        lineEl.querySelector('[data-action="inc"]').addEventListener('click', function () {
          const current = getCart().find(function (l) { return l.productId === productId && l.size === size; });
          updateCartQty(productId, size, (current ? current.qty : 0) + 1);
          pushCartToPulse(getProduct(productId));
          paint();
        });
        lineEl.querySelector('[data-action="dec"]').addEventListener('click', function () {
          const current = getCart().find(function (l) { return l.productId === productId && l.size === size; });
          updateCartQty(productId, size, (current ? current.qty : 1) - 1);
          pushCartToPulse(getProduct(productId));
          paint();
        });
        lineEl.querySelector('.cart-line-remove').addEventListener('click', function () {
          removeFromCart(productId, size);
          pushCartToPulse(getProduct(productId));
          paint();
        });
      });

      document.getElementById('btn-checkout').addEventListener('click', function () {
        const orderNo = 'NOA-' + Date.now().toString(36).toUpperCase();
        const orderValue = getCartTotal();
        if (window.Pulse) Pulse.trackPurchase({ orderId: orderNo, orderValue: orderValue });
        clearCart();
        el.innerHTML =
          '<div class="panel"><h2>Siparişiniz alındı</h2>' +
          '<p class="desc">Sipariş numaranız: <strong>' + orderNo + '</strong>. Bu bir test mağazasıdır, gerçek bir ödeme alınmamıştır.</p>' +
          '<a class="pill-btn" href="' + rootPath + '">Alışverişe devam et</a></div>';
        refreshCartBadge();
      });

      refreshCartBadge();
    }

    paint();
  }

  global.NoalieSite = {
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
    getCart: getCart,
    addToCart: addToCart,
    updateCartQty: updateCartQty,
    removeFromCart: removeFromCart,
    clearCart: clearCart,
    getCartLines: getCartLines,
    getCartCount: getCartCount,
    getCartTotal: getCartTotal,
    refreshCartBadge: refreshCartBadge,
    initPush: initPush,
    requestPush: requestPush,
    formatPrice: formatPrice,
    renderHeader: renderHeader,
    renderFooter: renderFooter,
    renderProductGrid: renderProductGrid,
    renderProductDetail: renderProductDetail,
    renderCartPage: renderCartPage,
    productCardHtml: productCardHtml,
    trackUrunIlgisi: trackUrunIlgisi,
  };
})(window);
