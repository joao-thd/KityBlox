/**
 * Nerix runtime - globals used by the default template.
 *
 * Exposes two globals:
 *   - `Nerix`: helpers genéricos (formatação, APIs).
 *   - `Cart`: carrinho local persistido em localStorage.
 *
 * Este runtime é mantido simples; cada método faz o mínimo necessário pra
 * home/checkout rodar sem quebrar. APIs remotas (OTP, afiliado, checkout...)
 * chamam `/api/shop/*` e devolvem o que o backend responder - quando essas
 * rotas não existirem ainda, a UI mostra o erro via toast.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ base URL
  var shopBase = (window.NERIX && window.NERIX.baseUrl) || window.location.origin;
  var storeParam = (window.NERIX && window.NERIX.storeParam) || '';

  /**
   * Monta URL da API. Paths começando com `/api` NÃO levam o prefixo de loja
   * (`/shop`) do dev — vão direto pro `localhost:5173/api/...` e o Vite
   * proxya pro backend.
   */
  function apiUrl(path, extra) {
    var isApi = path.indexOf('/api') === 0;
    var base = isApi ? window.location.origin : shopBase;
    var url = base + path;
    if (storeParam) url += (url.indexOf('?') === -1 ? '?' : '&') + 'store=' + encodeURIComponent(storeParam);
    if (extra) url += (url.indexOf('?') === -1 ? '?' : '&') + extra;
    return url;
  }

  function readTurnstileToken() {
    try {
      var el = document.querySelector(
        'input[name="cf-turnstile-response"], input[name="turnstile_token"], textarea[name="cf-turnstile-response"]'
      );
      return el && el.value ? String(el.value) : '';
    } catch (e) {
      return '';
    }
  }

  async function postJson(path, body) {
    var payload = body && typeof body === 'object' ? Object.assign({}, body) : {};
    if (path.indexOf('/api/shop/auth/') === 0 && !payload.turnstile_token) {
      var ts = readTurnstileToken();
      if (ts) payload.turnstile_token = ts;
    }
    // Checkout precisa do token do cliente (se logado) pra poder usar saldo de fidelidade.
    var postHeaders = path === '/api/shop/checkout' ? customerAuthHeaders() : { 'Content-Type': 'application/json' };
    var res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw Object.assign(new Error((data && data.error) || 'Request failed'), { status: res.status, data: data });
    return data;
  }

  async function getJson(path, extra) {
    var res = await fetch(apiUrl(path, extra), { credentials: 'include' });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw Object.assign(new Error((data && data.error) || 'Request failed'), { status: res.status, data: data });
    return data;
  }

  function detectShopSubdomain() {
    var fromNerix =
      (window.NERIX && window.NERIX.shopSubdomain) ||
      (window.NERIX && window.NERIX.storeParam) ||
      '';
    if (fromNerix) return fromNerix;

    try {
      var host = window.location.hostname || '';
      var isLocal = host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
      if (!isLocal) return '';

      var first = (window.location.pathname || '/').split('/').filter(Boolean)[0] || '';
      var blocked = {
        api: true,
        login: true,
        register: true,
        checkout: true,
        payment: true,
        order: true,
        categories: true,
        terms: true,
        account: true,
      };
      if (!first || blocked[first]) return '';
      return first;
    } catch (e) {
      return '';
    }
  }

  function normalizeAffiliateRefCode(raw) {
    if (!raw) return '';
    return String(raw).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  }

  function affiliateRefStorageKeys() {
    var keys = [];
    var sub = detectShopSubdomain();
    if (sub) keys.push('affiliate_ref_' + String(sub).trim().toLowerCase());

    try {
      var host = String(window.location.hostname || '').trim().toLowerCase();
      if (host) keys.push('affiliate_ref_host_' + host);
    } catch (e) {}

    return keys.filter(function (key, index, list) {
      return key && list.indexOf(key) === index;
    });
  }

  function captureAffiliateRefFromUrl() {
    try {
      var url = new URL(window.location.href);
      var ref = url.searchParams.get('ref');
      if (!ref) return null;

      var code = normalizeAffiliateRefCode(ref);
      if (!code) return null;

      var storageKeys = affiliateRefStorageKeys();
      storageKeys.forEach(function (storageKey) {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ code: code, captured_at: new Date().toISOString() })
        );
      });

      url.searchParams.delete('ref');
      var newSearch = url.searchParams.toString();
      var newUrl = url.pathname + (newSearch ? '?' + newSearch : '') + (url.hash || '');
      window.history.replaceState({}, '', newUrl);

      getJson('/api/public/store', 'ref=' + encodeURIComponent(code)).catch(function () {});

      return code;
    } catch (e) {
      return null;
    }
  }

  function getAffiliateRef() {
    try {
      var storageKeys = affiliateRefStorageKeys();
      for (var i = 0; i < storageKeys.length; i++) {
        var raw = localStorage.getItem(storageKeys[i]);
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        if (parsed && parsed.code) {
          var code = normalizeAffiliateRefCode(parsed.code);
          if (code) return code;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  captureAffiliateRefFromUrl();

  function persistCustomerSession(token, customer) {
    var sub = detectShopSubdomain();
    if (!sub || !token) return;
    try {
      localStorage.setItem('customer_token_' + sub, token);
      if (customer) localStorage.setItem('customer_' + sub, JSON.stringify(customer));
      window.dispatchEvent(new Event('customerUpdated'));
    } catch (e) {}
  }

  function afterCustomerLoginRedirect() {
    var dest = typeof shopUrl === 'function' ? shopUrl('/account/orders') : '/account/orders';
    window.location.href = dest;
  }

  function consumeOAuthReturnToken() {
    try {
      var url = new URL(window.location.href);
      var discordToken = url.searchParams.get('discord_token');
      var googleToken = url.searchParams.get('google_token');
      var directToken = url.searchParams.get('token') || url.searchParams.get('customer_token');
      var token = discordToken || googleToken || directToken;
      if (!token) return;

      persistCustomerSession(token, null);

      url.searchParams.delete('discord_token');
      url.searchParams.delete('google_token');
      url.searchParams.delete('token');
      url.searchParams.delete('customer_token');

      var destPath = '/account/orders';
      if (window.location.pathname && /\/my-orders\/?$/.test(window.location.pathname)) {
        destPath = '/account/orders';
      }
      var dest = typeof shopUrl === 'function' ? shopUrl(destPath) : destPath;
      window.location.replace(dest);
    } catch (e) {}
  }

  function customerStorageSub() {
    return detectShopSubdomain();
  }

  consumeOAuthReturnToken();

  function customerAuthHeaders() {
    var h = { 'Content-Type': 'application/json' };
    var token = '';
    try {
      var ks = customerStorageSub();
      if (ks) token = localStorage.getItem('customer_token_' + ks) || '';
    } catch (e) {}
    var sub = (window.NERIX && window.NERIX.shopSubdomain) || '';
    if (token) h['Authorization'] = 'Bearer ' + token;
    if (sub) h['X-Store-Subdomain'] = sub;
    return h;
  }

  async function customerPostJson(path, body) {
    var res = await fetch(window.location.origin + path, {
      method: 'POST',
      headers: customerAuthHeaders(),
      body: JSON.stringify(body && typeof body === 'object' ? body : {}),
      credentials: 'include',
    });
    var data = null;
    try {
      data = await res.json();
    } catch (e) {}
    if (!res.ok) {
      throw Object.assign(new Error((data && data.error) || 'Request failed'), { status: res.status, data: data });
    }
    return data;
  }

  // ----------------------------------------------------------------- Nerix
  var Nerix = {
    // Em falta de uma lib de sanitização, devolvemos o HTML como veio.
    // Toda origem desse HTML é o nosso próprio backend renderizando templates
    // (e não input de usuário), então o risco de XSS é limitado.
    sanitizeHTML: function (html) {
      return html || '';
    },

    formatPrice: function (value, currency) {
      var n = typeof value === 'number' ? value : parseFloat(String(value || 0));
      if (!isFinite(n)) n = 0;
      try {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(n);
      } catch (e) {
        return 'R$ ' + n.toFixed(2).replace('.', ',');
      }
    },

    formatCEP: function (value) {
      var clean = String(value || '').replace(/\D/g, '').slice(0, 8);
      if (clean.length > 5) return clean.slice(0, 5) + '-' + clean.slice(5);
      return clean;
    },

    fetchCEP: async function (cep) {
      var clean = String(cep || '').replace(/\D/g, '');
      if (clean.length !== 8) throw new Error('CEP inválido');
      var res = await fetch('https://viacep.com.br/ws/' + clean + '/json/');
      var data = await res.json();
      if (data.erro) throw new Error('CEP não encontrado');
      return {
        cep: data.cep,
        street: data.logradouro,
        neighborhood: data.bairro,
        city: data.localidade,
        state: data.uf,
      };
    },

    // Dispara eventos de tracking (GA4, Meta Pixel, TikTok Pixel).
    track: function (eventName, payload) {
      try {
        var p = payload || {};
        var name = String(eventName || '').toLowerCase();

        if (window.gtag) {
          window.gtag('event', name, p);

          // Conversão do Google Ads precisa de um evento "conversion" com send_to
          // apontando pro par ID/label — o evento genérico acima não é suficiente
          // pra contar como conversão de anúncio sem vincular manualmente no Google Ads.
          if (name === 'purchase' && window.__NERIX_GOOGLE_ADS_CONVERSION__) {
            var ga = window.__NERIX_GOOGLE_ADS_CONVERSION__;
            window.gtag('event', 'conversion', {
              send_to: ga.id + '/' + ga.label,
              value: p.value,
              currency: p.currency || 'BRL',
              transaction_id: p.transaction_id || '',
            });
          }
        }

        if (window.oaiq) {
          var oaiqMap = {
            view_content: 'contents_viewed',
            add_to_cart: 'items_added',
            purchase: 'order_created',
          };
          var oaiqEvent = oaiqMap[name];
          if (oaiqEvent) {
            var oaiqData = { type: 'contents', currency: p.currency || 'BRL' };
            if (name === 'purchase') {
              oaiqData.amount = Math.round((p.value || 0) * 100);
              oaiqData.contents = (p.content_ids || []).map(function (id) {
                return { id: String(id), content_type: 'product', quantity: 1 };
              });
            } else {
              oaiqData.amount = Math.round((p.value || 0) * 100);
            }
            window.oaiq('measure', oaiqEvent, oaiqData);
          }
        }

        if (window.fbq) {
          var fbMap = {
            page_view: 'PageView',
            view_content: 'ViewContent',
            add_to_cart: 'AddToCart',
            initiate_checkout: 'InitiateCheckout',
            purchase: 'Purchase',
          };
          window.fbq('track', fbMap[name] || eventName, p);
        }

        if (window.ttq && typeof window.ttq.track === 'function') {
          var ttMap = {
            view_content: 'ViewContent',
            add_to_cart: 'AddToCart',
            initiate_checkout: 'InitiateCheckout',
            purchase: 'CompletePayment',
          };
          var ttEvent = ttMap[name];
          if (ttEvent) window.ttq.track(ttEvent, p);
        }
      } catch (e) {}
    },

    // ---- Endpoints do shop (a implementar no backend conforme features avancem)
    getRoblox: function (username) {
      return getJson('/api/shop/integrations/roblox', 'username=' + encodeURIComponent(username));
    },
    requestOtp: function (email) {
      return postJson('/api/shop/auth/otp/request', { email: email });
    },
    verifyOtp: function (email, code) {
      return postJson('/api/shop/auth/otp/verify', { email: email, code: code });
    },
    /**
     * Login com Google via redirect centralizado (domínio principal da plataforma).
     * Igual ao Discord — funciona em domínio customizado da loja sem registrar cada domínio no Google.
     */
    requestGoogle: function () {
      var sub = detectShopSubdomain();
      if (!sub) {
        if (typeof toast !== 'undefined' && toast.error) toast.error('Loja não identificada.');
        return;
      }
      var origin = window.location.origin;
      var host = encodeURIComponent(window.location.host || '');
      window.location.href =
        origin +
        '/api/public/customers/google?action=login&subdomain=' +
        encodeURIComponent(sub) +
        '&frontend_host=' +
        host;
    },
    /** Redireciona para o fluxo OAuth público (mesmo do painel React). */
    requestDiscord: function () {
      var sub = detectShopSubdomain();
      if (!sub) {
        try {
          if (typeof toast !== 'undefined' && toast.error) toast.error('Loja não identificada.');
        } catch (e) {}
        return;
      }
      var origin = window.location.origin;
      var host = encodeURIComponent(window.location.host || '');
      window.location.href =
        origin +
        '/api/public/customers/discord?action=login&subdomain=' +
        encodeURIComponent(sub) +
        '&frontend_host=' +
        host;
    },
    /** Solicitação de afiliação (cliente autenticado — mesmo fluxo do app React). */
    becomeAffiliate: function (payload) {
      var code =
        (payload && (payload.code || payload.ref_code || payload.refCode)) || '';
      return customerPostJson('/api/public/affiliate/request', { code: String(code).trim() });
    },
    getDiscount: function (code) {
      var q = 'code=' + encodeURIComponent(code);
      try {
        if (window.Cart && typeof window.Cart.calculateTotal === 'function') {
          var sub = Number(window.Cart.calculateTotal());
          if (Number.isFinite(sub) && sub >= 0) {
            q += '&amount=' + encodeURIComponent(String(sub));
          }
        }
      } catch (e) {}
      return getJson('/api/public/shop/discount', q);
    },
    getOrderStatus: function (orderNumber) {
      var ref = encodeURIComponent(String(orderNumber || '').trim());
      if (!ref) return Promise.reject(new Error('Pedido não identificado.'));
      // Endpoint de verificação de pagamento (vitrine SSR — mesma resolução de loja que checkout)
      return postJson('/api/shop/orders/' + ref + '/check-payment', {});
    },
    checkout: function (payload) {
      return postJson('/api/shop/checkout', payload);
    },
    /** Estado calculado da Meta Premiada (níveis, progresso, elegibilidade) — mesma lógica usada na validação do pedido no servidor. */
    evaluateCartGoal: function (payload) {
      return postJson('/api/public/cart-goal/evaluate', payload);
    },
    getAffiliateRef: getAffiliateRef,
    /** Encerra sessão do cliente na loja (JWT em localStorage). */
    logout: function () {
      var sub =
        detectShopSubdomain();
      return new Promise(function (resolve) {
        try {
          if (sub) {
            localStorage.removeItem('customer_token_' + sub);
            localStorage.removeItem('customer_' + sub);
          }
        } catch (e) {}
        try {
          window.dispatchEvent(new Event('customerUpdated'));
        } catch (e2) {}
        resolve();
      });
    },
  };

  // ----------------------------------------------------------------- Cart
  var CART_KEY = 'nerix_cart_v1';
  var PACKAGES_KEY = 'nerix_cart_packages_v1';

  function readLS(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeLS(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function quantityLimit(value) {
    var parsed = Number(value);
    return isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
  }

  function getPackageQuantityBounds(packageId) {
    var packages = readLS(PACKAGES_KEY, []) || [];
    var pkg = packages.find(function (p) { return Number(p.id) === Number(packageId); });
    var stock = pkg && pkg.stock ? pkg.stock : {};
    return {
      min: quantityLimit(stock.min_amount) || 1,
      max: quantityLimit(stock.max_amount),
    };
  }

  function clampPackageQuantity(packageId, quantity) {
    var bounds = getPackageQuantityBounds(packageId);
    var qty = Math.max(bounds.min, Math.floor(Number(quantity) || bounds.min));
    if (bounds.max !== null) qty = Math.min(qty, bounds.max);
    return qty;
  }

  var Cart = {
    get: function () {
      return readLS(CART_KEY, []) || [];
    },
    set: function (items) {
      writeLS(CART_KEY, items || []);
    },
    /**
     * Retorna os pacotes resolvidos do backend já enriquecidos com o
     * `cart_item` (quantidade + custom fields que o usuário escolheu) vindo do
     * localStorage. O template usa `package.cart_item.quantity` pra
     * renderizar o input de quantidade no drawer/checkout.
     */
    getPackages: function () {
      var packages = readLS(PACKAGES_KEY, []) || [];
      var items = Cart.get();
      return packages
        .filter(function (pkg) {
          return items.some(function (it) { return Number(it.id) === Number(pkg.id); });
        })
        .map(function (pkg) {
        var cartItem = items.find(function (it) { return Number(it.id) === Number(pkg.id); });
        var qty = cartItem ? (Number(cartItem.quantity) || 1) : 1;
        var fields = cartItem && cartItem.fields ? cartItem.fields : {};
        var parentProductId =
          cartItem && cartItem.parent_product_id != null
            ? Number(cartItem.parent_product_id)
            : null;
        var isCartGoalReward = cartItem && cartItem.cart_goal_reward === true;
        if (isCartGoalReward) {
          return Object.assign({}, pkg, {
            pricing: Object.assign({}, pkg.pricing || {}, { price: 0, min: 0 }),
            cart_item: { quantity: qty, fields: fields, parent_product_id: parentProductId, cart_goal_reward: true },
          });
        }
        var ov =
          cartItem && cartItem.unit_price_override != null && !isNaN(Number(cartItem.unit_price_override))
            ? Number(cartItem.unit_price_override)
            : null;
        if (ov != null && ov > 0) {
          return Object.assign({}, pkg, {
            pricing: Object.assign({}, pkg.pricing || {}, { price: ov, min: ov }),
            cart_item: { quantity: qty, fields: fields, parent_product_id: parentProductId },
          });
        }
        pkg.cart_item = { quantity: qty, fields: fields, parent_product_id: parentProductId };
        return pkg;
      });
    },
    getCount: function () {
      var items = Cart.get();
      var n = 0;
      for (var i = 0; i < items.length; i++) n += Number(items[i].quantity) || 0;
      return n;
    },
    add: function (packageId, quantity, fields, extra) {
      var items = Cart.get();
      var id = Number(packageId);
      var qty = clampPackageQuantity(id, quantity);
      extra = extra || {};
      var existing = items.find(function (it) { return it.id === id; });
      if (existing) {
        existing.quantity = clampPackageQuantity(id, (Number(existing.quantity) || 0) + qty);
        if (fields) existing.fields = Object.assign({}, existing.fields || {}, fields);
      } else {
        var row = { id: id, quantity: qty, fields: fields || {} };
        if (extra.parent_product_id != null) row.parent_product_id = Number(extra.parent_product_id);
        if (extra.order_bump_id != null) row.order_bump_id = Number(extra.order_bump_id);
        if (extra.unit_price_override != null && !isNaN(Number(extra.unit_price_override))) {
          row.unit_price_override = Number(extra.unit_price_override);
        }
        if (extra.cart_goal_reward === true) row.cart_goal_reward = true;
        items.push(row);
      }
      Cart.set(items);
    },
    remove: function (packageId, parentProductId) {
      var id = Number(packageId);
      var parentId =
        parentProductId !== null &&
        parentProductId !== undefined &&
        String(parentProductId).trim() !== ''
          ? Number(parentProductId)
          : null;
      Cart.set(
        Cart.get().filter(function (it) {
          if (it.id !== id) return true;
          if (parentId === null) return false;
          var itParent = it.parent_product_id != null ? Number(it.parent_product_id) : null;
          return itParent !== parentId;
        })
      );
    },
    update: function (packageId, quantity) {
      var id = Number(packageId);
      var qty = clampPackageQuantity(id, quantity);
      Cart.set(Cart.get().map(function (it) { return it.id === id ? Object.assign({}, it, { quantity: qty }) : it; }));
    },
    increase: function (packageId) {
      var item = Cart.get().find(function (it) { return it.id === Number(packageId); });
      Cart.update(packageId, (item ? item.quantity : 0) + 1);
    },
    decrease: function (packageId) {
      var item = Cart.get().find(function (it) { return it.id === Number(packageId); });
      if (!item) return;
      var min = getPackageQuantityBounds(packageId).min;
      if (item.quantity <= min) return;
      Cart.update(packageId, item.quantity - 1);
    },
    clear: function () {
      Cart.set([]);
      writeLS(PACKAGES_KEY, []);
    },
    revalidateQuantity: function () {
      var items = Cart.get()
        .filter(function (it) { return Number(it.quantity) > 0; })
        .map(function (it) {
          return Object.assign({}, it, { quantity: clampPackageQuantity(it.id, it.quantity) });
        });
      Cart.set(items);
    },
    calculateTotal: function () {
      var pkgs = Cart.getPackages();
      var items = Cart.get();
      var total = 0;
      items.forEach(function (it) {
        // Brinde da Meta Premiada: sempre R$0 no carrinho, nunca o preço de catálogo do produto.
        if (it.cart_goal_reward === true) return;
        var pkg = pkgs.find(function (p) { return p.id === it.id; });
        var override =
          it.unit_price_override != null && !isNaN(Number(it.unit_price_override))
            ? Number(it.unit_price_override)
            : null;
        var price =
          override != null && override > 0
            ? override
            : pkg && pkg.pricing
              ? pkg.pricing.price || 0
              : 0;
        total += Number(price) * (Number(it.quantity) || 0);
      });
      return total;
    },
    /**
     * Recalcula o carrinho chamando o backend pra obter dados atualizados dos
     * pacotes (nome, imagem, preço, estoque). Se o endpoint ainda não existe,
     * usa os dados já em cache.
     */
    calculate: async function () {
      var items = Cart.get();
      if (items.length === 0) {
        writeLS(PACKAGES_KEY, []);
        return { packages: [], total: 0 };
      }
      try {
        var data = await postJson('/api/shop/cart/resolve', {
          ids: items.map(function (i) { return i.id; }),
        });
        if (data && Array.isArray(data.packages)) {
          writeLS(PACKAGES_KEY, data.packages);
        }
      } catch (e) {
        // Endpoint ainda não existe — manter pacotes anteriores.
      }
      return { packages: Cart.getPackages(), total: Cart.calculateTotal() };
    },
  };

  window.Nerix = Nerix;
  window.Cart = Cart;


  (function trackStoreVisitOnce() {
    try {
      var sub =
        (window.NERIX && window.NERIX.shopSubdomain) ||
        detectShopSubdomain() ||
        '';
      var pagePath = (window.location.pathname || '/') + (window.location.search || '');
      var headers = { 'Content-Type': 'application/json' };
      if (sub) headers['X-Store-Subdomain'] = sub;

      fetch(
        window.location.origin +
          '/api/public/visits/track?path=' +
          encodeURIComponent(pagePath),
        { method: 'POST', headers: headers, credentials: 'include' }
      ).catch(function () {});

      fetch(window.location.origin + '/api/public/visit-logs/track-store', {
        method: 'POST',
        headers: headers,
        credentials: 'include',
        body: JSON.stringify({ action: 'page_view', path: pagePath }),
      }).catch(function () {});
    } catch (e) {}
  })();
})();
