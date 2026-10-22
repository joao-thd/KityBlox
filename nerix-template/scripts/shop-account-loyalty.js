/**
 * Painel de fidelidade da loja Liquid: dados vêm de GET /api/public/loyalty.
 */
(function () {
  'use strict';

  var root = document.getElementById('loyalty-dashboard-root');
  if (!root) return;

  function storageSub() {
    return (window.NERIX && window.NERIX.shopSubdomain) || (window.NERIX && window.NERIX.storeParam) || '';
  }

  function apiSub() {
    return (window.NERIX && window.NERIX.shopSubdomain) || '';
  }

  function customerToken() {
    var s = storageSub();
    if (!s) return '';
    try {
      return localStorage.getItem('customer_token_' + s) || '';
    } catch (e) {
      return '';
    }
  }

  function headers() {
    var h = { Accept: 'application/json', 'Content-Type': 'application/json' };
    var t = customerToken();
    var sub = apiSub();
    if (t) h['Authorization'] = 'Bearer ' + t;
    if (sub) h['X-Store-Subdomain'] = sub;
    return h;
  }

  function shopHref(path) {
    return typeof shopUrl === 'function' ? shopUrl(path) : path;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function fmtMoney(v) {
    var n = parseFloat(String(v || 0));
    if (!isFinite(n)) n = 0;
    return 'R$ ' + n.toFixed(2).replace('.', ',');
  }

  function fmtDate(value) {
    try {
      if (!value) return '-';
      return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
    } catch (e) {
      return '-';
    }
  }

  var TX_LABELS = {
    earn_points: 'Pontos ganhos',
    redeem_points_for_credit: 'Conversão em saldo',
    convert_credit_to_points: 'Conversão em pontos',
    topup_credit: 'Recarga de saldo',
    spend_credit: 'Saldo usado em compra',
    refund_credit: 'Reembolso de saldo',
    expire_points: 'Pontos expirados',
    manual_adjustment: 'Ajuste do lojista',
  };

  function renderHistory(history) {
    if (!history || !history.length) {
      return '<div class="text-center py-10"><p class="text-sm text-muted-foreground">Nenhuma movimentação ainda.</p></div>';
    }
    var html = '<div class="divide-y divide-white/10">';
    for (var i = 0; i < history.length; i++) {
      var tx = history[i];
      var pointsPart = tx.points_delta ? '<span class="' + (tx.points_delta > 0 ? 'text-emerald-400' : 'text-red-400') + '">' + (tx.points_delta > 0 ? '+' : '') + tx.points_delta + ' pts</span>' : '';
      var creditPart = tx.credit_delta ? '<span class="' + (tx.credit_delta > 0 ? 'text-emerald-400' : 'text-red-400') + '">' + (tx.credit_delta > 0 ? '+' : '') + fmtMoney(tx.credit_delta) + '</span>' : '';
      html +=
        '<div class="flex flex-wrap items-center justify-between gap-2 py-3 text-sm first:pt-0">' +
        '<div class="min-w-0">' +
        '<p class="font-medium text-foreground">' + escapeHtml(tx.description || TX_LABELS[tx.type] || tx.type) + '</p>' +
        '<p class="text-[11px] text-muted-foreground">' + escapeHtml(fmtDate(tx.created_at)) + '</p>' +
        '</div>' +
        '<div class="flex items-center gap-3 text-sm font-semibold">' + pointsPart + creditPart + '</div>' +
        '</div>';
    }
    return html + '</div>';
  }

  function closeTopupModal() {
    var modal = document.getElementById('loyalty-topup-modal');
    if (modal) modal.remove();
  }

  function computeTopupBonus(amount, topup) {
    if (!topup || !topup.bonus_enabled || !isFinite(amount) || amount <= 0) return 0;
    if (topup.bonus_type === 'fixed') return Math.max(0, Number(topup.bonus_value) || 0);
    return Math.round(amount * ((Number(topup.bonus_value) || 0) / 100) * 100) / 100;
  }

  function openTopupModal(data) {
    closeTopupModal();
    var suggested = data.topup.suggested_amounts || [];
    var chips = suggested
      .map(function (v) {
        return '<button type="button" class="loyalty-topup-chip btn-outline h-9 px-3" data-amount="' + v + '">' + fmtMoney(v) + '</button>';
      })
      .join('');

    var wrapper = document.createElement('div');
    wrapper.id = 'loyalty-topup-modal';
    wrapper.className = 'fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4';
    wrapper.innerHTML =
      '<div class="w-full max-w-sm rounded-cc border border-white/10 bg-background p-5">' +
      '<div class="flex items-center justify-between mb-4"><h3 class="text-lg font-semibold text-foreground">Recarregar saldo</h3>' +
      '<button type="button" id="loyalty-topup-close" class="text-muted-foreground hover:text-foreground"><i class="ph ph-x size-5" aria-hidden="true"></i></button></div>' +
      '<div id="loyalty-topup-body">' +
      '<div class="flex flex-wrap gap-2 mb-3">' + chips + '</div>' +
      '<label class="block mb-3"><span class="text-xs font-medium text-muted-foreground mb-1 block">Ou outro valor (R$)</span>' +
      '<input id="loyalty-topup-amount" type="number" min="' + (data.topup.min_amount || 1) + '" class="h-10 w-full rounded-cc border border-white/10 bg-background/70 px-3 text-sm text-foreground outline-none focus:border-primary" placeholder="' + (data.topup.min_amount || 10) + '" /></label>' +
      (data.topup.bonus_enabled ? '<p id="loyalty-topup-bonus-preview" class="text-xs text-emerald-400 mb-3 min-h-[1rem]"></p>' : '') +
      '<button type="button" id="loyalty-topup-submit" class="btn-primary h-10 w-full">Gerar Pix</button>' +
      '</div></div>';
    document.body.appendChild(wrapper);

    document.getElementById('loyalty-topup-close').addEventListener('click', closeTopupModal);
    wrapper.addEventListener('click', function (e) {
      if (e.target === wrapper) closeTopupModal();
    });

    var amountInput = document.getElementById('loyalty-topup-amount');
    var bonusPreview = document.getElementById('loyalty-topup-bonus-preview');

    function updateBonusPreview() {
      if (!bonusPreview) return;
      var amount = parseFloat(amountInput.value);
      var bonus = computeTopupBonus(amount, data.topup);
      bonusPreview.textContent = bonus > 0
        ? '+ ' + fmtMoney(bonus) + ' de bônus — você recebe ' + fmtMoney(amount + bonus) + ' de saldo'
        : '';
    }
    if (amountInput) amountInput.addEventListener('input', updateBonusPreview);

    wrapper.querySelectorAll('.loyalty-topup-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        amountInput.value = chip.getAttribute('data-amount');
        updateBonusPreview();
      });
    });

    document.getElementById('loyalty-topup-submit').addEventListener('click', async function () {
      var amount = parseFloat(amountInput.value);
      if (!isFinite(amount) || amount < (data.topup.min_amount || 1)) {
        if (typeof toast !== 'undefined' && toast.error) toast.error('Valor mínimo é ' + fmtMoney(data.topup.min_amount || 1));
        return;
      }
      var body = document.getElementById('loyalty-topup-body');
      body.innerHTML = '<div class="flex justify-center py-10"><div class="size-8 border-2 border-white/20 border-t-primary rounded-full animate-spin"></div></div>';
      try {
        var res = await fetch(window.location.origin + '/api/public/loyalty/topup', {
          method: 'POST',
          headers: headers(),
          credentials: 'include',
          body: JSON.stringify({ amount: amount }),
        });
        var payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Erro ao gerar Pix');
        renderTopupPix(payload);
      } catch (err) {
        if (typeof toast !== 'undefined' && toast.error) toast.error(err.message || 'Erro ao gerar Pix');
        closeTopupModal();
      }
    });
  }

  function renderTopupPix(payload) {
    var body = document.getElementById('loyalty-topup-body');
    if (!body) return;
    var pix = payload.payment || {};
    var qrImg = pix.qr_code_base64
      ? (String(pix.qr_code_base64).indexOf('data:') === 0 ? pix.qr_code_base64 : 'data:image/png;base64,' + pix.qr_code_base64)
      : '';

    body.innerHTML =
      '<p class="text-sm text-muted-foreground mb-3">Pague ' + fmtMoney(payload.total) + ' via Pix pra creditar seu saldo.</p>' +
      (qrImg ? '<img src="' + qrImg + '" alt="QR Code Pix" class="mx-auto mb-3 w-48 h-48 rounded-lg border border-white/10" />' : '') +
      '<textarea readonly class="w-full h-20 rounded-cc border border-white/10 bg-background/70 px-3 py-2 text-xs text-foreground mb-3" onclick="this.select()">' + escapeHtml(pix.qr_code || '') + '</textarea>' +
      '<button type="button" id="loyalty-topup-copy" class="btn-outline h-9 w-full mb-2">Copiar código Pix</button>' +
      '<p id="loyalty-topup-status" class="text-center text-xs text-muted-foreground">Aguardando confirmação automática...</p>';

    var copyBtn = document.getElementById('loyalty-topup-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        try {
          navigator.clipboard.writeText(pix.qr_code || '');
          if (typeof toast !== 'undefined' && toast.success) toast.success('Código copiado!');
        } catch (e) {}
      });
    }

    var attempts = 0;
    var poll = setInterval(async function () {
      attempts += 1;
      if (attempts > 60 || !document.getElementById('loyalty-topup-status')) {
        clearInterval(poll);
        return;
      }
      try {
        var res = await fetch(window.location.origin + '/api/public/orders/' + encodeURIComponent(payload.order_number) + '/check-payment', {
          method: 'POST',
          headers: headers(),
          credentials: 'include',
        });
        var body2 = await res.json();
        if (body2 && body2.paid) {
          clearInterval(poll);
          var statusEl = document.getElementById('loyalty-topup-status');
          if (statusEl) statusEl.textContent = 'Saldo creditado!';
          if (typeof toast !== 'undefined' && toast.success) toast.success('Saldo creditado com sucesso!');
          setTimeout(function () {
            closeTopupModal();
            load();
          }, 1200);
        }
      } catch (e) {}
    }, 4000);
  }

  function renderDashboard(data) {
    var currency = data.currency || { name: 'Moedas', icon: '⭐', color: '#f5b400' };

    var actionsHtml =
      '<div class="flex flex-wrap gap-2 mt-4">' +
      (data.points_balance >= (data.redemption.min_points_redeemable || 0) && data.redemption.min_points_redeemable > 0
        ? '<button type="button" id="loyalty-redeem-btn" class="btn-outline h-9 px-4">Converter pontos em saldo</button>'
        : '') +
      (data.redemption.credit_to_points_enabled && Number(data.credit_balance) > 0
        ? '<button type="button" id="loyalty-convert-credit-btn" class="btn-outline h-9 px-4">Converter saldo em pontos</button>'
        : '') +
      (data.topup && data.topup.enabled ? '<button type="button" id="loyalty-topup-btn" class="btn-primary h-9 px-4">Recarregar saldo</button>' : '') +
      '</div>';

    root.innerHTML =
      '<div class="space-y-6">' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
      '<div class="rounded-cc border border-white/10 p-5 bg-muted/50 backdrop-blur-sm">' +
      '<p class="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">' +
      (currency.icon_url
        ? '<img src="' + escapeHtml(currency.icon_url) + '" alt="" class="size-4 rounded-full object-cover" />'
        : escapeHtml(currency.icon)) +
      ' ' + escapeHtml(currency.name) + '</p>' +
      '<p class="text-2xl font-bold text-foreground">' + Number(data.points_balance || 0).toLocaleString('pt-BR') + '</p>' +
      '</div>' +
      '<div class="rounded-cc border border-white/10 p-5 bg-muted/50 backdrop-blur-sm">' +
      '<p class="text-xs text-muted-foreground mb-1">Saldo disponível</p>' +
      '<p class="text-2xl font-bold text-foreground">' + fmtMoney(data.credit_balance) + '</p>' +
      '</div>' +
      '</div>' +
      actionsHtml +
      '<div class="rounded-cc border border-white/10 bg-muted/50 backdrop-blur-sm">' +
      '<div class="px-5 py-3 border-b border-white/10"><h2 class="text-sm font-semibold text-foreground">Histórico</h2></div>' +
      '<div class="p-5">' + renderHistory(data.history) + '</div>' +
      '</div>' +
      '</div>';

    var redeemBtn = document.getElementById('loyalty-redeem-btn');
    if (redeemBtn) {
      redeemBtn.addEventListener('click', async function () {
        try {
          var res = await fetch(window.location.origin + '/api/public/loyalty/redeem', {
            method: 'POST',
            headers: headers(),
            credentials: 'include',
            body: JSON.stringify({ points: data.points_balance }),
          });
          var body = await res.json();
          if (!res.ok) throw new Error(body.error || 'Erro ao converter pontos');
          if (typeof toast !== 'undefined' && toast.success) toast.success('Pontos convertidos em saldo!');
          load();
        } catch (err) {
          if (typeof toast !== 'undefined' && toast.error) toast.error(err.message || 'Erro ao converter pontos');
        }
      });
    }

    var convertCreditBtn = document.getElementById('loyalty-convert-credit-btn');
    if (convertCreditBtn) {
      convertCreditBtn.addEventListener('click', async function () {
        try {
          var res = await fetch(window.location.origin + '/api/public/loyalty/convert-to-points', {
            method: 'POST',
            headers: headers(),
            credentials: 'include',
            body: JSON.stringify({ amount: data.credit_balance }),
          });
          var body = await res.json();
          if (!res.ok) throw new Error(body.error || 'Erro ao converter saldo');
          if (typeof toast !== 'undefined' && toast.success) toast.success('Saldo convertido em pontos!');
          load();
        } catch (err) {
          if (typeof toast !== 'undefined' && toast.error) toast.error(err.message || 'Erro ao converter saldo');
        }
      });
    }

    var topupBtn = document.getElementById('loyalty-topup-btn');
    if (topupBtn) {
      topupBtn.addEventListener('click', function () {
        openTopupModal(data);
      });
    }
  }

  function renderGuest() {
    root.innerHTML =
      '<div class="border border-white/10 rounded-cc p-8 bg-muted/50 text-center">' +
      '<p class="text-muted-foreground mb-4">Faça login para ver seu saldo e pontos.</p>' +
      '<a href="' + shopHref('/login') + '" class="btn-primary h-9 inline-flex">Entrar</a></div>';
  }

  function renderDisabled() {
    root.innerHTML =
      '<div class="border border-white/10 rounded-cc p-8 bg-muted/50 text-center">' +
      '<i class="ph ph-coins size-12 mx-auto mb-4 text-muted-foreground" aria-hidden="true"></i>' +
      '<p class="text-muted-foreground">Esta loja ainda não ativou o programa de fidelidade.</p></div>';
  }

  function renderError(msg) {
    root.innerHTML =
      '<div class="border border-red-500/30 rounded-cc p-6 bg-red-500/10 text-sm">' +
      escapeHtml(msg || 'Não foi possível carregar a fidelidade.') +
      '</div>';
  }

  async function load() {
    if (!customerToken()) {
      renderGuest();
      return;
    }

    root.innerHTML = '<div class="flex justify-center py-20"><div class="size-10 border-2 border-white/20 border-t-primary rounded-full animate-spin"></div></div>';

    try {
      var res = await fetch(window.location.origin + '/api/public/loyalty', { headers: headers(), credentials: 'include' });
      if (!res.ok) {
        var errBody = null;
        try {
          errBody = await res.json();
        } catch (e) {}
        throw new Error((errBody && errBody.error) || 'Erro ao carregar');
      }
      var data = await res.json();
      if (!data.enabled) {
        renderDisabled();
        return;
      }
      renderDashboard(data);
    } catch (err) {
      renderError(err.message || 'Erro de rede');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
  window.addEventListener('customerUpdated', load);
})();
