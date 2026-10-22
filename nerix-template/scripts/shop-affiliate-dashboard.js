/**
 * Painel de afiliado da loja Liquid: dados vêm de GET /api/public/affiliate/dashboard
 * (o tag `load 'affiliate'` no servidor não popula nada).
 */
(function () {
  'use strict';

  var root = document.getElementById('affiliate-dashboard-root');
  if (!root) return;

  var periodState = '7';

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
    var h = { Accept: 'application/json' };
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

  function parseMoneyInput(v) {
    var n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }

  function fmtDate(value) {
    try {
      if (!value) return '-';
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value));
    } catch (e) {
      return '-';
    }
  }

  function withdrawalStatusLabel(status) {
    if (status === 'approved') return 'Aprovado';
    if (status === 'rejected') return 'Recusado';
    if (status === 'processing') return 'Processando';
    return 'Pendente';
  }

  function withdrawalStatusTone(status) {
    if (status === 'approved') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (status === 'rejected') return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (status === 'processing') return 'text-[#E83E8C] bg-[#FF69B4]/10 border-[#FF69B4]/25';
    return 'text-amber-300 bg-amber-500/10 border-amber-500/20';
  }

  function buildRefLink(code) {
    var base = typeof shopUrl === 'function' ? shopUrl('/') : '/';
    var sep = base.indexOf('?') >= 0 ? '&' : '?';
    return base + sep + 'ref=' + encodeURIComponent(code);
  }

  function emptyBlock(icon, message) {
    return (
      '<div class="text-center py-12">' +
      '<i class="ph ph-' +
      icon +
      ' size-12 mx-auto mb-2 text-muted-foreground opacity-80" aria-hidden="true"></i>' +
      '<p class="text-sm text-muted-foreground">' +
      escapeHtml(message) +
      '</p></div>'
    );
  }

  function renderWithdrawalsList(withdrawals) {
    if (!withdrawals || !withdrawals.length) {
      return emptyBlock('wallet', 'Nenhum saque solicitado ainda');
    }

    var html = '<div class="divide-y divide-white/10">';
    for (var i = 0; i < Math.min(withdrawals.length, 6); i++) {
      var w = withdrawals[i];
      html +=
        '<div class="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">' +
        '<div class="min-w-0">' +
        '<p class="text-sm font-semibold text-foreground">' +
        escapeHtml(fmtMoney(w.amount)) +
        '</p>' +
        '<p class="text-xs text-muted-foreground truncate">PIX: ' +
        escapeHtml(w.pix_key || '-') +
        '</p>' +
        '<p class="text-[11px] text-muted-foreground">' +
        escapeHtml(fmtDate(w.created_at)) +
        '</p>' +
        (w.rejection_reason
          ? '<p class="mt-1 text-xs text-red-300">' + escapeHtml(w.rejection_reason) + '</p>'
          : '') +
        '</div>' +
        '<span class="inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ' +
        withdrawalStatusTone(w.status) +
        '">' +
        escapeHtml(withdrawalStatusLabel(w.status)) +
        '</span>' +
        '</div>';
    }
    return html + '</div>';
  }

  /** Conteúdo interno do card de gráfico (barras ou estado vazio). */
  function renderChartBody(series) {
    if (!series || !series.length) {
      return emptyBlock('chart-line-up', 'Nenhuma venda registrada ainda');
    }
    var slice = series.slice(-24);
    var max = 0.0001;
    var sum = 0;
    for (var i = 0; i < slice.length; i++) {
      var v = Number(slice[i].commission) || 0;
      max = Math.max(max, v);
      sum += v;
    }
    if (sum <= 0) {
      return emptyBlock('chart-line-up', 'Nenhuma venda registrada ainda');
    }
    var w = 100 / slice.length;
    var bars = '';
    for (var j = 0; j < slice.length; j++) {
      var c = Number(slice[j].commission) || 0;
      var h = Math.max(4, Math.round((c / max) * 120));
      var label = String(slice[j].date || '').slice(5).replace('-', '/');
      bars +=
        '<div class="flex flex-col items-center justify-end flex-1 min-w-0" style="width:' +
        w +
        '%">' +
        '<div class="w-full max-w-[14px] mx-auto rounded-t-md bg-gradient-to-t from-primary/90 to-primary/50" style="height:' +
        h +
        'px" title="' +
        escapeHtml(fmtMoney(c)) +
        '"></div>' +
        '<span class="text-[9px] text-muted-foreground mt-1 truncate w-full text-center">' +
        escapeHtml(label) +
        '</span>' +
        '</div>';
    }
    return (
      '<div class="flex items-end gap-0.5 sm:gap-1 h-44 px-1 border border-white/10 rounded-cc bg-background/30">' +
      bars +
      '</div>'
    );
  }

  function cardShell(headerClass, headerInner, bodyHtml) {
    return (
      '<div class="rounded-cc border border-white/10 bg-muted/50 backdrop-blur-sm">' +
      '<div class="' +
      headerClass +
      ' border-b border-white/10">' +
      headerInner +
      '</div>' +
      '<div class="p-5">' +
      bodyHtml +
      '</div></div>'
    );
  }

  function fmtPercent(v) {
    var n = Number(v || 0);
    return (Number.isInteger(n) ? n : n.toFixed(2)) + '%';
  }

  /** Card "Seu nível" — só aparece se a loja tiver ativado níveis de comissão progressivos. */
  function tierCard(tier) {
    if (!tier || !tier.enabled) return '';
    var current = tier.current_tier;
    var next = tier.next_tier;
    var progress = Math.max(0, Math.min(100, Number(tier.progress_pct || 0)));

    var body =
      '<div class="space-y-3">' +
      '<div class="flex flex-wrap items-baseline justify-between gap-2">' +
      '<p class="text-2xl font-bold text-foreground">' +
      escapeHtml(current && current.label ? current.label : 'Comissão atual') +
      '</p>' +
      '<p class="text-sm text-muted-foreground">Taxa: <span class="font-semibold text-foreground">' +
      fmtPercent(tier.current_rate) +
      '</span></p></div>' +
      (next
        ? '<div>' +
          '<div class="h-2 w-full overflow-hidden rounded-full bg-white/10">' +
          '<div class="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary" style="width:' +
          progress.toFixed(1) +
          '%"></div></div>' +
          '<p class="mt-1.5 text-xs text-muted-foreground">Faltam ' +
          escapeHtml(fmtMoney(tier.remaining_to_next)) +
          ' em vendas para subir pra ' +
          escapeHtml(next.label || fmtPercent(next.commission_rate)) +
          '</p></div>'
        : '<p class="text-xs text-muted-foreground">Você está no nível mais alto disponível.</p>') +
      '</div>';

    return cardShell(
      'p-5',
      headerWithIcon('trophy', 'Seu nível de comissão') +
        '<p class="text-xs mt-1 text-muted-foreground">Faturamento acumulado gerado: ' +
        escapeHtml(fmtMoney(tier.total_sales_amount)) +
        '</p>',
      body
    );
  }

  /** Grid de materiais de divulgação — só aparece se o lojista tiver cadastrado algum. */
  function materialsCard(materials) {
    if (!materials || !materials.enabled || !materials.materials || !materials.materials.length) return '';

    var grid = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">';
    for (var i = 0; i < materials.materials.length; i++) {
      var m = materials.materials[i];
      var isImage = m.type === 'image' && m.image_url;
      var thumb = isImage
        ? '<img src="' +
          escapeHtml(m.image_url) +
          '" class="h-32 w-full object-cover rounded-t-cc" alt="" loading="lazy" referrerpolicy="no-referrer"/>'
        : '<div class="h-32 w-full flex items-center justify-center bg-background/40 rounded-t-cc"><i class="ph ph-link size-8 text-muted-foreground" aria-hidden="true"></i></div>';
      var actionHref = isImage ? m.image_url : m.link_url;

      grid +=
        '<div class="overflow-hidden rounded-cc border border-white/10 bg-background/30">' +
        thumb +
        '<div class="p-3">' +
        '<p class="text-sm font-semibold text-foreground truncate">' +
        escapeHtml(m.title) +
        '</p>' +
        (m.description
          ? '<p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">' + escapeHtml(m.description) + '</p>'
          : '') +
        '<a href="' +
        escapeHtml(actionHref || '#') +
        '" target="_blank" rel="noreferrer" class="btn-outline h-8 px-3 text-xs mt-2.5 inline-flex items-center gap-1.5">' +
        '<i class="ph ph-' +
        (isImage ? 'download-simple' : 'arrow-square-out') +
        ' size-3.5" aria-hidden="true"></i>' +
        (isImage ? 'Baixar' : 'Abrir link') +
        '</a></div></div>';
    }
    grid += '</div>';

    return cardShell(
      'p-5',
      headerWithIcon('image', 'Materiais de divulgação') +
        '<p class="text-xs mt-1 text-muted-foreground">Banners e links prontos pra usar na divulgação.</p>',
      grid
    );
  }

  /** Ranking do concurso ativo — só aparece se o lojista tiver ativado um concurso. */
  function contestCard(contest) {
    if (!contest || !contest.enabled) return '';

    var prizesHtml = '';
    if (contest.prizes && contest.prizes.length) {
      prizesHtml = '<div class="mb-3 flex flex-wrap gap-2">';
      for (var p = 0; p < contest.prizes.length; p++) {
        prizesHtml +=
          '<span class="inline-flex items-center gap-1 rounded-full border border-white/10 bg-background/40 px-2.5 py-1 text-[11px] text-foreground">' +
          '<i class="ph ph-trophy size-3 text-amber-400" aria-hidden="true"></i>' +
          escapeHtml(contest.prizes[p].rank + 'º · ' + contest.prizes[p].description) +
          '</span>';
      }
      prizesHtml += '</div>';
    }

    var rows = contest.leaderboard || [];
    var rowsHtml;
    if (!rows.length) {
      rowsHtml = emptyBlock('trophy', 'Ninguém pontuou ainda neste período');
    } else {
      rowsHtml = '<div class="divide-y divide-white/10">';
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var valueDisplay =
          row.value === null
            ? '•••'
            : contest.metric === 'sales_count'
              ? row.value + ' vendas'
              : fmtMoney(row.value);
        rowsHtml +=
          '<div class="flex items-center justify-between gap-3 py-2.5 first:pt-0">' +
          '<div class="flex items-center gap-2.5 min-w-0">' +
          '<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ' +
          (row.is_self ? 'bg-primary/20 text-primary' : 'bg-white/10 text-muted-foreground') +
          '">' +
          row.rank +
          '</span>' +
          '<span class="text-sm font-medium text-foreground truncate">' +
          escapeHtml(row.name) +
          (row.is_self ? ' (você)' : '') +
          '</span></div>' +
          '<span class="text-sm font-semibold tabular-nums text-foreground shrink-0">' +
          escapeHtml(valueDisplay) +
          '</span></div>';
      }
      rowsHtml += '</div>';
    }

    var selfSummary =
      contest.self_rank != null
        ? '<p class="text-xs mt-1 text-muted-foreground">Sua posição: <span class="text-foreground font-semibold">#' +
          contest.self_rank +
          '</span></p>'
        : '';

    return cardShell(
      'p-5',
      headerWithIcon('trophy', contest.name || 'Concurso de afiliados') + selfSummary,
      prizesHtml + rowsHtml
    );
  }

  function headerWithIcon(icon, title) {
    return (
      '<div class="flex items-center gap-2 mb-1">' +
      '<i class="ph ph-' +
      icon +
      ' size-5 text-muted-foreground shrink-0" aria-hidden="true"></i>' +
      '<h2 class="text-lg font-semibold text-foreground">' +
      escapeHtml(title) +
      '</h2></div>'
    );
  }

  function renderDashboard(d) {
    function metricCard(title, val) {
      return (
        '<div class="border border-white/10 rounded-cc p-4 bg-background/30">' +
        '<p class="text-xs text-muted-foreground mb-1">' +
        escapeHtml(title) +
        '</p>' +
        '<p class="text-lg font-semibold text-foreground">' +
        val +
        '</p></div>'
      );
    }

    var a = d.affiliate || {};
    var st = d.stats || {};
    var code = a.code || '';
    var link = buildRefLink(code);
    var firstName = escapeHtml((a.name || 'Afiliado').split(' ')[0]);
    var storeName = escapeHtml(d.store_name || 'Loja');

    var topProducts = d.top_products || [];
    var topProductsBody = '';
    if (topProducts.length) {
      topProductsBody = '<div class="divide-y divide-white/10">';
      for (var t = 0; t < Math.min(topProducts.length, 5); t++) {
        var p = topProducts[t];
        var imgUrl = p.image ? String(p.image) : '';
        var thumb = imgUrl
          ? '<img src="' +
            escapeHtml(imgUrl) +
            '" class="size-12 rounded-md object-cover shrink-0 border border-white/10" alt="" loading="lazy" referrerpolicy="no-referrer"/>'
          : '<div class="size-12 rounded-md bg-white/5 border border-white/10 shrink-0 flex items-center justify-center"><i class="ph ph-package size-6 text-muted-foreground" aria-hidden="true"></i></div>';
        topProductsBody +=
          '<div class="flex items-center gap-3 py-3 first:pt-0">' +
          thumb +
          '<div class="min-w-0 flex-1">' +
          '<p class="font-medium text-sm text-foreground truncate">' +
          escapeHtml(p.name) +
          '</p>' +
          '<p class="text-xs text-muted-foreground">' +
          (p.sales_count || 0) +
          ' vendas</p></div></div>';
      }
      topProductsBody += '</div>';
    } else {
      topProductsBody = emptyBlock('package', 'Nenhum produto vendido ainda');
    }

    var recent = d.recent_sales || [];
    var recentBody = '';
    if (recent.length) {
      recentBody = '<div class="divide-y divide-white/10">';
      for (var r = 0; r < recent.length; r++) {
        var s = recent[r];
        var stLabel = s.status === 'paid' ? 'Pago' : s.status === 'pending' ? 'Pendente' : String(s.status || '');
        recentBody +=
          '<div class="flex flex-wrap items-center justify-between gap-2 py-3 text-sm first:pt-0">' +
          '<span class="font-medium text-foreground">#' +
          escapeHtml(String(s.order_number || '')) +
          '</span>' +
          '<span class="text-muted-foreground">' +
          fmtMoney(s.commission) +
          '</span>' +
          '<span class="text-xs text-muted-foreground">' +
          escapeHtml(stLabel) +
          '</span></div>';
      }
      recentBody += '</div>';
    } else {
      recentBody = emptyBlock('cube', 'Nenhuma venda realizada ainda');
    }

    var periodLabel =
      periodState === '7'
        ? '7 dias'
        : periodState === '30'
          ? '30 dias'
          : periodState === '90'
            ? '90 dias'
            : 'Todo o período';

    var chartSubtitle =
      periodState === '7'
        ? 'Gráfico de comissões nos últimos 7 dias'
        : periodState === '30'
          ? 'Gráfico de comissões nos últimos 30 dias'
          : periodState === '90'
            ? 'Gráfico de comissões nos últimos 90 dias'
            : 'Gráfico de comissões em todo o período';

    var chartCard = cardShell(
      'p-5',
      headerWithIcon('chart-line-up', 'Vendas e Comissões') +
        '<p class="text-xs mt-1 text-muted-foreground">' +
        escapeHtml(chartSubtitle) +
        '</p>',
      renderChartBody(d.sales_chart || [])
    );

    var productsCard = cardShell(
      'p-5',
      headerWithIcon('package', '5 produtos populares') +
        '<p class="text-xs mt-1 text-muted-foreground">Os produtos que mais vendem pelo seu link de afiliado.</p>',
      topProductsBody
    );

    var transactionsCard =
      '<div class="rounded-cc border border-white/10 bg-muted/50 backdrop-blur-sm">' +
      '<div class="px-3 py-3 border-b border-white/10">' +
      '<h2 class="text-sm font-semibold text-foreground">Transações</h2>' +
      '</div>' +
      '<div class="p-5">' +
      recentBody +
      '</div></div>';

    var linkCard = cardShell(
      'p-5',
      headerWithIcon('link', 'Seu link de afiliado') +
        '<p class="text-xs mt-1 text-muted-foreground">Compartilhe para ganhar comissão nesta loja.</p>' +
        '<p class="text-xs text-muted-foreground mt-2">Visitas (7 dias): <span class="text-foreground font-medium">' +
        (st.recent_visits != null ? st.recent_visits : 0) +
        '</span> · Visitas totais: <span class="text-foreground font-medium">' +
        (st.visits != null ? st.visits : 0) +
        '</span></p>',
      '<div class="flex flex-col sm:flex-row gap-2">' +
      '<input readonly class="flex-1 h-10 bg-background/60 border border-white/10 rounded-cc px-3 text-xs sm:text-sm text-foreground" value="' +
      escapeHtml(link) +
      '" id="affiliate-ref-link-input"/>' +
      '<button type="button" class="btn-primary h-10 px-4 shrink-0" id="affiliate-copy-link-btn">Copiar</button>' +
      '</div>'
    );

    var minimumWithdrawal = Number(d.minimum_withdrawal || 50);
    var availableBalance = Number(st.available_balance || a.available_balance || 0);
    var canWithdraw = availableBalance >= minimumWithdrawal;
    var withdrawalsCard = cardShell(
      'p-5',
      headerWithIcon('wallet', 'Saques de afiliado') +
        '<p class="text-xs mt-1 text-muted-foreground">Solicite a retirada do saldo disponível. O lojista aprova pelo painel.</p>',
      '<div class="space-y-4">' +
        '<div class="flex flex-col gap-3 rounded-cc border border-white/10 bg-background/30 p-4 sm:flex-row sm:items-center sm:justify-between">' +
          '<div>' +
            '<p class="text-xs text-muted-foreground">Disponível para saque</p>' +
            '<p class="text-2xl font-bold text-foreground">' + fmtMoney(availableBalance) + '</p>' +
            '<p class="text-xs text-muted-foreground">Mínimo: ' + fmtMoney(minimumWithdrawal) + '</p>' +
          '</div>' +
          '<button type="button" id="affiliate-toggle-withdrawal-form" class="btn-primary h-10 px-4 shrink-0 ' +
          (canWithdraw ? '' : 'opacity-60 cursor-not-allowed') +
          '" ' +
          (canWithdraw ? '' : 'disabled') +
          '>Solicitar saque</button>' +
        '</div>' +
        '<form id="affiliate-withdrawal-form" class="hidden rounded-cc border border-white/10 bg-background/30 p-4">' +
          '<div class="grid gap-3 sm:grid-cols-2">' +
            '<div>' +
              '<label class="mb-1.5 block text-xs font-semibold text-muted-foreground">Valor</label>' +
              '<input id="affiliate-withdrawal-amount" class="h-10 w-full rounded-cc border border-white/10 bg-background/70 px-3 text-sm text-foreground outline-none focus:border-primary" placeholder="' +
              escapeHtml(fmtMoney(minimumWithdrawal)) +
              '" inputmode="decimal" />' +
            '</div>' +
            '<div>' +
              '<label class="mb-1.5 block text-xs font-semibold text-muted-foreground">Chave PIX</label>' +
              '<input id="affiliate-withdrawal-pix" class="h-10 w-full rounded-cc border border-white/10 bg-background/70 px-3 text-sm text-foreground outline-none focus:border-primary" placeholder="CPF, e-mail, telefone ou chave aleatória" />' +
            '</div>' +
          '</div>' +
          '<div class="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">' +
            '<button type="button" id="affiliate-cancel-withdrawal" class="btn-outline h-9 px-4">Cancelar</button>' +
            '<button type="submit" id="affiliate-submit-withdrawal" class="btn-primary h-9 px-4">Enviar solicitação</button>' +
          '</div>' +
        '</form>' +
        '<div>' +
          '<h3 class="mb-2 text-sm font-semibold text-foreground">Histórico de saques</h3>' +
          renderWithdrawalsList(d.withdrawals || []) +
        '</div>' +
      '</div>'
    );

    root.innerHTML =
      '<div class="space-y-6">' +
      '<div class="rounded-cc border border-white/10 p-6 bg-muted/50 backdrop-blur-sm">' +
      '<h2 class="text-xl sm:text-2xl font-bold text-foreground mb-1">Olá, ' +
      firstName +
      '!</h2>' +
      '<p class="text-sm text-muted-foreground">Painel de afiliados da loja <span class="font-semibold text-foreground">' +
      storeName +
      '</span></p></div>' +
      '<div class="flex flex-wrap items-center gap-2">' +
      '<div class="flex rounded-lg border border-white/10 overflow-hidden text-sm">' +
      ['7', '30', '90', 'all']
        .map(function (p) {
          return (
            '<button type="button" class="affiliate-period-btn px-3 py-2 transition hover:bg-white/10 ' +
            (periodState === p ? 'bg-white/15 font-semibold text-foreground' : 'bg-transparent text-foreground/90') +
            '" data-period="' +
            p +
            '">' +
            (p === 'all' ? 'Tudo' : p + 'd') +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '<span class="text-xs text-muted-foreground">Período: ' +
      escapeHtml(periodLabel) +
      '</span>' +
      '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">' +
      metricCard('Carteira', fmtMoney(st.available_balance)) +
      metricCard('Comissão', String(a.commission_rate != null ? a.commission_rate : 0) + '%') +
      metricCard('Vendas (total)', String(st.sales != null ? st.sales : 0)) +
      metricCard('Comissão no período', fmtMoney(st.period_commission || 0)) +
      '</div>' +
      tierCard(d.commission_tier) +
      linkCard +
      withdrawalsCard +
      materialsCard(d.materials) +
      contestCard(d.contest) +
      chartCard +
      '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">' +
      productsCard +
      transactionsCard +
      '</div>' +
      '</div>';

    root.querySelectorAll('.affiliate-period-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = btn.getAttribute('data-period');
        if (p && p !== periodState) {
          periodState = p;
          load();
        }
      });
    });

    var copyBtn = document.getElementById('affiliate-copy-link-btn');
    var linkInput = document.getElementById('affiliate-ref-link-input');
    if (copyBtn && linkInput) {
      copyBtn.addEventListener('click', function () {
        linkInput.select();
        try {
          navigator.clipboard.writeText(linkInput.value);
          if (typeof toast !== 'undefined' && toast.success) toast.success('Link copiado!');
        } catch (e) {
          try {
            document.execCommand('copy');
            if (typeof toast !== 'undefined' && toast.success) toast.success('Copiado!');
          } catch (e2) {}
        }
      });
    }

    var toggleWithdrawal = document.getElementById('affiliate-toggle-withdrawal-form');
    var withdrawalForm = document.getElementById('affiliate-withdrawal-form');
    var cancelWithdrawal = document.getElementById('affiliate-cancel-withdrawal');
    if (toggleWithdrawal && withdrawalForm) {
      toggleWithdrawal.addEventListener('click', function () {
        withdrawalForm.classList.remove('hidden');
        var amountInput = document.getElementById('affiliate-withdrawal-amount');
        if (amountInput) amountInput.focus();
      });
    }
    if (cancelWithdrawal && withdrawalForm) {
      cancelWithdrawal.addEventListener('click', function () {
        withdrawalForm.classList.add('hidden');
      });
    }
    if (withdrawalForm) {
      withdrawalForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var amountInput = document.getElementById('affiliate-withdrawal-amount');
        var pixInput = document.getElementById('affiliate-withdrawal-pix');
        var submitBtn = document.getElementById('affiliate-submit-withdrawal');
        var amount = parseMoneyInput(amountInput && amountInput.value);
        var pixKey = pixInput && pixInput.value ? pixInput.value.trim() : '';

        if (amount < minimumWithdrawal) {
          if (typeof toast !== 'undefined' && toast.error) toast.error('O valor mínimo é ' + fmtMoney(minimumWithdrawal));
          return;
        }
        if (amount > availableBalance) {
          if (typeof toast !== 'undefined' && toast.error) toast.error('Saldo insuficiente para este saque.');
          return;
        }
        if (!pixKey) {
          if (typeof toast !== 'undefined' && toast.error) toast.error('Informe sua chave PIX.');
          return;
        }

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviando...';
          }
          var res = await fetch(window.location.origin + '/api/public/affiliate/withdrawals', {
            method: 'POST',
            headers: Object.assign({}, headers(), { 'Content-Type': 'application/json' }),
            credentials: 'include',
            body: JSON.stringify({ amount: amount, pix_key: pixKey }),
          });
          var body = null;
          try { body = await res.json(); } catch (e) {}
          if (!res.ok) throw new Error((body && body.error) || 'Erro ao solicitar saque');
          if (typeof toast !== 'undefined' && toast.success) toast.success('Saque solicitado com sucesso.');
          load();
        } catch (err) {
          if (typeof toast !== 'undefined' && toast.error) toast.error(err.message || 'Erro ao solicitar saque');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Enviar solicitacao';
          }
        }
      });
    }

  }

  function renderGuest() {
    root.innerHTML =
      '<div class="border border-white/10 rounded-cc p-8 bg-muted/50 text-center">' +
      '<p class="text-muted-foreground mb-4">Faça login para acessar o programa de afiliados.</p>' +
      '<a href="' +
      shopHref('/login') +
      '" class="btn-primary h-9 inline-flex">Entrar</a></div>';
  }

  function renderNotAffiliate(pending) {
    if (pending) {
      root.innerHTML =
        '<div class="border border-white/10 rounded-cc p-8 bg-muted/50 text-center">' +
        '<i class="ph ph-clock size-12 mx-auto mb-4 text-muted-foreground" aria-hidden="true"></i>' +
        '<h3 class="text-lg font-semibold mb-2">Solicitação em análise</h3>' +
        '<p class="text-muted-foreground text-sm max-w-md mx-auto">Sua solicitação de afiliação está pendente. Aguarde a aprovação da loja.</p></div>';
    } else {
      root.innerHTML =
        '<div class="border border-white/10 rounded-cc p-8 bg-muted/50 text-center">' +
        '<i class="ph ph-user-plus size-12 mx-auto mb-4 text-muted-foreground" aria-hidden="true"></i>' +
        '<h3 class="text-lg font-semibold mb-2">Programa de afiliados</h3>' +
        '<p class="text-muted-foreground text-sm max-w-md mx-auto mb-6">Torne-se afiliado desta loja e ganhe comissões nas vendas geradas pelo seu link.</p>' +
        '<button type="button" class="btn-primary h-9 inline-flex gap-2" onclick="openDialog(\'become-affiliate\')">' +
        '<i class="ph ph-user-plus size-4" aria-hidden="true"></i><span>Solicitar afiliação</span></button></div>';
    }
  }

  function renderError(msg) {
    root.innerHTML =
      '<div class="border border-red-500/30 rounded-cc p-6 bg-red-500/10 text-sm">' +
      escapeHtml(msg || 'Não foi possível carregar o painel.') +
      '</div>';
  }

  async function load() {

    if (!customerToken()) {
      renderGuest();
      return;
    }

    root.innerHTML =
      '<div class="flex justify-center py-20"><div class="size-10 border-2 border-white/20 border-t-primary rounded-full animate-spin"></div></div>';

    try {
      var res = await fetch(
        window.location.origin + '/api/public/affiliate/dashboard?period=' + encodeURIComponent(periodState),
        { headers: headers(), credentials: 'include' }
      );

      if (res.status === 404) {
        var st = await fetch(window.location.origin + '/api/public/affiliate/request-status', {
          headers: headers(),
          credentials: 'include',
        });
        var pending = false;
        if (st.ok) {
          try {
            var sj = await st.json();
            pending = sj && sj.status === 'pending';
          } catch (e) {}
        }
        renderNotAffiliate(pending);
        return;
      }

      if (!res.ok) {
        var errBody = null;
        try {
          errBody = await res.json();
        } catch (e) {}
        throw new Error((errBody && errBody.error) || 'Erro ao carregar');
      }

      var data = await res.json();
      try {
        var withdrawalsRes = await fetch(window.location.origin + '/api/public/affiliate/withdrawals', {
          headers: headers(),
          credentials: 'include',
        });
        data.withdrawals = withdrawalsRes.ok ? await withdrawalsRes.json() : [];
      } catch (e) {
        data.withdrawals = [];
      }
      try {
        var materialsRes = await fetch(window.location.origin + '/api/public/affiliate/materials', {
          headers: headers(),
          credentials: 'include',
        });
        data.materials = materialsRes.ok ? await materialsRes.json() : { enabled: false };
      } catch (e) {
        data.materials = { enabled: false };
      }
      try {
        var contestRes = await fetch(window.location.origin + '/api/public/affiliate/contest/leaderboard', {
          headers: headers(),
          credentials: 'include',
        });
        data.contest = contestRes.ok ? await contestRes.json() : { enabled: false };
      } catch (e) {
        data.contest = { enabled: false };
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
