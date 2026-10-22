function openCart() {
  window.location.href = typeof shopUrl === 'function' ? shopUrl('/checkout') : '/checkout';
}

function closeCart() {
  return;
}

function addToCart({ packageId, quantity = 1, fields = {}, parent_product_id, order_bump_id, unit_price_override, openDrawer = false }) {
  const existingItem = Cart.get().find((item) => item.id === Number(packageId));

  Cart.add(packageId, quantity, fields, { parent_product_id, order_bump_id, unit_price_override });

  Cart.calculate().then(() => {
    const packageData = Cart.getPackages().find((pkg) => Number(pkg.id) === Number(packageId));
    const packageName = packageData && packageData.name ? packageData.name : 'Produto';

    if (typeof toast !== 'undefined' && toast.success) {
      toast.success(`${packageName} adicionado ao carrinho.`);
    }

    if (!existingItem && packageData) {
      Nerix.track('add_to_cart', {
        value: Cart.calculateTotal(),
        currency: store.currency,
        transaction_id: packageId,
        contents: [
          { id: packageId, name: packageData.name, quantity: 1, price: packageData.pricing.price },
        ],
      });
    }
  });

  updateCartBadge();
  void refreshHeaderCartGoalIndicator();

  // Drawer foi removido: adicionar ao carrinho apenas confirma via toast.
  // Redirecionamento para checkout fica somente no fluxo de "Comprar agora".
}

function cartAction(element, action) {
  const itemRoot = element.closest('[data-package-id]');
  const packageId = itemRoot ? itemRoot.getAttribute('data-package-id') : element.id;
  const parentProductId = itemRoot ? itemRoot.getAttribute('data-parent-product-id') : null;

  try {
    switch (action) {
      case 'increase':
        Cart.increase(packageId);
        break;
      case 'decrease':
        Cart.decrease(packageId);
        break;
      case 'input':
        const quantity = parseInt(element.value) || 1;
        Cart.update(packageId, quantity);
        break;
      case 'remove':
        Cart.remove(packageId, parentProductId);
        break;
    }

    Cart.revalidateQuantity();
    updateCartBadge();
    try {
      document.dispatchEvent(new CustomEvent('cart:updated'));
    } catch {}
  } catch (error) {
    console.error('Cart action error:', error);
  }
}

function initCartActionListeners(container) {
  if (!container) return;
  if (container.getAttribute && container.getAttribute('data-cart-listeners-attached') === 'true') {
    return;
  }

  const onClick = (e) => {
    const target = e.target.closest('[data-cart-action]');
    if (!target) return;
    if (!container.contains(target)) return;
    const action = target.getAttribute('data-cart-action');
    if (!action || action === 'input') return;
    cartAction(target, action);
  };

  const onBlur = (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.getAttribute('data-cart-action') !== 'input') return;
    if (!container.contains(target)) return;
    cartAction(target, 'input');
  };

  container.addEventListener('click', onClick);
  container.addEventListener('blur', onBlur, true);

  if (container.setAttribute) container.setAttribute('data-cart-listeners-attached', 'true');
}

function updateCartBadge() {
  const cartButton = document.querySelector('button.open-cart');
  if (cartButton) {
    const existingBadge = cartButton.querySelector('.cart-badge');
    if (existingBadge) {
      existingBadge.remove();
    }

    const count = Cart.getCount();
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className =
        'cart-badge pointer-events-none absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white/90 bg-white px-1.5 text-[11px] font-bold leading-none tabular-nums text-[#E83E8C] shadow-md ring-1 ring-[#FF69B4]/25';
      badge.textContent = count > 99 ? '99+' : String(count);
      cartButton.style.position = 'relative';
      cartButton.appendChild(badge);
    }
  }
}

/**
 * Indicador de progresso da Meta Premiada no botão "Carrinho" do header — visível em toda a
 * loja (não só no checkout), quando o lojista ativa `show_on_header`. Na página de checkout o
 * próprio checkout.js já busca o estado (evita buscar duas vezes); aqui cuidamos das demais.
 */
