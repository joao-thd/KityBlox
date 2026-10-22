/**
 * Detalhe do pedido na loja Liquid: GET /api/public/customer/my-orders/:orderNumber
 */
(function () {
  'use strict';

  var loadingEl = document.getElementById('order-detail-loading');
  var guestEl = document.getElementById('order-detail-guest');
  var errorEl = document.getElementById('order-detail-error');
  var layoutEl = document.getElementById('order-detail-layout');
  var itemsCol = document.getElementById('order-detail-items');
  var summaryCol = document.getElementById('order-detail-summary');
  if (!loadingEl || !guestEl || !errorEl || !layoutEl || !itemsCol || !summaryCol) return;

  // E-mail do pedido carregado — a página é pública, então quem está vendo já
  // tem acesso a essa informação. Usado pra avaliação sem login (visitante).
  var currentOrderCustomerEmail = '';

  function storageSub() {
    return (
      (window.NERIX && window.NERIX.shopSubdomain) ||
      (window.NERIX && window.NERIX.storeParam) ||
      ''
    );
  }

  function apiSub() {
    return (window.NERIX && window.NERIX.shopSubdomain) || '';
  }

  function token() {
    var s = storageSub();
    if (!s) return '';
    try {
      return localStorage.getItem('customer_token_' + s) || '';
    } catch (e) {
      return '';
    }
  }

  function shopHref(path) {
    return typeof shopUrl === 'function' ? shopUrl(path) : path;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function fmtMoney(v) {
    try {
      if (typeof Nerix !== 'undefined' && Nerix.formatPrice) {
        return Nerix.formatPrice(v, (typeof store !== 'undefined' && store.currency) || 'BRL');
      }
    } catch (e) {}
    var n = parseFloat(String(v || 0));
    if (!isFinite(n)) n = 0;
    return 'R$ ' + n.toFixed(2).replace('.', ',');
  }

  function formatWhen(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return '—';
    }
  }

  function orderNumberFromPath() {
    var p = window.location.pathname || '';
    var m = p.match(/\/order\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function displayStatus(o) {
    var ps = String(o.payment_status || '').toLowerCase();
    var st = String(o.status || '').toLowerCase();
    if (ps === 'refunded') return { icon: 'arrow-counter-clockwise', color: 'text-yellow-500', label: 'Pagamento reembolsado' };
    if (ps === 'failed') return { icon: 'x-circle', color: 'text-red-500', label: 'Pagamento falhou' };
    if (st === 'cancelled') return { icon: 'x-circle', color: 'text-red-500', label: 'Pedido cancelado' };
    if (ps === 'pending') return { icon: 'clock', color: 'text-yellow-500', label: 'Pagamento pendente' };
    if (ps === 'paid') {
      if (st === 'delivered') return { icon: 'check-circle', color: 'text-emerald-500', label: 'Entregue' };
      return { icon: 'check-circle', color: 'text-emerald-500', label: 'Pagamento aprovado' };
    }
    return { icon: 'clock', color: 'text-[#c58aa9]', label: st || ps || 'Em andamento' };
  }

  function gatewayLabel(o) {
    var m = o.metadata && typeof o.metadata === 'object' ? o.metadata : {};
    if (m.gateway_display) return String(m.gateway_display);
    if (m.gateway) return String(m.gateway);
    return String(o.payment_method || 'pix').toUpperCase() === 'PIX' ? 'PIX' : String(o.payment_method || '—');
  }

  function couponText(o) {
    if (o.promo_code) return String(o.promo_code);
    var m = o.metadata && typeof o.metadata === 'object' ? o.metadata : {};
    if (m.promo_code) return String(m.promo_code);
    if (m.coupon_code) return String(m.coupon_code);
    if (o.affiliate_code) return String(o.affiliate_code);
    return '';
  }

  function cdnBaseUrl() {
    if (window.__NERIX_CDN_BASE__) {
      return String(window.__NERIX_CDN_BASE__).replace(/\/+$/, '');
    }
    var noImg = typeof window !== 'undefined' && window.__NERIX_NO_IMAGE__ ? String(window.__NERIX_NO_IMAGE__) : '';
    var marker = '/public/';
    var idx = noImg.indexOf(marker);
    if (idx > 0) return noImg.slice(0, idx);
    if (/^https?:\/\//i.test(noImg)) return noImg.replace(/\/[^/]+$/, '');
    return 'https://cdn.nerix.com.br';
  }

  function normalizeImagesField(images) {
    if (!images) return [];
    if (typeof images === 'string') {
      var trimmed = images.trim();
      if (!trimmed) return [];
      try {
        var parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [trimmed];
      } catch (e) {
        return [trimmed];
      }
    }
    return Array.isArray(images) ? images : [];
  }

  function extractAssetKey(value) {
    var s = String(value || '').trim();
    if (!s) return '';
    var storesIdx = s.indexOf('stores/');
    if (storesIdx >= 0) return s.slice(storesIdx).replace(/^\/+/, '');
    var publicIdx = s.indexOf('public/');
    if (publicIdx >= 0) return s.slice(publicIdx).replace(/^\/+/, '');
    return s.replace(/^\/+/, '');
  }

  function resolveCdnUrl(raw) {
    if (!raw) return '';
    var value = String(raw).trim();
    if (!value || /^data:/i.test(value)) return value;

    if (/^https?:\/\//i.test(value)) {
      var keyFromAbsolute = extractAssetKey(value);
      if (keyFromAbsolute && (keyFromAbsolute.indexOf('stores/') === 0 || keyFromAbsolute.indexOf('public/') === 0)) {
        return cdnBaseUrl() + '/' + keyFromAbsolute;
      }
      return value;
    }

    if (value.indexOf('//') === 0) return 'https:' + value;

    return cdnBaseUrl() + '/' + extractAssetKey(value);
  }

  function itemImageSrc(it) {
    var candidates = [];

    if (it && it.image_url) candidates.push(it.image_url);
    if (it && it.product) {
      if (it.product.card_image_url) candidates.push(it.product.card_image_url);
      if (it.product.image_url) candidates.push(it.product.image_url);
      normalizeImagesField(it.product.images).forEach(function (img) {
        if (img) candidates.push(img);
      });
    }
    if (it && it.metadata && it.metadata.image) candidates.push(it.metadata.image);

    for (var i = 0; i < candidates.length; i++) {
      var resolved = resolveCdnUrl(candidates[i]);
      if (resolved) return resolved;
    }

    return typeof window !== 'undefined' && window.__NERIX_NO_IMAGE__ ? String(window.__NERIX_NO_IMAGE__) : '';
  }

  function itemProductKey(it) {
    return it && it.product_key ? String(it.product_key) : '';
  }

  function parseVitrineSettingsClient(raw) {
    if (!raw) return {};
    var data = raw;
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw);
      } catch (e) {
        return {};
      }
    }
    if (!data || typeof data !== 'object') return {};
    return data;
  }

  function mergeVitrineSettingsClient(productRaw, variantRaw) {
    var base = parseVitrineSettingsClient(productRaw);
    var variant = parseVitrineSettingsClient(variantRaw);
    function pick(key) {
      var v = variant[key];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
      return base[key];
    }
    return {
      post_purchase_instructions: pick('post_purchase_instructions'),
      delivery_attachment_url: pick('delivery_attachment_url'),
      delivery_attachment_name: pick('delivery_attachment_name'),
      instructions_channel: variant.instructions_channel || base.instructions_channel || 'both',
    };
  }

  function getMergedVitrineForItem(it) {
    var productSettings = it && it.product && it.product.vitrine_settings;
    var variantSettings =
      (it && it.variant && it.variant.vitrine_settings) ||
      (it && it.product_variant && it.product_variant.vitrine_settings);
    return mergeVitrineSettingsClient(productSettings, variantSettings);
  }

  function getItemInstructions(it) {
    var extras = it && it.delivery_extras;
    if (extras && String(extras.instructions || '').trim()) {
      return String(extras.instructions).trim();
    }
    var parsed = getMergedVitrineForItem(it);
    if (parsed.post_purchase_instructions && String(parsed.post_purchase_instructions).trim()) {
      return String(parsed.post_purchase_instructions).trim();
    }
    return '';
  }

  function getItemAttachment(it) {
    var extras = it && it.delivery_extras;
    if (extras && extras.attachment_url) {
      return {
        url: String(extras.attachment_url),
        name: extras.attachment_name || 'Baixar anexo da entrega',
      };
    }
    var parsed = getMergedVitrineForItem(it);
    if (parsed.delivery_attachment_url) {
      return {
        url: String(parsed.delivery_attachment_url),
        name: parsed.delivery_attachment_name || 'Baixar anexo da entrega',
      };
    }
    return null;
  }

  function renderInstructionCard(productName, instructions, showProductName) {
    return (
      '<div class="order-instructions-card">' +
      (showProductName
        ? '<p class="text-xs font-medium text-muted-foreground mb-2">' + escapeHtml(productName) + '</p>'
        : '') +
      '<p class="order-instructions-card__title">' +
      '<i class="ph ph-book-open-text size-4" aria-hidden="true"></i>' +
      'Instruções de uso</p>' +
      '<div class="order-instructions-card__body">' +
      escapeHtml(instructions).replace(/\r?\n/g, '<br>') +
      '</div></div>'
    );
  }

  function renderOrderInstructionsSection(items, isPaid) {
    if (!isPaid || !Array.isArray(items) || !items.length) return '';

    var cards = [];
    items.forEach(function (it) {
      var instructions = getItemInstructions(it);
      if (!instructions) return;
      cards.push(
        renderInstructionCard(
          String(it.product_name || 'Produto'),
          instructions,
          items.length > 1
        )
      );
    });

    if (!cards.length) return '';

    return (
      '<div class="mt-5 space-y-3">' +
      '<h2 class="text-lg font-semibold">Instruções</h2>' +
      cards.join('') +
      '</div>'
    );
  }

  function renderDeliveryExtras(it, options) {
    options = options || {};
    if (options.isPaid !== true) return '';

    var parts = [];
    var attachment = getItemAttachment(it);

    if (attachment && attachment.url) {
      parts.push(
        '<a class="mt-3 inline-flex items-center gap-2 text-sm font-medium underline" href="' +
          escapeHtml(attachment.url) +
          '" target="_blank" rel="noopener">' +
          '<i class="ph ph-paperclip size-4" aria-hidden="true"></i>' +
          escapeHtml(attachment.name) +
          '</a>'
      );
    }

    return parts.join('');
  }

  function renderItemImage(it) {
    var srcRaw = itemImageSrc(it);
    if (!srcRaw) {
      return '<div class="size-full rounded-md border border-white/10 bg-muted/40"></div>';
    }
    return (
      '<img class="size-full bg-background border rounded-md object-cover" src="' +
      escapeHtml(srcRaw) +
      '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;if(window.__NERIX_NO_IMAGE__&&this.src!==window.__NERIX_NO_IMAGE__){this.src=window.__NERIX_NO_IMAGE__;}"/>'
    );
  }

  function renderItem(it, options) {
    options = options || {};
    var isPaid = options.isPaid === true;
    var name = escapeHtml(it.product_name || 'Produto');
    var qty = Number(it.quantity) || 1;
    var lineTotal =
      it.total != null && it.total !== ''
        ? fmtMoney(it.total)
        : fmtMoney((Number(it.price) || 0) * qty);
    var rawKey = itemProductKey(it);

    var deliveryBlock = '';
    if (isPaid && rawKey) {
      deliveryBlock =
        '<div class="mt-3 pt-3 border-t border-white/10">' +
        '<p class="text-xs text-muted-foreground mb-1.5">Conteúdo entregue</p>' +
        '<code class="block w-full text-xs font-mono break-all rounded-md border border-white/10 bg-background px-2.5 py-2 select-all">' +
        escapeHtml(rawKey) +
        '</code></div>';
    } else if (isPaid) {
      deliveryBlock = '<p class="text-xs text-muted-foreground mt-3">Entrega em processamento.</p>';
    }

    var reviewBlock = '';
    if (isPaid && it.id) {
      reviewBlock =
        '<div class="review-widget mt-3 pt-3 border-t border-white/10" data-order-item-id="' +
        escapeHtml(String(it.id)) +
        '"><p class="text-xs text-muted-foreground">Carregando avaliação…</p></div>';
    }

    return (
      '<div class="p-4 rounded-xl border border-white/10 bg-background/60">' +
      '<div class="flex gap-3 items-center">' +
      '<div class="relative w-16 h-16 shrink-0">' +
      renderItemImage(it) +
      '<span class="absolute -top-2 -right-2 bg-primary text-background font-semibold w-6 h-6 rounded-full grid place-items-center text-xs">' +
      qty +
      '</span></div>' +
      '<div class="flex-1 min-w-0">' +
      '<p class="text-sm font-semibold line-clamp-2">' +
      name +
      '</p>' +
      '<p class="text-xs text-muted-foreground mt-1">Quantidade: ' + qty + '</p>' +
      '<p class="text-sm font-semibold mt-1">' + lineTotal + '</p>' +
      '</div></div>' +
      deliveryBlock +
      renderDeliveryExtras(it, { isPaid: isPaid }) +
      reviewBlock +
      '</div>'
    );
  }

  function renderStars(activeCount, interactive) {
    // Cor via inline style (não classe Tailwind) — garante a cor certa
    // independente de qualquer regra de CSS de ícone com mais especificidade.
    var html = '<div class="flex items-center gap-1' + (interactive ? ' review-star-picker' : '') + '" role="radiogroup" aria-label="Nota">';
    for (var i = 1; i <= 5; i++) {
      var filled = i <= activeCount;
      var colorStyle = filled ? 'color:rgb(var(--primary))' : 'color:rgb(var(--muted-foreground))';
      if (interactive) {
        html +=
          '<button type="button" class="review-star-btn" data-star="' + i + '" aria-label="' + i + ' estrela' + (i > 1 ? 's' : '') + '">' +
          '<i class="ph' + (filled ? '-fill' : '') + ' ph-star size-5" style="' + colorStyle + '" aria-hidden="true"></i>' +
          '</button>';
      } else {
        html += '<i class="ph' + (filled ? '-fill' : '') + ' ph-star size-4" style="' + colorStyle + '" aria-hidden="true"></i>';
      }
    }
    html += '</div>';
    return html;
  }

  function renderReviewForm(orderItemId, rating) {
    return (
      '<p class="text-xs font-semibold mb-2">Avaliar este produto</p>' +
      '<div class="review-form" data-order-item-id="' + escapeHtml(String(orderItemId)) + '" data-rating="' + (rating || 0) + '">' +
      renderStars(rating || 0, true) +
      '<textarea class="review-comment mt-2 w-full text-xs rounded-md border border-white/10 bg-background px-2.5 py-2 resize-none" rows="2" placeholder="Conte como foi sua experiência (opcional)" maxlength="1000"></textarea>' +
      '<div class="flex items-center gap-2 mt-2">' +
      '<button type="button" class="review-submit-btn h-8 px-3 rounded-md btn-primary text-xs" data-action="submit-review" disabled>Enviar avaliação</button>' +
      '<span class="review-form-error text-xs text-red-400"></span>' +
      '</div></div>'
    );
  }

  function renderReviewAlready(rating) {
    return (
      '<div class="flex items-center gap-2">' +
      renderStars(rating || 0, false) +
      '<span class="text-xs text-muted-foreground">Você avaliou este produto</span>' +
      '</div>'
    );
  }

  async function initReviewWidgets() {
    var widgets = itemsCol.querySelectorAll('.review-widget');
    if (!widgets.length) return;
    for (var i = 0; i < widgets.length; i++) {
      (function (widget) {
        var orderItemId = widget.getAttribute('data-order-item-id');
        if (!orderItemId) return;
        if (!token()) {
          // Visitante (link direto, sem login): não existe endpoint público
          // de "já avaliei", então mostra o formulário direto — se já tiver
          // avaliação daquele pedido, o backend recusa no envio.
          widget.innerHTML = renderReviewForm(orderItemId, 0);
          return;
        }
        fetch(
          window.location.origin + '/api/public/customer/reviews/check/' + encodeURIComponent(orderItemId),
          {
            headers: { Authorization: 'Bearer ' + token(), 'X-Store-Subdomain': apiSub(), Accept: 'application/json' },
            credentials: 'include',
          }
        )
          .then(function (res) {
            // Token presente mas expirado/inválido: trata como visitante em
            // vez de travar a avaliação por causa da sessão.
            if (res.status === 401 || res.status === 403) return { exists: false };
            return res.ok ? res.json() : { exists: false };
          })
          .then(function (data) {
            if (data && data.exists) {
              widget.innerHTML = renderReviewAlready(data.review && data.review.rating);
            } else {
              widget.innerHTML = renderReviewForm(orderItemId, 0);
            }
          })
          .catch(function () {
            widget.innerHTML = renderReviewForm(orderItemId, 0);
          });
      })(widgets[i]);
    }
  }

  itemsCol.addEventListener('click', function (ev) {
    var starBtn = ev.target.closest('.review-star-btn');
    if (starBtn) {
      var form = starBtn.closest('.review-form');
      if (!form) return;
      var rating = Number(starBtn.getAttribute('data-star')) || 0;
      form.setAttribute('data-rating', String(rating));
      var picker = form.querySelector('.review-star-picker');
      if (picker) picker.outerHTML = renderStars(rating, true);
      var submitBtn = form.querySelector('.review-submit-btn');
      if (submitBtn) submitBtn.disabled = rating < 1;
      return;
    }

    var submitBtn2 = ev.target.closest('[data-action="submit-review"]');
    if (submitBtn2) {
      var form2 = submitBtn2.closest('.review-form');
      if (!form2) return;
      var widget2 = form2.closest('.review-widget');
      var orderItemId2 = form2.getAttribute('data-order-item-id');
      var rating2 = Number(form2.getAttribute('data-rating')) || 0;
      var commentEl = form2.querySelector('.review-comment');
      var comment2 = commentEl ? commentEl.value.trim() : '';
      var errorEl2 = form2.querySelector('.review-form-error');
      if (rating2 < 1) return;

      submitBtn2.disabled = true;
      if (errorEl2) errorEl2.textContent = '';

      function submitReviewAsGuest() {
        return fetch(window.location.origin + '/api/public/customer/reviews/by-order', {
          method: 'POST',
          headers: {
            'X-Store-Subdomain': apiSub(),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            order_item_id: orderItemId2,
            rating: rating2,
            comment: comment2,
            customer_email: currentOrderCustomerEmail,
          }),
        });
      }

      var reviewRequest = token()
        ? fetch(window.location.origin + '/api/public/customer/reviews', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + token(),
              'X-Store-Subdomain': apiSub(),
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ order_item_id: orderItemId2, rating: rating2, comment: comment2 }),
          })
        : submitReviewAsGuest();

      reviewRequest
        .then(function (res) {
          // Sessão expirada/token inválido: tenta de novo como visitante,
          // usando o e-mail do próprio pedido (a página já é pública).
          if (token() && (res.status === 401 || res.status === 403)) {
            return submitReviewAsGuest();
          }
          return res;
        })
        .then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (result) {
          if (!result.ok) {
            if (errorEl2) errorEl2.textContent = (result.data && result.data.error) || 'Não foi possível enviar sua avaliação.';
            submitBtn2.disabled = false;
            return;
          }
          if (widget2) widget2.innerHTML = renderReviewAlready(rating2);
        })
        .catch(function () {
          if (errorEl2) errorEl2.textContent = 'Erro de rede. Tente novamente.';
          submitBtn2.disabled = false;
        });
    }
  });

  function setView(mode) {
    loadingEl.classList.toggle('hidden', mode !== 'loading');
    guestEl.classList.toggle('hidden', mode !== 'guest');
    errorEl.classList.toggle('hidden', mode !== 'error');
    layoutEl.classList.toggle('hidden', mode !== 'content');
  }

  function productHasAutoChat(it) {
    var value = it && it.product && it.product.chat_auto_open;
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  async function load() {
    var orderNum = orderNumberFromPath();
    setView('loading');
    itemsCol.innerHTML = '';
    summaryCol.innerHTML = '';

    if (!orderNum) {
      errorEl.textContent = 'Pedido não identificado na URL.';
      setView('error');
      return;
    }

    try {
      // Link direto do pedido (`/order/:id`) é público — não exige login. O
      // número do pedido em si (ULID de alta entropia) já é o "segredo" de
      // acesso, igual confirmação de pedido de e-commerce (Shopify e cia).
      var url =
        window.location.origin +
        '/api/public/customer/orders/' +
        encodeURIComponent(orderNum);
      var headers = { Accept: 'application/json' };
      if (apiSub()) headers['X-Store-Subdomain'] = apiSub();
      if (token()) headers['Authorization'] = 'Bearer ' + token();
      var res = await fetch(url, {
        headers: headers,
        credentials: 'include',
      });

      if (res.status === 404) {
        errorEl.textContent = 'Pedido não encontrado. Confira se o link está correto.';
        setView('error');
        return;
      }
      if (!res.ok) {
        var err = null;
        try {
          err = await res.json();
        } catch (e) {}
        errorEl.textContent = (err && err.error) || 'Não foi possível carregar o pedido.';
        setView('error');
        return;
      }

      var o = await res.json();
      currentOrderCustomerEmail = o.customer_email || '';
      var st = displayStatus(o);
      var orderRef = encodeURIComponent(String(o.order_number || o.id || ''));
      var paymentStatus = String(o.payment_status || '').toLowerCase();
      var orderStatus = String(o.status || '').toLowerCase();
      var isPaid = paymentStatus === 'paid' || orderStatus === 'paid' || orderStatus === 'delivered';
      var items = Array.isArray(o.items) ? o.items : [];
      var hasProductAutoChat = isPaid && items.some(productHasAutoChat);
      var chatEnabled = typeof store !== 'undefined' && store.enable_chat === true;
      var showChat = hasProductAutoChat || (chatEnabled && isPaid);
      var shouldAutoOpenChat = hasProductAutoChat;

      var itemsHtml =
        items.length > 0
          ? items.map(function (it) { return renderItem(it, { isPaid: isPaid }); }).join('')
          : '<p class="text-sm text-muted-foreground">Nenhum item listado para este pedido.</p>';
      var instructionsSectionHtml = renderOrderInstructionsSection(items, isPaid);

      itemsCol.innerHTML =
        '<div class="border border-white/10 rounded-2xl bg-muted/70 p-6 md:p-8 backdrop-blur-sm">' +
        '<div class="inline-flex w-14 h-14 rounded-2xl items-center justify-center bg-primary/15 mb-5">' +
        '<i class="ph ph-' + escapeHtml(st.icon) + ' size-8 ' + escapeHtml(st.color) + '" aria-hidden="true"></i></div>' +
        '<h1 class="text-2xl md:text-3xl font-bold mb-1">' +
        (paymentStatus === 'paid' ? 'Pagamento aprovado!' : 'Pedido em andamento') +
        '</h1>' +
        '<p class="text-sm text-muted-foreground">Status atual: ' +
        escapeHtml(st.label) + ' • Atualizado em ' + escapeHtml(formatWhen(o.updated_at || o.created_at)) +
        '</p>' +
        '<div class="rounded-xl border border-white/10 bg-background/60 p-4 mt-5">' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">' +
        '<div class="space-y-1"><p class="text-muted-foreground">Pedido</p><p class="font-mono font-semibold">#' +
        escapeHtml(String(o.order_number || '')) + '</p></div>' +
        '<div class="space-y-1 sm:text-right"><p class="text-muted-foreground">Valor total</p><p class="font-bold">' +
        fmtMoney(o.total) + '</p></div></div></div>' +
        instructionsSectionHtml +
        '</div>' +
        '<div class="border border-white/10 rounded-2xl bg-muted/70 p-6 md:p-8 backdrop-blur-sm">' +
        '<h2 class="text-xl font-bold mb-4">Itens do pedido</h2>' +
        '<div class="space-y-4">' + itemsHtml + '</div></div>' +
        '<a href="' + escapeHtml(shopHref('/')) + '" class="btn-primary h-10 inline-flex items-center gap-2 w-fit">' +
        '<i class="ph ph-house size-5" aria-hidden="true"></i> Voltar ao início</a>';

      if (isPaid) {
        initReviewWidgets();
        // Dispara o evento de compra pros pixels (Meta/TikTok/Google Ads/OpenAI Ads)
        // uma única vez por pedido — sem isso nenhum deles nunca soube quando uma
        // venda de verdade acontecia, só viam PageView.
        try {
          var trackedKey = 'nerix_purchase_tracked_' + (o.order_number || o.id);
          if (!localStorage.getItem(trackedKey)) {
            localStorage.setItem(trackedKey, '1');
            if (typeof Nerix !== 'undefined' && Nerix.track) {
              Nerix.track('purchase', {
                value: Number(o.total) || 0,
                currency: 'BRL',
                transaction_id: String(o.order_number || o.id || ''),
                content_ids: items.map(function (it) { return it.product_id || it.id; }),
              });
            }
          }
        } catch (e) {}
      }

      var cup = couponText(o);
      var cupBlock = cup
        ? '<div class="flex items-center justify-between gap-3"><span class="text-muted-foreground">Cupom</span><span class="font-medium">' +
          escapeHtml(cup) + '</span></div>'
        : '';

      summaryCol.innerHTML =
        '<div class="border border-white/10 rounded-2xl bg-muted/70 p-5 backdrop-blur-sm">' +
        '<h3 class="text-sm font-semibold mb-3">Dados do cliente</h3>' +
        '<div class="rounded-xl border border-white/10 bg-background/60 p-4 space-y-3 text-sm">' +
        '<div class="flex items-center justify-between gap-3"><span class="text-muted-foreground">Nome</span><span class="font-medium text-right break-all">' +
        escapeHtml(o.customer_name || '') + '</span></div>' +
        '<div class="flex items-center justify-between gap-3"><span class="text-muted-foreground">E-mail</span><span class="text-right break-all">' +
        escapeHtml(o.customer_email || '') + '</span></div></div></div>' +
        '<div class="border border-white/10 rounded-2xl bg-muted/70 p-5 backdrop-blur-sm">' +
        '<h3 class="text-sm font-semibold mb-3">Informações do pedido</h3>' +
        '<div class="rounded-xl border border-white/10 bg-background/60 p-4 space-y-3 text-sm">' +
        '<div class="flex items-center justify-between gap-3"><span class="text-muted-foreground">Pedido</span><span class="font-mono text-xs">#' +
        escapeHtml(String(o.order_number || '')) + '</span></div>' +
        '<div class="flex items-center justify-between gap-3"><span class="text-muted-foreground">Status</span><span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/15 text-primary">' +
        escapeHtml(st.label) + '</span></div>' +
        '<div class="flex items-center justify-between gap-3"><span class="text-muted-foreground">Método</span><span>' +
        escapeHtml(gatewayLabel(o)) + '</span></div>' +
        cupBlock +
        '<div class="detail-dash"></div>' +
        '<div class="flex items-center justify-between gap-3"><span class="font-medium">Total</span><span class="text-lg font-bold text-primary">' +
        fmtMoney(o.total) + '</span></div></div></div>';

      var pm = String(o.payment_method || '').toLowerCase();
      var ps = String(o.payment_status || '').toLowerCase();
      if (pm === 'pix' && ps === 'pending') {
        summaryCol.innerHTML +=
          '<div class="mt-4"><a href="' +
          escapeHtml(shopHref('/payment/' + encodeURIComponent(o.order_number || String(o.id)))) +
          '" class="btn-primary w-full justify-center h-10 inline-flex items-center gap-2">' +
          '<i class="ph ph-qr-code size-5" aria-hidden="true"></i> Continuar pagamento</a></div>';
      }

      if (showChat && orderRef) {
        summaryCol.innerHTML +=
          '<div class="mt-4"><a href="' +
          escapeHtml(shopHref('/chat/order/' + orderRef)) +
          '" class="btn-outline w-full justify-center h-10 inline-flex items-center gap-2">' +
          '<i class="ph ph-chat-circle-dots size-5" aria-hidden="true"></i> Abrir chat de entrega</a></div>';

        if (shouldAutoOpenChat) {
          try {
            var chatKey = 'auto_chat_opened_' + String(o.order_number || o.id || '');
            if (!sessionStorage.getItem(chatKey)) {
              sessionStorage.setItem(chatKey, '1');
              window.location.href = shopHref('/chat/order/' + orderRef);
              return;
            }
          } catch (e) {}
        }
      }

      setView('content');
    } catch (err) {
      errorEl.textContent = 'Erro de rede ao carregar o pedido.';
      setView('error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
  window.addEventListener('customerUpdated', load);
})();
