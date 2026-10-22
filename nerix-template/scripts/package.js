const packageWrapper = document.querySelector('.package-wrapper');
let pendingAdd = null; // { redirect: boolean }
let currentStockAlertConfig = null;

function getStockAlertConfig(packageData) {
  const info = packageData && packageData.product_info;
  const alert = info && info.stock_alert;
  if (!alert || !alert.enabled) return null;
  return alert;
}

function resolveQuantityLimit(value, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getCurrentMinQuantity() {
  const wrapper = document.querySelector('.package-wrapper');
  return resolveQuantityLimit(wrapper && wrapper.dataset ? wrapper.dataset.minQuantity : null, 1);
}

function applyStockAlertUI(packageData, isOutOfStock) {
  const purchaseButtonEl = document.getElementById('purchase-button');
  const addToCartButtonEl = document.getElementById('add-to-cart-button');
  currentStockAlertConfig = getStockAlertConfig(packageData);

  if (isOutOfStock && currentStockAlertConfig) {
    if (purchaseButtonEl) {
      purchaseButtonEl.disabled = false;
      purchaseButtonEl.onclick = () => openStockAlertDialog();
      purchaseButtonEl.innerHTML =
        '<i class="ph ph-bell size-5 shrink-0" aria-hidden="true"></i> ' +
        (currentStockAlertConfig.button_text || 'Avise-me quando voltar');
    }
    if (addToCartButtonEl) {
      addToCartButtonEl.style.display = 'none';
      addToCartButtonEl.disabled = true;
    }
    return;
  }

  if (purchaseButtonEl) {
    purchaseButtonEl.onclick = () => cartAdd(true);
    purchaseButtonEl.innerHTML =
      '<i class="ph ph-shopping-cart size-5 shrink-0" aria-hidden="true"></i> Comprar agora';
    purchaseButtonEl.disabled = isOutOfStock;
  }
  if (addToCartButtonEl) {
    addToCartButtonEl.style.display = '';
    addToCartButtonEl.disabled = isOutOfStock;
  }
}

function ensureStockAlertDialogDom() {
  if (document.getElementById('dialog-stock-alert')) return;

  const wrap = document.createElement('div');
  wrap.id = 'dialog-stock-alert';
  wrap.className =
    'w-screen h-screen flex items-center justify-center z-50 fixed top-0 left-0 group dialog hidden';
  wrap.setAttribute('data-state', 'closed');
  wrap.innerHTML =
    '<div class="max-h-[90vh] overflow-auto custom-scrollbar bg-background w-full rounded-cc border lg:w-[500px]">' +
    '<div class="p-5 border-b relative">' +
    '<div class="flex flex-col space-y-1.5 text-center sm:text-left">' +
    '<h2 id="dialog-stock-alert-title" class="text-lg font-semibold leading-none tracking-tight">Avise-me quando voltar</h2>' +
    '</div>' +
    '<button type="button" aria-label="Fechar" class="absolute right-4 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-white/10" onclick="closeDialog(\'stock-alert\')">' +
    '<i class="ph ph-x size-5" aria-hidden="true"></i>' +
    '</button></div>' +
    '<div class="p-6">' +
    '<div id="stock-alert-form" class="w-full flex flex-col gap-4">' +
    '<p id="stock-alert-message" class="text-sm text-muted-foreground"></p>' +
    '<div><label for="stock-alert-email" class="text-sm font-medium mb-1.5 block">Seu e-mail</label>' +
    '<input id="stock-alert-email" type="email" class="input w-full" placeholder="seu@email.com" autocomplete="email" required />' +
    '<p id="stock-alert-error" class="hidden text-sm text-red-400 mt-1.5"></p>' +
    '<p id="stock-alert-success" class="hidden text-sm text-emerald-400 mt-1.5"></p></div>' +
    '<button id="stock-alert-confirm" type="button" class="btn-primary h-10 w-full">' +
    '<i class="ph ph-bell size-5 shrink-0" aria-hidden="true"></i> Quero ser avisado</button>' +
    '</div></div></div>';

  wrap.addEventListener('click', (event) => {
    if (event.target === wrap && typeof closeDialog === 'function') closeDialog('stock-alert');
  });

  document.body.appendChild(wrap);

  const confirmEl = document.getElementById('stock-alert-confirm');
  if (confirmEl) confirmEl.addEventListener('click', submitStockAlert);
  const emailEl = document.getElementById('stock-alert-email');
  if (emailEl) {
    emailEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitStockAlert();
      }
    });
  }
}

