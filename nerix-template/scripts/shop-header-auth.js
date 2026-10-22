/**
 * Hidrata o header quando o cliente está logado só no browser (JWT em
 * localStorage). O SSR usa `user` do lojista/preview — clientes da loja
 * precisam deste passo pra trocar "Entrar" pelo menu de perfil.
 */
(function () {
  'use strict';

  function detectShopSubdomain() {
    var fromNerix =
      (window.NERIX && window.NERIX.shopSubdomain) ||
      (window.NERIX && window.NERIX.storeParam) ||
      '';
    if (fromNerix) return fromNerix;
    try {
      var host = window.location.hostname || '';
      var isLocal =
        host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
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

  function storageKeySub() {
    return detectShopSubdomain();
  }

  function apiSubdomain() {
    return detectShopSubdomain();
  }

  function customerToken() {
    var sub = storageKeySub();
    if (!sub) return '';
    try {
      return localStorage.getItem('customer_token_' + sub) || '';
    } catch (e) {
      return '';
    }
  }

  function readStoredCustomer() {
    var sub = storageKeySub();
    if (!sub) return null;
    try {
      var raw = localStorage.getItem('customer_' + sub);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function shopHref(path) {
    return typeof shopUrl === 'function' ? shopUrl(path) : path;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function detachShopProfileListeners(container) {
    if (container && container._shopProfileDocClick) {
      window.removeEventListener('click', container._shopProfileDocClick);
      container._shopProfileDocClick = null;
    }
  }

  function fmtMoney(v) {
    var n = parseFloat(String(v || 0));
    if (!isFinite(n)) n = 0;
    return 'R$ ' + n.toFixed(2).replace('.', ',');
  }

  function installCustomerUI(container, me, showAffiliate, loyalty) {
    detachShopProfileListeners(container);

    var name = escapeHtml(me.name || 'Cliente');
    var email = escapeHtml(me.email || '');
    var initials = escapeHtml((me.name || 'C').slice(0, 2).toUpperCase());
    var pic = me.profile_picture_url;
    var avatarBlock = pic
      ? '<img src="' +
        escapeHtml(pic) +
        '" class="size-8 rounded-cc sm:rounded-full object-cover" alt="' +
        name +
        '" />'
      : '<div class="size-8 bg-primary flex items-center justify-center text-xs font-semibold uppercase rounded-cc sm:rounded-full text-primary-foreground">' +
        initials +
        '</div>';

    var avatarMenu = pic
      ? '<img src="' +
        escapeHtml(pic) +
        '" class="size-10 rounded-md object-cover shrink-0" alt="' +
        name +
        '" />'
      : '<div class="size-10 shrink-0 bg-primary flex items-center justify-center text-sm font-semibold uppercase rounded-md text-primary-foreground">' +
        initials +
        '</div>';

    var affRow = showAffiliate
      ? '<a href="' +
        shopHref('/account/affiliate') +
        '" class="text-sm w-full p-2.5 hover:bg-white/5 flex items-center gap-2.5 rounded-lg transition text-foreground">' +
        '<i class="ph ph-chart-line-up size-4 shrink-0 opacity-80" aria-hidden="true"></i>' +
        '<span>Área do afiliado</span></a>'
      : '';

    var loyaltyRow = loyalty && loyalty.enabled
      ? '<a href="' +
        shopHref('/account/loyalty') +
        '" class="text-sm w-full p-2.5 hover:bg-white/5 flex items-center gap-2.5 rounded-lg transition text-foreground">' +
        '<i class="ph ph-coins size-4 shrink-0 opacity-80" aria-hidden="true"></i>' +
        '<span>Fidelidade</span></a>'
      : '';

    var loyaltyIconHtml = loyalty && loyalty.currency && loyalty.currency.icon_url
      ? '<img src="' + escapeHtml(loyalty.currency.icon_url) + '" alt="" class="size-3.5 rounded-full object-cover" />'
      : '<i class="ph ph-coins size-3.5 opacity-80" aria-hidden="true"></i>';
    var balancePill = loyalty && loyalty.enabled
      ? '<a href="' +
        shopHref('/account/loyalty') +
        '" class="hidden sm:inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-white/10 transition">' +
        loyaltyIconHtml +
        fmtMoney(loyalty.credit_balance) +
        '</a>'
      : '';

    container.innerHTML =
      '<div class="flex items-center gap-2">' +
      balancePill +
      '<div class="relative z-30">' +
      '<button type="button" class="flex items-center justify-start text-start gap-2 cursor-pointer group w-max" id="shop-profile-button">' +
      avatarBlock +
      '<div class="hidden sm:block">' +
      '<div class="font-medium leading-tight">' +
      name +
      '</div>' +
      '<p class="text-xs text-muted-foreground">Meu perfil</p></div>' +
      '<i class="ph ph-caret-down hidden sm:block w-4 h-4 ml-auto shrink-0 transition-transform group-data-[state=open]:rotate-180 text-foreground/80" aria-hidden="true"></i>' +
      '</button>' +
      '<div class="max-h-[calc(100vh-4rem-2.25rem)] overflow-y-auto absolute top-16 bg-background p-3 -right-12 sm:right-0 rounded-cc border border-white/10 w-[260px] origin-top-right scale-75 transition-all invisible opacity-0 duration-200 shadow-xl" id="shop-profile-menu">' +
      '<div class="rounded-lg bg-white/5 border border-white/10 p-2.5 flex items-center gap-2.5 mb-2">' +
      avatarMenu +
      '<div class="overflow-hidden min-w-0">' +
      '<div class="font-medium truncate">' +
      name +
      '</div>' +
      '<p class="text-xs text-muted-foreground truncate">' +
      email +
      '</p></div></div>' +
      '<p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-2 pt-1 pb-1.5">Área do cliente</p>' +
      '<div class="flex flex-col gap-0.5">' +
      '<a href="' +
      shopHref('/account/profile') +
      '" class="text-sm w-full p-2.5 hover:bg-white/5 flex items-center gap-2.5 rounded-lg transition text-foreground">' +
      '<i class="ph ph-user size-4 shrink-0 opacity-80" aria-hidden="true"></i><span>Meu perfil</span></a>' +
      '<a href="' +
      shopHref('/account/orders') +
      '" class="text-sm w-full p-2.5 hover:bg-white/5 flex items-center gap-2.5 rounded-lg transition text-foreground">' +
      '<i class="ph ph-package size-4 shrink-0 opacity-80" aria-hidden="true"></i><span>Minhas compras</span></a>' +
      affRow +
      loyaltyRow +
      '</div>' +
      '<hr class="border-white/10 my-2.5" />' +
      '<div class="flex flex-col gap-0.5">' +
      '<a href="' +
      shopHref('/') +
      '" class="text-sm w-full p-2.5 hover:bg-white/5 flex items-center gap-2.5 rounded-lg transition text-foreground">' +
      '<i class="ph ph-storefront size-4 shrink-0 opacity-80" aria-hidden="true"></i><span>Voltar para a loja</span></a>' +
      '<button type="button" data-shop-logout class="text-sm w-full p-2.5 text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 rounded-lg transition text-start">' +
      '<i class="ph ph-sign-out size-4 shrink-0" aria-hidden="true"></i><span>Sair da conta</span></button>' +
      '</div></div></div></div>';

    var btn = container.querySelector('#shop-profile-button');
    var menu = container.querySelector('#shop-profile-menu');

    function openMenu() {
      btn.setAttribute('data-state', 'open');
      menu.classList.remove('invisible');
      setTimeout(function () {
        menu.classList.add('scale-100', 'opacity-100');
      }, 1);
    }

    function closeMenu() {
      btn.setAttribute('data-state', 'closed');
      menu.classList.remove('scale-100', 'opacity-100');
      menu.classList.add('scale-75', 'opacity-0');
      setTimeout(function () {
        menu.classList.add('invisible');
      }, 199);
    }

    function toggleMenu(ev) {
      ev.stopPropagation();
      if (menu.classList.contains('invisible')) openMenu();
      else closeMenu();
    }

    btn.addEventListener('click', toggleMenu);

    function onDocClick(ev) {
      if (!menu.contains(ev.target) && !btn.contains(ev.target)) closeMenu();
    }
    container._shopProfileDocClick = onDocClick;
    window.addEventListener('click', onDocClick);

    var logoutBtn = container.querySelector('[data-shop-logout]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (typeof Nerix === 'undefined' || typeof Nerix.logout !== 'function') return;
        Nerix.logout().then(function () {
          window.location.href = shopHref('/login');
        });
      });
    }

  }

  async function refreshHeaderAuth() {
    var root = document.getElementById('header-auth-client-root');
    if (!root) return;

    var guest = document.getElementById('header-auth-guest');
    var customer = document.getElementById('header-auth-customer');
    if (!guest || !customer) return;

    var token = customerToken();
    var subHeader = apiSubdomain();
    var cached = readStoredCustomer();

    if (!token || !subHeader) {
      detachShopProfileListeners(customer);
      guest.classList.remove('hidden');
      customer.classList.add('hidden');
      customer.innerHTML = '';
      return;
    }

    // Evita o "pisca" de Entrar -> Perfil ao navegar entre páginas.
    if (cached) {
      guest.classList.add('hidden');
      customer.classList.remove('hidden');
      installCustomerUI(customer, cached, false);
    } else {
      guest.classList.add('hidden');
    }

    try {
      var res = await fetch(window.location.origin + '/api/public/customer/me', {
        headers: {
          Authorization: 'Bearer ' + token,
          'X-Store-Subdomain': subHeader,
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('unauthorized');

      var me = await res.json();
      try {
        localStorage.setItem('customer_' + storageKeySub(), JSON.stringify(me));
      } catch (e3) {}

      var showAff = false;
      try {
        var ar = await fetch(
          window.location.origin + '/api/public/affiliate/dashboard?period=7',
          {
            headers: {
              Authorization: 'Bearer ' + token,
              'X-Store-Subdomain': subHeader,
            },
            credentials: 'include',
          }
        );
        showAff = ar.ok;
      } catch (e2) {
        showAff = false;
      }

      var loyalty = null;
      try {
        var lr = await fetch(window.location.origin + '/api/public/loyalty', {
          headers: {
            Authorization: 'Bearer ' + token,
            'X-Store-Subdomain': subHeader,
          },
          credentials: 'include',
        });
        if (lr.ok) loyalty = await lr.json();
      } catch (e4) {
        loyalty = null;
      }

      guest.classList.add('hidden');
      customer.classList.remove('hidden');
      installCustomerUI(customer, me, showAff, loyalty);
    } catch (err) {
      detachShopProfileListeners(customer);
      guest.classList.remove('hidden');
      customer.classList.add('hidden');
      customer.innerHTML = '';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshHeaderAuth);
  } else {
    refreshHeaderAuth();
  }
  window.addEventListener('customerUpdated', refreshHeaderAuth);
})();