function renderHeaderCartGoalIndicator(state) {
  const buttons = document.querySelectorAll('button.open-cart');
  if (!buttons.length) return;

  const show =
    state &&
    state.enabled &&
    state.showOnHeader &&
    !state.blockedReason &&
    Array.isArray(state.tiers) &&
    state.tiers.length > 0 &&
    Number(state.subtotal) > 0;

  buttons.forEach((cartButton) => {
    const existing = cartButton.querySelector('.cart-goal-indicator');

    if (!show) {
      if (existing) existing.remove();
      cartButton.removeAttribute('title');
      return;
    }

    const maxThreshold = state.tiers[state.tiers.length - 1].threshold;
    const pct = maxThreshold > 0 ? Math.max(6, Math.min(100, (state.subtotal / maxThreshold) * 100)) : 0;
    const color = state.progressColor || '#3b82f6';
    const radius = 8;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (circumference * pct) / 100;
    const label = state.nextTier
      ? 'Faltam ' + Nerix.formatPrice(state.remainingToNext, store.currency) + ' para ' + (state.nextTier.reward_type === 'FREE_PRODUCT' ? 'seu brinde' : 'sua recompensa')
      : 'Todos os benefícios da ' + state.campaignName + ' desbloqueados!';
    cartButton.setAttribute('title', label);
    cartButton.style.position = 'relative';

    let badge = existing;
    if (!badge) {
      badge = document.createElement('span');
      badge.className =
        'cart-goal-indicator pointer-events-none absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#0a0a0a] ring-2 ring-white/95 shadow-sm shadow-black/30';
      badge.innerHTML =
        '<svg class="absolute inset-0" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">' +
        '<circle cx="10" cy="10" r="' + radius + '" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"></circle>' +
        '<circle class="cart-goal-indicator-ring" cx="10" cy="10" r="' + radius + '" fill="none" stroke-width="2" stroke-linecap="round" transform="rotate(-90 10 10)"></circle>' +
        '</svg>' +
        '<i class="ph-fill ph-gift cart-goal-indicator-icon relative z-10" style="font-size:9px" aria-hidden="true"></i>';
      cartButton.appendChild(badge);
    }

    const ring = badge.querySelector('.cart-goal-indicator-ring');
    if (ring) {
      ring.setAttribute('stroke', color);
      ring.setAttribute('stroke-dasharray', String(circumference));
      ring.setAttribute('stroke-dashoffset', String(offset));
    }
    const icon = badge.querySelector('.cart-goal-indicator-icon');
    if (icon) icon.style.color = color;
  });
}
window.__nerixRenderHeaderCartGoal = renderHeaderCartGoalIndicator;

async function refreshHeaderCartGoalIndicator() {
  try {
    if (document.getElementById('checkout')) return; // checkout.js já cuida do fetch por lá
    if (typeof Nerix === 'undefined' || typeof Nerix.evaluateCartGoal !== 'function') return;
    const items = (window.Cart?.get() || [])
      .filter((it) => it.cart_goal_reward !== true)
      .map((it) => ({
        product_id: it.parent_product_id != null ? Number(it.parent_product_id) : Number(it.id),
        variant_id: it.parent_product_id != null ? Number(it.id) : null,
      }));
    const subtotal = window.Cart?.calculateTotal?.() || 0;
    const result = await Nerix.evaluateCartGoal({ items, subtotal });
    renderHeaderCartGoalIndicator(result && result.data);
  } catch (e) {
    renderHeaderCartGoalIndicator(null);
  }
}

window.addEventListener('load', () => {
  updateCartBadge();
  void refreshHeaderCartGoalIndicator();
});

document.addEventListener('cart:updated', () => {
  void refreshHeaderCartGoalIndicator();
});
