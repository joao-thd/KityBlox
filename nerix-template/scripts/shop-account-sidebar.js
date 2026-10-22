/**
 * Sidebar da área do cliente: caminho ativo em modo path (`/loja/account/...`),
 * dados do cliente via JWT, e logout.
 */
(function () {
  'use strict';

  var root = document.getElementById('account-sidebar-root');
  if (!root) return;

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

  /** Retorna `/account/orders` etc. a partir da URL atual (ignora prefixo da loja em dev). */
  function logicalAccountPath() {
    var p = (window.location.pathname || '/').split('?')[0];
    var parts = p.split('/').filter(Boolean);
    var sub = window.NERIX && window.NERIX.storeParam;
    var mode = window.NERIX && window.NERIX.urlMode;
    if (mode === 'path' && sub && parts[0] === sub && parts[1] === 'account') {
      return '/' + parts.slice(1).join('/');
    }
    var i = parts.indexOf('account');
    if (i >= 0) return '/' + parts.slice(i).join('/');
    return p;
  }

  function setActiveNav() {
    var current = logicalAccountPath();
    root.querySelectorAll('.account-nav-link[data-account-path]').forEach(function (a) {
      var target = a.getAttribute('data-account-path') || '';
      var on = current === target || current.indexOf(target + '/') === 0;
      if (on) {
        a.classList.add('bg-white/10', 'border-white/10', 'text-foreground');
        a.classList.remove('border-transparent', 'text-foreground/90');
        a.setAttribute('aria-current', 'page');
      } else {
        a.classList.remove('bg-white/10', 'border-white/10', 'text-foreground');
        a.classList.add('border-transparent', 'text-foreground/90');
        a.removeAttribute('aria-current');
      }
    });
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function shopHref(path) {
    return typeof shopUrl === 'function' ? shopUrl(path) : path;
  }

  async function hydrateCustomer() {
    var token = customerToken();
    var sub = apiSub();
    if (!token || !sub) return;

    try {
      var res = await fetch(window.location.origin + '/api/public/customer/me', {
        headers: {
          Authorization: 'Bearer ' + token,
          'X-Store-Subdomain': sub,
        },
        credentials: 'include',
      });
      if (!res.ok) return;
      var me = await res.json();
      var nameEl = document.getElementById('account-sidebar-display-name');
      var emailEl = document.getElementById('account-sidebar-email');
      var imgEl = document.getElementById('account-sidebar-avatar-img');
      var fallbackEl = document.getElementById('account-sidebar-avatar-fallback');

      if (nameEl && me.name) nameEl.textContent = me.name;
      if (emailEl && me.email) {
        emailEl.textContent = me.email;
        emailEl.classList.remove('hidden');
      }
      if (me.profile_picture_url && imgEl) {
        imgEl.src = me.profile_picture_url;
        imgEl.alt = me.name || 'Cliente';
        imgEl.classList.remove('hidden');
        if (fallbackEl) fallbackEl.classList.add('hidden');
      }
    } catch (e) {}
  }

  function bindLogout() {
    var btn = document.getElementById('account-sidebar-logout');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (typeof Nerix === 'undefined' || typeof Nerix.logout !== 'function') return;
      Nerix.logout().then(function () {
        window.location.href = shopHref('/login');
      });
    });
  }

  setActiveNav();
  bindLogout();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      hydrateCustomer();
    });
  } else {
    hydrateCustomer();
  }

  window.addEventListener('customerUpdated', function () {
    hydrateCustomer();
  });

  window.addEventListener('popstate', setActiveNav);
})();
