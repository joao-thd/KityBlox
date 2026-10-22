/**
 * Lista "Meus pedidos" via GET /api/public/customer/my-orders (JWT no browser).
 * O `load 'orders'` do template não preenche dados no servidor.
 */
(function () {
  'use strict';

  var listEl = document.getElementById('customer-orders-list');
  var loadingEl = document.getElementById('customer-orders-loading');
  var emptyEl = document.getElementById('customer-orders-empty');
  var guestEl = document.getElementById('customer-orders-guest');
  if (!listEl || !loadingEl || !emptyEl || !guestEl) return;

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

  function displayStatus(o) {
    var ps = String(o.payment_status || '').toLowerCase();
    var st = String(o.status || '').toLowerCase();
    if (ps === 'refunded') return { dot: 'rgb(234 179 8)', label: 'Pagamento reembolsado' };
    if (ps === 'failed') return { dot: 'rgb(239 68 68)', label: 'Pagamento falhou' };
    if (st === 'cancelled') return { dot: 'rgb(239 68 68)', label: 'Pedido cancelado' };
    if (ps === 'pending') return { dot: 'rgb(251 146 60)', label: 'Pagamento pendente' };
    if (ps === 'paid') {
      if (st === 'delivered') return { dot: 'rgb(34 197 94)', label: 'Entregue' };
      return { dot: 'rgb(34 197 94)', label: 'Pagamento aprovado' };
    }
    return { dot: 'rgb(148 163 184)', label: st || ps || 'Em andamento' };
  }

  function gatewayLabel(o) {
    var m = o.metadata && typeof o.metadata === 'object' ? o.metadata : {};
    if (m.gateway_display) return String(m.gateway_display);
    if (m.gateway) return String(m.gateway);
    var pm = String(o.payment_method || 'pix').toUpperCase();
    return pm === 'PIX' ? 'PIX' : pm;
  }

  function couponLabel(o) {
    if (o.promo_code) return escapeHtml(o.promo_code);
    var m = o.metadata && typeof o.metadata === 'object' ? o.metadata : {};
    if (m.promo_code) return escapeHtml(String(m.promo_code));
    if (m.coupon_code) return escapeHtml(String(m.coupon_code));
    if (o.affiliate_code) return escapeHtml(String(o.affiliate_code));
    return '';
  }

  function renderOrderCard(o) {
    var num = escapeHtml(String(o.order_number || o.id || ''));
    var stInfo = displayStatus(o);
    var orderStatus = String(o.status || '').toLowerCase();
    var total = fmtMoney(o.total);
    var when = formatWhen(o.created_at);
    var gw = escapeHtml(gatewayLabel(o));
    var items = Array.isArray(o.items) ? o.items.length : 0;
    var cup = couponLabel(o);
    var cupHtml = cup
      ? '<span class="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-medium">' + cup + '</span>'
      : '<span class="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-medium">Nenhum</span>';

    var actions = '';
    var pm = String(o.payment_method || '').toLowerCase();
    var ps = String(o.payment_status || '').toLowerCase();
    if (pm === 'pix' && ps === 'pending') {
      actions =
        '<a href="' +
        escapeHtml(shopHref('/payment/' + encodeURIComponent(o.order_number || String(o.id)))) +
        '" class="btn-primary w-full md:w-auto">' +
        '<i class="ph ph-qr-code size-5" aria-hidden="true"></i> Continuar pagamento</a>';
    } else if (ps === 'paid' || orderStatus === 'delivered') {
      actions =
        '<a href="' +
        escapeHtml(shopHref('/order/' + encodeURIComponent(o.order_number || String(o.id)))) +
        '" class="btn-outline w-full md:w-auto">' +
        '<i class="ph ph-eye size-5" aria-hidden="true"></i> Ver detalhes</a>';
    }

    return (
      '<div class="border border-foreground/10 rounded-cc p-6 transition-colors bg-muted backdrop-blur-sm">' +
      '<div class="flex items-center justify-between mb-4">' +
      '<div class="flex items-center gap-3">' +
      '<div class="w-3 h-3 rounded-full shrink-0" style="background-color:' +
      stInfo.dot +
      '"></div>' +
      '<div><span class="font-medium text-sm sm:text-base">' +
      escapeHtml(stInfo.label) +
      '</span>' +
      '<p class="text-xs sm:text-sm text-muted-foreground">#' +
      num +
      '</p></div></div>' +
      '<div class="text-right">' +
      '<p class="font-bold text-base sm:text-lg">' +
      total +
      '</p>' +
      '<p class="text-xs sm:text-sm text-muted-foreground">' +
      escapeHtml(when) +
      '</p></div></div>' +
      '<div class="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">' +
      '<div class="flex gap-4 md:gap-8 flex-wrap flex-1">' +
      '<div class="flex items-center gap-2 text-sm">' +
      '<i class="ph ph-credit-card text-muted-foreground size-4" aria-hidden="true"></i>' +
      '<span class="text-muted-foreground">Pagamento:</span>' +
      '<span class="font-medium whitespace-nowrap">' +
      gw +
      '</span></div>' +
      '<div class="flex items-center gap-2 text-sm">' +
      '<i class="ph ph-package text-muted-foreground size-4" aria-hidden="true"></i>' +
      '<span class="text-muted-foreground">Itens:</span>' +
      '<span class="font-medium">' +
      items +
      ' item' +
      (items !== 1 ? 's' : '') +
      '</span></div>' +
      '<div class="flex items-center gap-2 text-sm">' +
      '<i class="ph ph-tag text-muted-foreground size-4" aria-hidden="true"></i>' +
      '<span class="text-muted-foreground">Cupom:</span> ' +
      cupHtml +
      '</div></div>' +
      (actions ? '<div class="flex justify-end w-full md:w-auto">' + actions + '</div>' : '') +
      '</div></div>'
    );
  }

  function setView(mode) {
    loadingEl.classList.toggle('hidden', mode !== 'loading');
    guestEl.classList.toggle('hidden', mode !== 'guest');
    emptyEl.classList.toggle('hidden', mode !== 'empty');
    listEl.classList.toggle('hidden', mode !== 'list');
  }

  async function load() {
    setView('loading');
    listEl.innerHTML = '';

    if (!token() || !apiSub()) {
      setView('guest');
      return;
    }

    try {
      var res = await fetch(window.location.origin + '/api/public/customer/my-orders', {
        headers: {
          Authorization: 'Bearer ' + token(),
          'X-Store-Subdomain': apiSub(),
          Accept: 'application/json',
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('orders');
      var orders = await res.json();
      if (!Array.isArray(orders) || orders.length === 0) {
        setView('empty');
      } else {
        listEl.innerHTML = '<div class="space-y-4">' + orders.map(renderOrderCard).join('') + '</div>';
        setView('list');
      }
    } catch (err) {
      setView('empty');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
  window.addEventListener('customerUpdated', load);
})();