function openStockAlertDialog() {
  ensureStockAlertDialogDom();
  const config = currentStockAlertConfig || {};
  const titleEl = document.getElementById('dialog-stock-alert-title');
  const messageEl = document.getElementById('stock-alert-message');
  const errorEl = document.getElementById('stock-alert-error');
  const successEl = document.getElementById('stock-alert-success');
  const emailEl = document.getElementById('stock-alert-email');
  const confirmEl = document.getElementById('stock-alert-confirm');

  if (titleEl) {
    titleEl.textContent = config.dialog_title || 'Avise-me quando voltar';
  }
  if (messageEl) {
    messageEl.textContent =
      config.dialog_message ||
      'Informe seu e-mail e te avisamos assim que este produto estiver disponível novamente.';
  }
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
  if (successEl) {
    successEl.textContent = '';
    successEl.classList.add('hidden');
  }
  if (emailEl) {
    emailEl.value = '';
    emailEl.disabled = false;
  }
  if (confirmEl) {
    confirmEl.disabled = false;
    confirmEl.textContent = 'Quero ser avisado';
  }

  if (typeof openDialog === 'function') openDialog('stock-alert');
}

function getShopStoreParam() {
  var storeParam =
    (window.NERIX && window.NERIX.storeParam) ||
    (window.NERIX && window.NERIX.shopSubdomain) ||
    '';
  if (!storeParam) {
    try {
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
        shop: true,
      };
      if (first && !blocked[first]) storeParam = first;
    } catch (e) {}
  }
  return storeParam;
}

function buildShopApiUrl(path) {
  var url = window.location.origin + path;
  var storeParam = getShopStoreParam();
  if (storeParam) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + 'store=' + encodeURIComponent(storeParam);
  }
  return url;
}

async function submitStockAlert() {
  const wrapper = document.querySelector('.package-wrapper');
  const emailEl = document.getElementById('stock-alert-email');
  const errorEl = document.getElementById('stock-alert-error');
  const successEl = document.getElementById('stock-alert-success');
  const confirmEl = document.getElementById('stock-alert-confirm');

  if (!wrapper || !emailEl) return;

  const email = String(emailEl.value || '').trim();
  if (!email || !email.includes('@')) {
    if (errorEl) {
      errorEl.textContent = 'Informe um e-mail válido.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  const packageId = parseInt(wrapper.dataset.packageId, 10);
  if (!Number.isFinite(packageId) || packageId <= 0) return;

  if (confirmEl) confirmEl.disabled = true;
  if (errorEl) errorEl.classList.add('hidden');

  try {
    var headers = { 'Content-Type': 'application/json' };
    var storeParam = getShopStoreParam();
    if (storeParam) headers['X-Store-Subdomain'] = storeParam;

    const res = await fetch(buildShopApiUrl('/api/shop/stock-alerts'), {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ package_id: packageId, email }),
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (errorEl) {
        errorEl.textContent = data.error || 'Não foi possível registrar seu e-mail. Tente novamente.';
        errorEl.classList.remove('hidden');
      }
      if (confirmEl) confirmEl.disabled = false;
      return;
    }

    if (successEl) {
      successEl.textContent = data.message || 'Pronto! Te avisaremos por e-mail quando voltar ao estoque.';
      successEl.classList.remove('hidden');
    }
    emailEl.disabled = true;
    if (confirmEl) {
      confirmEl.textContent = 'Inscrito!';
    }
  } catch (_err) {
    if (errorEl) {
      errorEl.textContent = 'Erro de conexão. Tente novamente.';
      errorEl.classList.remove('hidden');
    }
    if (confirmEl) confirmEl.disabled = false;
  }
}

(function wireStockAlertDialog() {
  const confirmEl = document.getElementById('stock-alert-confirm');
  if (confirmEl) {
    confirmEl.addEventListener('click', submitStockAlert);
  }
  const emailEl = document.getElementById('stock-alert-email');
  if (emailEl) {
    emailEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitStockAlert();
      }
    });
  }
})();

