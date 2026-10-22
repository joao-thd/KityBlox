(function () {
  'use strict';

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

  async function run() {
    var loading = document.getElementById('profile-page-loading');
    var guest = document.getElementById('profile-page-guest');
    var content = document.getElementById('profile-page-content');
    if (!loading || !guest || !content) return;

    if (!token() || !apiSub()) {
      loading.classList.add('hidden');
      guest.classList.remove('hidden');
      return;
    }

    try {
      var res = await fetch(window.location.origin + '/api/public/customer/me', {
        headers: {
          Authorization: 'Bearer ' + token(),
          'X-Store-Subdomain': apiSub(),
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('me');
      var me = await res.json();

      var nameEl = document.getElementById('profile-field-name');
      var emailEl = document.getElementById('profile-field-email');
      var phoneEl = document.getElementById('profile-field-phone');
      var ordersEl = document.getElementById('profile-field-orders');

      if (nameEl) nameEl.textContent = me.name || '—';
      if (emailEl) emailEl.textContent = me.email || '—';
      if (phoneEl) phoneEl.textContent = me.phone || '—';
      if (ordersEl) {
        var n = typeof me.total_orders === 'number' ? me.total_orders : parseInt(String(me.total_orders || 0), 10);
        ordersEl.textContent = Number.isFinite(n) ? String(n) : '0';
      }

      loading.classList.add('hidden');
      content.classList.remove('hidden');
    } catch (err) {
      loading.classList.add('hidden');
      guest.classList.remove('hidden');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  window.addEventListener('customerUpdated', run);
})();