// Update visible package info on the page
function updatePackageView(packageData) {
  if (!packageData) return;
  const nameEl = document.getElementById('package-name');
  const descriptionEl = document.getElementById('package-description');
  const imgEl = document.getElementById('package-image');
  const priceEl = document.getElementById('package-price');
  const compareAtEl = document.getElementById('package-compare-at');
  const percentDiscountContainerEl = document.getElementById('package-percent-discount-container');
  const percentDiscountEl = document.getElementById('package-percent-discount');
  const stockEl = document.getElementById('package-stock');
  const salesEl = document.getElementById('package-sales');
  const dialogTitleEl = document.getElementById('dialog-custom-fields-title');
  const purchaseButtonEl = document.getElementById('purchase-button');
  const addToCartButtonEl = document.getElementById('add-to-cart-button');

  if (packageWrapper && packageData.stock) {
    packageWrapper.dataset.minQuantity = String(resolveQuantityLimit(packageData.stock.min_amount, 1));
    if (packageData.stock.max_amount !== null && packageData.stock.max_amount !== undefined) {
      packageWrapper.dataset.maxQuantity = String(resolveQuantityLimit(packageData.stock.max_amount, 0));
    } else {
      packageWrapper.dataset.maxQuantity = '';
    }
  }

  if (nameEl && packageData.name) nameEl.textContent = packageData.name;
  if (dialogTitleEl && packageData.name) dialogTitleEl.textContent = packageData.name;
  if (descriptionEl && packageData.description) descriptionEl.innerHTML = packageData.description;
  if (imgEl && packageData.image) {
    imgEl.src = packageData.image;
    imgEl.alt = packageData.name;
  }
  if (priceEl && packageData.pricing && typeof packageData.pricing.price === 'number') {
    priceEl.textContent = Nerix.formatPrice(packageData.pricing.price, store.currency);
  }
  if (compareAtEl) {
    if (packageData.pricing && typeof packageData.pricing.compare_at === 'number') {
      compareAtEl.style.display = '';
      compareAtEl.textContent = Nerix.formatPrice(
        packageData.pricing.compare_at,
        store.currency
      );
    } else {
      compareAtEl.style.display = 'none';
    }
  }
  if (percentDiscountContainerEl && percentDiscountEl) {
    if (packageData.pricing.percent_discount) {
      percentDiscountContainerEl.style.display = 'flex';
      percentDiscountEl.textContent = Math.abs(packageData.pricing.percent_discount).toFixed(0);
    } else {
      percentDiscountContainerEl.style.display = 'none';
    }
  }
  const stock = packageData.stock || {};
  const hasQty =
    stock.quantity !== null &&
    stock.quantity !== undefined &&
    String(stock.quantity).trim() !== '';
  const qtyNum = Number(stock.quantity);
  const isOutOfStock = stock.available === false || (hasQty && Number.isFinite(qtyNum) && qtyNum <= 0);

  if (stockEl) {
    if (isOutOfStock) {
      stockEl.textContent = 'Sem estoque';
    } else if (hasQty) {
      stockEl.textContent = `${stock.quantity} em estoque`;
    } else {
      stockEl.textContent = '100+ em estoque';
    }
  }
  if (imgEl) {
    imgEl.classList.toggle('opacity-80', isOutOfStock);
    imgEl.classList.toggle('blur-sm', isOutOfStock);
  }
  if (salesEl) {
    const sales = packageData.sales || 0;
    salesEl.textContent = `${sales} venda${sales > 1 ? 's' : ''}`;
    salesEl.classList.toggle('hidden', sales <= 1);
  }
  if (purchaseButtonEl) {
    purchaseButtonEl.disabled = isOutOfStock;
  }
  if (addToCartButtonEl) {
    addToCartButtonEl.disabled = isOutOfStock;
  }
  applyStockAlertUI(packageData, isOutOfStock);
  if (typeof NerixProductInfo !== 'undefined' && NerixProductInfo.render) {
    NerixProductInfo.render(packageData);
  }
}

// ----- Custom fields DOM wiring & helpers (moved from inline template) -----
(function defineCustomFieldsHelpers() {
  function afterRender(container) {
    if (!container) return;

    // Clear error state on input
    container.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => {
        input.removeAttribute('data-state');
        const fid = input.getAttribute('id');
        if (fid) {
          const err = document.getElementById(`error-${fid}`);
          if (err) {
            err.textContent = '';
            err.classList.add('hidden');
          }
        }
      });
    });

    // Clear error state on select
    container.querySelectorAll('select').forEach((select) => {
      select.addEventListener('change', () => {
        select.removeAttribute('data-state');
        const fid = select.getAttribute('id');
        if (fid) {
          const err = document.getElementById(`error-${fid}`);
          if (err) {
            err.textContent = '';
            err.classList.add('hidden');
          }
        }
      });
    });

    // Keep ROBLOX data-value in sync
    container.querySelectorAll('[data-field-type="ROBLOX"]').forEach((element) => {
      const input = element.querySelector('input');
      if (!input) return;
      const setValue = () => {
        const value = (input.value || '').trim();
        if (value) element.setAttribute('data-value', value);
        else element.removeAttribute('data-value');
      };
      input.addEventListener('input', setValue);
      input.addEventListener('blur', setValue);
    });

    // ROBLOX dynamic search and select using useTyping (from scripts/main.js)
    container.querySelectorAll('[data-field-type="ROBLOX"]').forEach((element) => {
      const fieldName = element.getAttribute('data-field-id');
      if (!fieldName) return;
      const input = element.querySelector(`#${CSS.escape(fieldName)}`);
      if (!input) return;

      const resultContainer = document.getElementById(`roblox-result-${fieldName}`);
      const loaderContainer = document.getElementById(`roblox-loader-${fieldName}`);
      const inputAvatar = document.getElementById(`roblox-input-avatar-${fieldName}`);
      const avatarEl = document.getElementById(`roblox-avatar-${fieldName}`);
      const nameEl = document.getElementById(`roblox-name-${fieldName}`);
      const usernameEl = document.getElementById(`roblox-username-${fieldName}`);
      const selectBtn = document.getElementById(`roblox-select-${fieldName}`);
      const errorEl = document.getElementById(`error-${fieldName}`);

      if (typeof useTyping === 'function') {
        useTyping(input, {
          onStart: () => {
            if (resultContainer) resultContainer.classList.add('hidden');
            if (loaderContainer) loaderContainer.classList.remove('hidden');
            const searchIcon = element.querySelector('.js-field-search-icon');
            if (searchIcon) searchIcon.classList.remove('hidden');
            if (inputAvatar) inputAvatar.classList.add('hidden');
            if (errorEl) {
              errorEl.classList.add('hidden');
              errorEl.textContent = '';
            }
            input.removeAttribute('data-state');
          },
          onStop: async (value) => {
            const username = (value || '').trim();
            if (!username || username.length < 3) {
              if (loaderContainer) loaderContainer.classList.add('hidden');
              if (errorEl) {
                errorEl.textContent = '';
                errorEl.classList.add('hidden');
              }
              return;
            }

            try {
              const res = await Nerix.getRoblox(username);
              const data = res && res.data ? res.data : null;
              if (!data) {
                if (errorEl) {
                  errorEl.textContent = 'Usuário não encontrado.';
                  errorEl.classList.remove('hidden');
                }
                input.setAttribute('data-state', 'error');
                return;
              }

              if (avatarEl) avatarEl.src = data.avatar_url || '';
              if (nameEl) nameEl.textContent = data.display_name || '';
              if (usernameEl) usernameEl.textContent = data.username ? `@${data.username}` : '';

              if (resultContainer) resultContainer.classList.remove('hidden');
              if (errorEl) {
                errorEl.textContent = '';
                errorEl.classList.add('hidden');
              }
              input.removeAttribute('data-state');
            } catch (e) {
              if (errorEl) {
                errorEl.textContent = 'Usuário não encontrado.';
                errorEl.classList.remove('hidden');
              }
              input.setAttribute('data-state', 'error');
            } finally {
              if (loaderContainer) loaderContainer.classList.add('hidden');
            }
          },
          delay: 500,
        });
      }

      if (selectBtn) {
        selectBtn.addEventListener('click', () => {
          if (resultContainer) resultContainer.classList.add('hidden');
          const searchIcon = element.querySelector('.js-field-search-icon');
          if (avatarEl && avatarEl.src && inputAvatar) {
            inputAvatar.src = avatarEl.src;
            inputAvatar.classList.remove('hidden');
            if (searchIcon) searchIcon.classList.add('hidden');
            input.classList.add('pl-8');
          }
          const value = (input.value || '').trim();
          if (value) element.setAttribute('data-value', value);
          if (errorEl) {
            errorEl.textContent = '';
            errorEl.classList.add('hidden');
          }
          input.removeAttribute('data-state');
        });
      }
    });

  }

  function collect() {
    const container = document.getElementById('custom-fields-fields');
    if (!container) return {};
    const fields = {};
    let hasError = false;

    container.querySelectorAll('[data-field-id]').forEach((element) => {
      const customId = element.getAttribute('data-field-id');
      const type = element.getAttribute('data-field-type');

      if (type === 'ROBLOX') {
        const value = element.getAttribute('data-value') || '';
        const input = element.querySelector('input');
        const errorEl = document.getElementById(`error-${customId}`);
        const required = input && input.getAttribute('data-required') === 'true';
        if (required && !value) {
          if (errorEl) {
            errorEl.textContent = 'Este campo é obrigatório.';
            errorEl.classList.remove('hidden');
          }
          input.setAttribute('data-state', 'error');
          hasError = true;
          return;
        }
        fields[customId] = value;
      } else if (type === 'SELECT') {
        const select = element.querySelector('select');
        if (!select) return;
        const required = select.getAttribute('data-required') === 'true';
        const value = select.value;
        const errorEl = document.getElementById(`error-${customId}`);
        if (required && !value) {
          if (errorEl) {
            errorEl.textContent = 'Este campo é obrigatório.';
            errorEl.classList.remove('hidden');
          }
          select.setAttribute('data-state', 'error');
          hasError = true;
          return;
        }
        if (errorEl) {
          errorEl.textContent = '';
          errorEl.classList.add('hidden');
        }
        select.removeAttribute('data-state');
        fields[customId] = value;
      } else {
        const input = element.querySelector('input');
        if (!input) return;
        const required = input.getAttribute('data-required') === 'true';
        const value = input.value.trim();
        const errorEl = document.getElementById(`error-${customId}`);
        if (required && !value) {
          if (errorEl) {
            errorEl.textContent = 'Este campo é obrigatório.';
            errorEl.classList.remove('hidden');
          }
          input.setAttribute('data-state', 'error');
          hasError = true;
          return;
        }
        if (errorEl) {
          errorEl.textContent = '';
          errorEl.classList.add('hidden');
        }
        input.removeAttribute('data-state');
        fields[customId] = value;
      }
    });

    if (hasError) return null;
    return fields;
  }

  function hasAny() {
    const container = document.getElementById('custom-fields-fields');
    if (!container) return false;
    return container.querySelector('[data-field-id]') !== null;
  }

  window.CustomFields = Object.assign(window.CustomFields || {}, {
    afterRender,
    collect,
    hasAny,
  });
})();

// ----- Product reviews (GET /api/public/customer/products/:id/reviews) -----
(function productReviewsModule() {
  var reviewsState = { page: 1, limit: 8, totalPages: 0, productId: null, loading: false };

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function apiSubdomainHeader() {
    return (window.NERIX && window.NERIX.shopSubdomain) || '';
  }

  function reviewAuthorName(review) {
    var c = review && review.customer;
    if (!c) return 'Cliente';
    if (c.name && String(c.name).trim()) return String(c.name).trim();
    var em = c.email && String(c.email).trim();
    if (em) {
      var at = em.indexOf('@');
      if (at > 1) return em.slice(0, 1) + '***' + em.slice(at);
      return 'Cliente';
    }
    return 'Cliente';
  }

  function formatReviewDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  function starsHtml(rating, sizeClass) {
    var r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    // Cores em style: classes só no JS não entram no bundle do Tailwind CDN.
    var sizePx = sizeClass === 'text-xs' ? '13px' : sizeClass === 'text-sm' ? '14px' : '16px';
    var fillStyle = 'color:#fbbf24;font-size:' + sizePx + ';line-height:1';
    var emptyStyle = 'color:rgba(255,255,255,0.22);font-size:' + sizePx + ';line-height:1';
    var out = '';
    for (var i = 1; i <= 5; i++) {
      var fill = i <= r;
      out +=
        '<i class="ph ' +
        (fill ? 'ph-star ph-fill' : 'ph-star') +
        '" style="' +
        (fill ? fillStyle : emptyStyle) +
        '" aria-hidden="true"></i>';
    }
    return out;
  }

  function parseImages(raw) {
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === 'string') {
      try {
        var p = JSON.parse(raw);
        return Array.isArray(p) ? p.filter(Boolean) : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  function renderReviewItem(review) {
    var author = escapeHtml(reviewAuthorName(review));
    var dateStr = formatReviewDate(review.created_at || review.createdAt);
    var rating = Number(review.rating) || 0;
    var title = review.title && String(review.title).trim();
    var comment = review.comment && String(review.comment).trim();
    var imgs = parseImages(review.images);
    var imgBlock = '';
    if (imgs.length) {
      imgBlock =
        '<div class="flex flex-wrap gap-2 mt-3">' +
        imgs
          .map(function (url) {
            var u = escapeHtml(url);
            return (
              '<a href="' +
              u +
              '" target="_blank" rel="noopener noreferrer" class="block rounded overflow-hidden opacity-90 hover:opacity-100 transition-opacity shrink-0 ring-1 ring-white/10">' +
              '<img src="' +
              u +
              '" alt="" class="h-14 w-14 object-cover" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="if(!this.dataset._fb){this.dataset._fb=\'1\';this.src=\'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2256%22 height=%2256%22%3E%3Crect fill=%22%2318181b%22 width=%2256%22 height=%2256%22/%3E%3C/svg%3E\';}" />' +
              '</a>'
            );
          })
          .join('') +
        '</div>';
    }
    return (
      '<li class="py-4">' +
      '<div class="flex flex-wrap items-center gap-x-2 gap-y-1">' +
      '<span class="text-sm font-medium text-foreground">' +
      author +
      '</span>' +
      (dateStr ? '<span class="text-xs text-muted-foreground">' + escapeHtml(dateStr) + '</span>' : '') +
      '<span class="ml-auto flex shrink-0 items-center gap-0.5" title="' +
      rating +
      ' de 5">' +
      starsHtml(rating, 'text-xs') +
      '</span>' +
      '</div>' +
      (title
        ? '<p class="text-sm text-foreground mt-2">' + escapeHtml(title) + '</p>'
        : '') +
      (comment
        ? '<p class="text-sm text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap break-words">' +
          escapeHtml(comment) +
          '</p>'
        : '') +
      imgBlock +
      '</li>'
    );
  }

  function setReviewsUi(opts) {
    var loading = document.getElementById('reviews-loading');
    var err = document.getElementById('reviews-error');
    var list = document.getElementById('reviews-list');
    var summary = document.getElementById('reviews-summary-line');
    var moreBtn = document.getElementById('reviews-load-more');
    if (!loading || !err || !list) return;

    if (opts.loading) {
      loading.classList.remove('hidden');
      err.classList.add('hidden');
      err.textContent = '';
    } else {
      loading.classList.add('hidden');
    }

    if (opts.error) {
      err.textContent = opts.error;
      err.classList.remove('hidden');
    } else if (!opts.loading) {
      err.classList.add('hidden');
      err.textContent = '';
    }

    if (opts.summaryText != null && summary) summary.textContent = opts.summaryText;

    if (opts.clearList) list.innerHTML = '';
    if (opts.appendHtml) list.insertAdjacentHTML('beforeend', opts.appendHtml);

    if (moreBtn && opts.showMore != null) {
      if (opts.showMore) moreBtn.classList.remove('hidden');
      else moreBtn.classList.add('hidden');
    }
  }

  async function fetchReviewsPage(productId, page) {
    var headers = { Accept: 'application/json' };
    var sub = apiSubdomainHeader();
    if (sub) headers['X-Store-Subdomain'] = sub;
    var url =
      window.location.origin +
      '/api/public/customer/products/' +
      encodeURIComponent(String(productId)) +
      '/reviews?page=' +
      encodeURIComponent(String(page)) +
      '&limit=' +
      encodeURIComponent(String(reviewsState.limit));
    var res = await fetch(url, { headers: headers, credentials: 'same-origin' });
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      var msg = (data && (data.error || data.message)) || 'Não foi possível carregar as avaliações.';
      throw new Error(msg);
    }
    return data;
  }

  window.loadProductReviews = async function loadProductReviews(reset) {
    var section = document.getElementById('product-reviews-section');
    if (!section || !packageWrapper) return;

    var productId = parseInt(packageWrapper.dataset.packageId, 10);
    if (!productId || Number.isNaN(productId)) return;

    if (reviewsState.loading) return;
    if (reset !== false) {
      reviewsState.page = 1;
      reviewsState.productId = productId;
      setReviewsUi({
        loading: true,
        clearList: true,
        showMore: false,
        summaryText: 'Carregando…',
      });
    } else {
      if (productId !== reviewsState.productId) {
        reviewsState.page = 1;
        reviewsState.productId = productId;
      }
    }

    reviewsState.loading = true;
    try {
      var page = reviewsState.page;
      var data = await fetchReviewsPage(productId, page);
      var reviews = Array.isArray(data.reviews) ? data.reviews : [];
      var pag = data.pagination || {};
      reviewsState.totalPages = Number(pag.totalPages) || 0;
      var total = Number(pag.total) || Number(data.totalReviews) || 0;
      var avg = Number(data.averageRating) || 0;

      if (total === 0) {
        setReviewsUi({
          loading: false,
          clearList: true,
          summaryText: 'Sem avaliações.',
          showMore: false,
        });
        return;
      }

      var summaryText =
        avg.toFixed(1).replace('.', ',') +
        ' de 5 · ' +
        total +
        (total === 1 ? ' avaliação' : ' avaliações');
      setReviewsUi({
        loading: false,
        summaryText: summaryText,
        clearList: reset !== false,
        appendHtml: reviews.map(renderReviewItem).join(''),
        showMore: reviewsState.page < reviewsState.totalPages,
      });
    } catch (e) {
      var errMsg = (e && e.message) || 'Erro ao carregar avaliações.';
      setReviewsUi({
        loading: false,
        error: errMsg,
        summaryText: 'Não foi possível carregar as avaliações.',
        showMore: false,
        clearList: reset !== false,
      });
    } finally {
      reviewsState.loading = false;
    }
  };

  function bindReviewsLoadMore() {
    var moreBtn = document.getElementById('reviews-load-more');
    if (!moreBtn || moreBtn.dataset.bound === '1') return;
    moreBtn.dataset.bound = '1';
    moreBtn.addEventListener('click', async function () {
      if (reviewsState.loading || reviewsState.page >= reviewsState.totalPages) return;
      var wrap = document.querySelector('.package-wrapper');
      var productId = parseInt(wrap && wrap.dataset.packageId, 10);
      if (!productId || Number.isNaN(productId)) return;
      reviewsState.page += 1;
      reviewsState.loading = true;
      try {
        var data = await fetchReviewsPage(productId, reviewsState.page);
        var reviews = Array.isArray(data.reviews) ? data.reviews : [];
        var pag = data.pagination || {};
        reviewsState.totalPages = Number(pag.totalPages) || reviewsState.totalPages;
        setReviewsUi({
          appendHtml: reviews.map(renderReviewItem).join(''),
          showMore: reviewsState.page < reviewsState.totalPages,
        });
      } catch (e) {
        reviewsState.page -= 1;
        var err = document.getElementById('reviews-error');
        if (err) {
          err.textContent = (e && e.message) || 'Erro ao carregar mais.';
          err.classList.remove('hidden');
        }
      } finally {
        reviewsState.loading = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindReviewsLoadMore);
  } else {
    bindReviewsLoadMore();
  }
})();

// Apply a variation: update dataset, URL and visible info
function applyVariation(variation) {
  if (!packageWrapper || !variation) return;
  packageWrapper.dataset.packageId = String(variation.id);
  var parentId =
    variation &&
    variation.parent &&
    variation.parent.id != null &&
    Number.isFinite(Number(variation.parent.id))
      ? Number(variation.parent.id)
      : null;
  if (parentId) packageWrapper.dataset.parentProductId = String(parentId);
  else packageWrapper.dataset.parentProductId = '';
  const url = new URL(window.location.href);
  url.searchParams.set('variation', variation.slug || variation.id);
  window.history.replaceState({}, '', url.toString());
  updatePackageView(variation);
  updateCustomFields(variation.fields || []);
  if (typeof window.loadProductReviews === 'function') window.loadProductReviews(true);
}

// Entrypoint
(function initPackagePage() {
  if (!packageWrapper) return;

  const isParentAttr = packageWrapper.dataset.isVariationParent;
  const isParentByAttr = isParentAttr === 'true' || isParentAttr === '1';

  const list = getScriptData('__nerix_package_variations', []);
  const isParent = isParentByAttr || (Array.isArray(list) && list.length > 0);

  const initialFields = getScriptData('__nerix_package_fields', []);
  updateCustomFields(initialFields);

  // Wire confirm button inside dialog
  const confirmBtn = document.getElementById('custom-fields-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const wrapper = document.querySelector('.package-wrapper');
      if (!wrapper) return;
      const selectedId = parseInt(wrapper.dataset.packageId);
      const parentProductId = parseInt(wrapper.dataset.parentProductId, 10);
      const fields = collectCustomFields();
      if (fields === null) return; // validation failed
      addToCart({
        packageId: selectedId,
        quantity: getCurrentMinQuantity(),
        fields,
        parent_product_id: Number.isFinite(parentProductId) && parentProductId > 0 ? parentProductId : undefined,
        openDrawer: !(pendingAdd && pendingAdd.redirect),
      });
      if (pendingAdd && pendingAdd.redirect) window.location.href = typeof shopUrl === 'function' ? shopUrl('/checkout') : '/checkout';
      if (typeof closeDialog === 'function') closeDialog('custom-fields');
      pendingAdd = null;
    });
  }

  if (!isParent || list.length === 0) {
    try {
      var initial = getScriptData('__nerix_package_initial', null);
      if (initial) updatePackageView(initial);
      var pid = parseInt(packageWrapper.dataset.packageId, 10);
      if (Number.isFinite(pid) && pid > 0) {
        Nerix.track('view_content', {
          content_ids: [String(pid)],
          content_type: 'product',
          value: 0,
          currency: store.currency,
        });
      }
    } catch (e) {}
    if (typeof window.loadProductReviews === 'function') window.loadProductReviews(true);
    return;
  }

  const url = new URL(window.location.href);
  const queryVar = url.searchParams.get('variation');
  const norm = (v) => String(v == null ? '' : v).trim();
  const findVariation = (value) => {
    const needle = norm(value);
    if (!needle) return null;
    return (
      list.find((v) => norm(v && v.id) === needle) ||
      list.find((v) => norm(v && v.slug) === needle) ||
      null
    );
  };

  let selected = null;
  if (queryVar) {
    selected = findVariation(queryVar);
  }
  if (!selected) {
    const domSelected = document.querySelector('[data-action="select-variation"][data-selected="true"]');
    if (domSelected) selected = findVariation(domSelected.getAttribute('data-variation-id'));
  }
  if (!selected) selected = list[0];
  applyVariation(selected);
  try {
    Nerix.track('view_content', {
      content_ids: [String(selected.id)],
      content_type: 'product',
      value: Number(selected && selected.pricing ? selected.pricing.price : 0) || 0,
      currency: store.currency,
    });
  } catch (e) {}

  // Mark selected in UI
  const markSelected = (id) => {
    document.querySelectorAll('[data-action="select-variation"]').forEach((el) => {
      const vid = norm(el.getAttribute('data-variation-id'));
      const isSel = vid === norm(id);
      el.setAttribute('data-selected', String(isSel));
    });
  };
  markSelected(selected.id);

  // Click listeners
  document.querySelectorAll('[data-action="select-variation"]').forEach((el) => {
    el.addEventListener('click', () => {
      const vid = el.getAttribute('data-variation-id');
      const v = findVariation(vid);
      if (v) {
        applyVariation(v);
        markSelected(v.id);
      }
    });
  });
})();

function cartAdd(redirect = false) {
  const wrapper = document.querySelector('.package-wrapper');
  if (!wrapper) return;
  const purchaseButtonEl = document.getElementById('purchase-button');
  const addToCartButtonEl = document.getElementById('add-to-cart-button');
  if ((redirect && purchaseButtonEl && purchaseButtonEl.disabled) || (!redirect && addToCartButtonEl && addToCartButtonEl.disabled)) {
    return;
  }
  const selectedId = parseInt(wrapper.dataset.packageId);
  const parentProductId = parseInt(wrapper.dataset.parentProductId, 10);
  if (hasCustomFields()) {
    pendingAdd = { redirect };
    if (typeof openDialog === 'function') openDialog('custom-fields');
    return;
  }
  addToCart({
    packageId: selectedId,
    quantity: getCurrentMinQuantity(),
    fields: {},
    parent_product_id: Number.isFinite(parentProductId) && parentProductId > 0 ? parentProductId : undefined,
    openDrawer: !redirect,
  });
  if (redirect) window.location.href = typeof shopUrl === 'function' ? shopUrl('/checkout') : '/checkout';
}

// ----- Custom fields helpers (delegating to inline template functions) -----
function updateCustomFields(fields) {
  return window.CustomFields.render(fields);
}

function collectCustomFields() {
  return window.CustomFields.collect();
}

function hasCustomFields() {
  return window.CustomFields.hasAny();
}
