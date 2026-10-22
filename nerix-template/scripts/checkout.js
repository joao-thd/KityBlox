const checkoutElement = document.querySelector('#checkout');

const PhoneInput =
  window.PhoneInput ||
  {
    init() {},
    getCountryCode() {
      return 'BR';
    },
    toE164(value) {
      return String(value || '').trim();
    },
  };

function collectCheckoutFields() {
  const container = document.getElementById('checkout_fields');
  const result = {};

  if (!container) return result;

  container.querySelectorAll('[data-field-id]').forEach((element) => {
    const fieldId = element.getAttribute('data-field-id');
    const fieldType = element.getAttribute('data-field-type');
    if (!fieldId) return;

    if (fieldType === 'SELECT') {
      const select = element.querySelector('select');
      if (select && select.value) result[fieldId] = select.value;
    } else if (fieldType === 'ROBLOX') {
      const value = element.getAttribute('data-value') || '';
      if (value) result[fieldId] = value;
    } else {
      const input = element.querySelector('input');
      const value = (input?.value || '').trim();
      if (value) result[fieldId] = value;
    }
  });

  return result;
}


const CreditCardHandler = (() => {
  let root = null;
  let initialized = false;
  let lastBrand = '';
  let onBrandChange = null;

  const brandPatterns = [
    { brand: 'visa', pattern: /^4/ },
    { brand: 'mastercard', pattern: /^(5[1-5]|2[2-7])/ },
    { brand: 'amex', pattern: /^3[47]/ },
    { brand: 'elo', pattern: /^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/ },
    { brand: 'hipercard', pattern: /^(606282|3841)/ },
  ];

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function detectBrand(number) {
    const digits = onlyDigits(number);
    const match = brandPatterns.find((item) => item.pattern.test(digits));
    return match ? match.brand : '';
  }

  function formatCardNumber(value) {
    return onlyDigits(value).slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
  }

  function formatExpiry(value) {
    const digits = onlyDigits(value).slice(0, 4);
    if (digits.length <= 2) return digits;
    return digits.slice(0, 2) + '/' + digits.slice(2);
  }

  function splitExpiry(value) {
    const digits = onlyDigits(value).padEnd(4, '0').slice(0, 4);
    return {
      month: digits.slice(0, 2),
      year: '20' + digits.slice(2, 4),
    };
  }

  function getInput(name) {
    return root ? root.querySelector('[name="' + name + '"]') : null;
  }

  function getInstallments() {
    const input = getInput('card_installments');
    return Math.max(1, parseInt((input && input.value) || '1', 10) || 1);
  }

  function parseFeeRates(raw) {
    try {
      const rates = JSON.parse(raw || '[]');
      return Array.isArray(rates) ? rates : [];
    } catch (error) {
      return [];
    }
  }

  function calculateRealCardFee(total, installments, gatewayData) {
    const rates = Array.isArray(gatewayData?.feeRates) ? gatewayData.feeRates : [];
    const selectedInstallments = Math.max(1, Math.min(12, parseInt(installments || '1', 10) || 1));
    const rate = rates.find((item) => Number(item.installments) === selectedInstallments);
    const percentage = Number(rate?.percentage || 0);
    const fixedFee = Number(gatewayData?.fixedFee || 0);
    return Math.round((Number(total || 0) * percentage + fixedFee) * 100) / 100;
  }

  function calculateInstallmentDisplayTotal(baseTotal, installments, gatewayData) {
    const safeBaseTotal = Number.isFinite(Number(baseTotal)) ? Math.max(0, Number(baseTotal)) : 0;
    if (!gatewayData || safeBaseTotal <= 0) return safeBaseTotal;
    if (gatewayData.feeType === 'CARD_REAL') {
      return Math.round((safeBaseTotal + calculateRealCardFee(safeBaseTotal, installments, gatewayData)) * 100) / 100;
    }
    if (gatewayData.isPercentageFee) {
      return Math.round((safeBaseTotal + safeBaseTotal * Number(gatewayData.fee || 0) / 100) * 100) / 100;
    }
    return Math.round((safeBaseTotal + Number(gatewayData.fee || 0)) * 100) / 100;
  }

  function updateInstallments(total, maxInstallments) {
    const input = getInput('card_installments');
    const container = root ? root.querySelector('#installments-container') : null;
    if (!input) return;

    const currentValue = getInstallments();
    const safeTotal = Number.isFinite(Number(total)) ? Math.max(0, Number(total)) : 0;
    const safeMax = Math.max(1, Math.min(12, parseInt(maxInstallments || '12', 10) || 12));
    const gatewayData = window.selectedGatewayData || null;

    input.innerHTML = '';
    for (let installment = 1; installment <= safeMax; installment += 1) {
      const option = document.createElement('option');
      const optionTotal = calculateInstallmentDisplayTotal(safeTotal, installment, gatewayData);
      option.value = String(installment);
      option.textContent = installment === 1
        ? 'A vista ' + Nerix.formatPrice(optionTotal, store.currency)
        : installment + 'x de ' + Nerix.formatPrice(optionTotal / installment, store.currency) + ' - total ' + Nerix.formatPrice(optionTotal, store.currency);
      input.appendChild(option);
    }

    input.value = String(Math.min(currentValue, safeMax));
    if (container) container.classList.toggle('hidden', safeMax <= 1);
  }

  function loadEfiScript() {
    if (window.EfiPay && window.EfiPay.CreditCard) return Promise.resolve();
    if (window.__efiPayScriptPromise) return window.__efiPayScriptPromise;

    window.__efiPayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/gh/efipay/js-payment-token-efi/dist/payment-token-efi-umd.min.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca de cartão da Efí.'));
      document.head.appendChild(script);
    });

    return window.__efiPayScriptPromise;
  }

  function init(container, options = {}) {
    root = container || document;
    onBrandChange = options.onBrandChange || null;
    if (initialized) return;
    initialized = true;

    const numberInput = getInput('card_number');
    const expiryInput = getInput('card_expiry');
    const cvvInput = getInput('card_cvv');
    const installmentsInput = getInput('card_installments');

    if (installmentsInput) {
      installmentsInput.addEventListener('change', () => {
        document.dispatchEvent(new CustomEvent('gateway:changed'));
      });
    }

    if (numberInput) {
      numberInput.addEventListener('input', () => {
        numberInput.value = formatCardNumber(numberInput.value);
        const nextBrand = detectBrand(numberInput.value);
        if (nextBrand !== lastBrand) {
          lastBrand = nextBrand;
          if (onBrandChange) onBrandChange(nextBrand);
        }
      });
    }

    if (expiryInput) {
      expiryInput.addEventListener('input', () => {
        expiryInput.value = formatExpiry(expiryInput.value);
      });
    }

    if (cvvInput) {
      cvvInput.addEventListener('input', () => {
        cvvInput.value = onlyDigits(cvvInput.value).slice(0, 4);
      });
    }
  }

  function loadScriptOnce(src, cacheKey, errorMessage) {
    if (!src) return Promise.reject(new Error(errorMessage));
    if (window[cacheKey]) return window[cacheKey];

    window[cacheKey] = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(errorMessage)), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(errorMessage));
      document.head.appendChild(script);
    });

    return window[cacheKey];
  }

  let walletElements = null;
  let walletCard = null;
  let mountedWalletProvider = null;

  function isWalletCardProvider(gateway) {
    return Boolean(gateway && gateway.walletCardProvider && gateway.publicKey && gateway.sdkUrl && gateway.sdkGlobal);
  }

  async function mountWalletCard(gateway) {
    if (!isWalletCardProvider(gateway)) return;
    const host = document.getElementById('wallet-card-element');
    if (!host) throw new Error('Campo seguro do cartao indisponivel.');
    if (mountedWalletProvider === gateway.walletCardProvider && walletElements) return;

    await loadScriptOnce(gateway.sdkUrl, '__walletCardSdkPromise', 'Erro ao carregar SDK do cartao.');
    const sdk = window[gateway.sdkGlobal];
    if (!sdk || typeof sdk.elements !== 'function') throw new Error('SDK do cartao indisponivel.');

    const isHttps = window.location.protocol === 'https:';
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    const isTestKey = String(gateway.publicKey).startsWith('pk_test_');
    if (!isHttps) {
      if (!isLocalhost) throw new Error('Cartao exige checkout em HTTPS. Acesse pela URL segura da loja.');
      if (!isTestKey) throw new Error('Chave Pagou live nao pode ser usada em localhost. Use uma chave pk_test ou abra a loja no dominio HTTPS.');
      if (typeof sdk.setEnvironment === 'function') sdk.setEnvironment('local');
    }

    if (walletCard && typeof walletCard.unmount === 'function') walletCard.unmount();
    host.innerHTML = '';
    walletElements = sdk.elements({ publicKey: gateway.publicKey, locale: 'pt-BR', origin: window.location.origin });
    walletCard = walletElements.create('card', { theme: 'default' });
    walletCard.mount('#wallet-card-element');
    mountedWalletProvider = gateway.walletCardProvider;

    root.querySelectorAll('[name="card_number"], [name="card_expiry"], [name="card_cvv"], [name="card_holder"]').forEach((input) => {
      input.style.display = 'none';
    });
    host.classList.remove('hidden');
  }

  async function submitWalletCard(createTransaction) {
    if (!walletElements) throw new Error('Preencha os dados do cartao no campo seguro.');
    return walletElements.submit({ createTransaction });
  }
  async function generateConfiguredWalletCardToken(gateway, cardData) {
    const publicKey = String(gateway.publicKey || '').trim();
    const sdkUrl = String(gateway.sdkUrl || '').trim();
    const sdkGlobal = String(gateway.sdkGlobal || '').trim();
    const tokenPrefix = String(gateway.cardTokenPrefix || '').trim();
    if (!publicKey || !sdkUrl || !sdkGlobal || !tokenPrefix) throw new Error('Cartao indisponivel no momento.');

    await loadScriptOnce(sdkUrl, '__walletCardSdkPromise', 'Erro ao carregar SDK do cartao.');
    if (!window[sdkGlobal]) throw new Error('SDK do cartao indisponivel.');

    const paymentToken = String(cardData.number || '').trim();
    if (!paymentToken.startsWith(tokenPrefix)) {
      throw new Error('Token de cartao invalido. Gere um token pelo componente seguro do provedor.');
    }

    return { payment_token: paymentToken, brand: cardData.brand };
  }

  async function generateEfiToken(gateway, cardData) {
    const payeeCode = String(gateway.payeeCode || '').trim();
    if (!payeeCode) throw new Error('Codigo da conta nao configurado para cartao.');

    await loadEfiScript();
    if (!window.EfiPay || !window.EfiPay.CreditCard) throw new Error('Biblioteca de cartao indisponível.');

    const creditCard = window.EfiPay.CreditCard
      .setAccount(payeeCode)
      .setEnvironment(gateway.sandbox ? 'sandbox' : 'production')
      .setCreditCardData({
        brand: cardData.brand,
        number: cardData.number,
        cvv: cardData.cvv,
        expirationMonth: cardData.expiry.month,
        expirationYear: cardData.expiry.year,
        holderName: cardData.holderName,
        holderDocument: cardData.holderDocument,
        reuse: false,
      });

    const result = await creditCard.getPaymentToken();
    const paymentToken = result && (result.payment_token || result.paymentToken || (result.data && result.data.payment_token));
    if (!paymentToken) throw new Error('Não foi possível tokenizar o cartão.');

    return { payment_token: paymentToken, brand: cardData.brand };
  }

  async function generateToken() {
    const gateway = window.selectedGatewayData || {};
    const number = onlyDigits(getInput('card_number') && getInput('card_number').value);
    const cvv = onlyDigits(getInput('card_cvv') && getInput('card_cvv').value);
    const holderName = String((getInput('card_holder') && getInput('card_holder').value) || (getInput('card_holder_name') && getInput('card_holder_name').value) || '').trim();
    const documentInput = root ? root.querySelector('input[name="client_document"]') : null;
    const holderDocument = onlyDigits(documentInput && documentInput.value);
    const expiry = splitExpiry(getInput('card_expiry') && getInput('card_expiry').value);
    const brand = detectBrand(number);

    if (!number || !cvv || !holderName || !holderDocument || !brand) {
      throw new Error('Preencha os dados do cartao e CPF corretamente.');
    }

    const cardData = { number, cvv, holderName, holderDocument, expiry, brand };
    if (gateway.walletCardProvider) {
      return generateConfiguredWalletCardToken(gateway, cardData);
    }

    return generateEfiToken(gateway, cardData);
  }

  return { init, generateToken, getInstallments, updateInstallments, parseFeeRates, calculateRealCardFee, isWalletCardProvider, mountWalletCard, submitWalletCard };
})();

window.CreditCardHandler = CreditCardHandler;

(function handleSelectPaymentMethod() {
  const buttons = checkoutElement.querySelectorAll('[data-payment-method]');
  const creditCardForm = document.getElementById('creditcard-form');

  buttons.forEach((element, index) => {
    const paymentMethod = element.getAttribute('data-payment-method');

    element.addEventListener('click', () => {
      if (element.getAttribute('data-selected') === 'true') return;

      checkoutElement
        .querySelectorAll('[data-payment-method][data-selected="true"]')
        .forEach((el) => el.setAttribute('data-selected', 'false'));

      element.setAttribute('data-selected', 'true');
      window.selectedGateway = paymentMethod;

      const rawFee = element.getAttribute('data-fee');
      const feeValue = rawFee && rawFee !== 'null' && rawFee !== '' ? parseFloat(rawFee) : 0;
      const isPercentageFee = element.getAttribute('data-is-percentage-fee') === 'true';
      const feeType = element.getAttribute('data-fee-type') || (isPercentageFee ? 'PERCENTAGE' : 'FIXED');

      window.selectedGatewayData = {
        provider: element.getAttribute('data-provider') || null,
        payeeCode: element.getAttribute('data-payee-code') || null,
        publicKey: element.getAttribute('data-public-key') || null,
        sdkUrl: element.getAttribute('data-sdk-url') || null,
        sdkGlobal: element.getAttribute('data-sdk-global') || null,
        cardTokenPrefix: element.getAttribute('data-card-token-prefix') || null,
        walletCardProvider: element.getAttribute('data-wallet-card-provider') || null,
        maxInstallments: parseInt(element.getAttribute('data-max-installments') || '12', 10),
        fee: feeValue,
        feeType: feeType,
        fixedFee: parseFloat(element.getAttribute('data-fixed-fee') || '0') || 0,
        feeRates: CreditCardHandler.parseFeeRates(element.getAttribute('data-fee-rates') || '[]'),
        isPercentageFee: isPercentageFee,
      };

      document.dispatchEvent(new CustomEvent('gateway:changed'));

      const docField = checkoutElement.querySelector('input[name="client_document"]');
      if (docField) {
        IMask(docField, { mask: '000.000.000-00' });

        const requireDoc =
          element.getAttribute('data-require-document') === 'true' ||
          docField.getAttribute('data-required') === 'true';
        if (requireDoc) docField.classList.remove('hidden');
        else {
          docField.classList.add('hidden');
        }
      }

      const phoneWrapper = checkoutElement.querySelector('#phone-field-wrapper');
      if (phoneWrapper) {
        const phoneMode = phoneWrapper.getAttribute('data-phone-mode') || 'DISABLED';
        const gatewayRequiresPhone = element.getAttribute('data-require-phone') === 'true';
        const showPhone = gatewayRequiresPhone || phoneMode === 'OPTIONAL' || phoneMode === 'REQUIRED';
        if (showPhone) {
          phoneWrapper.classList.remove('hidden');
          PhoneInput.init(phoneWrapper);
          const phoneInput = phoneWrapper.querySelector('input[name="client_phone"]');
          if (phoneInput) {
            phoneInput.placeholder = phoneMode === 'OPTIONAL' && !gatewayRequiresPhone
              ? 'Telefone (opcional)'
              : 'Telefone obrigatorio';
          }
        } else {
          phoneWrapper.classList.add('hidden');
        }
      }

      if (creditCardForm) {
        if (paymentMethod === 'CREDITCARD') {
          creditCardForm.classList.remove('hidden');
          CreditCardHandler.init(checkoutElement, {
            onBrandChange: (brand) => {
              const iconEl = document.getElementById('card-brand-icon');
              if (!iconEl) return;

              if (!brand) {
                iconEl.innerHTML = '';
                return;
              }

              iconEl.innerHTML = `<img src="https://cdn.nerix.com.br/public/gateway-icons/${brand.toLowerCase()}.svg" alt="${brand}" class="size-6" onerror="this.style.display='none'" onload="this.style.display=''" />`;
            },
          });
          if (window.selectedGatewayData?.walletCardProvider) {
            CreditCardHandler.mountWalletCard(window.selectedGatewayData).catch((error) => toast.error(error?.message || 'Nao foi possivel carregar o campo seguro do cartao.'));
          }
        } else {
          creditCardForm.classList.add('hidden');
        }
      }
    });

    if (index === 0) element.click();
  });
})();

window.Checkout = Object.assign(window.Checkout || {}, {
  getSelectedGateway() {
    return window.selectedGateway || null;
  },
});

(function initAddressAutofill() {
  const addressSection = document.getElementById('address-section');
  if (!addressSection) return;

  const cepInput = addressSection.querySelector('input[name="address_cep"]');
  const streetInput = addressSection.querySelector('input[name="address_street"]');
  const neighborhoodInput = addressSection.querySelector('input[name="address_neighborhood"]');
  const cityInput = addressSection.querySelector('input[name="address_city"]');
  const stateInput = addressSection.querySelector('input[name="address_state"]');
  const cepLoading = document.getElementById('cep-loading');
  const cepError = document.getElementById('cep-error');

  if (!cepInput) return;

  let debounceTimer;

  cepInput.addEventListener('input', (e) => {
    cepInput.value = Nerix.formatCEP(cepInput.value);
    if (cepError) cepError.textContent = '';

    const clean = cepInput.value.replace(/\D/g, '');
    clearTimeout(debounceTimer);

    if (clean.length === 8) {
      debounceTimer = setTimeout(() => fetchCep(clean), 300);
    }
  });

  async function fetchCep(cep) {
    try {
      if (cepLoading) cepLoading.classList.remove('hidden');
      if (cepError) cepError.textContent = '';

      const data = await Nerix.fetchCEP(cep);

      if (streetInput && data.logradouro) streetInput.value = data.logradouro;
      if (neighborhoodInput && data.bairro) neighborhoodInput.value = data.bairro;
      if (cityInput && data.localidade) cityInput.value = data.localidade;
      if (stateInput && data.uf) stateInput.value = data.uf;

      const numberInput = addressSection.querySelector('input[name="address_number"]');
      if (numberInput) numberInput.focus();
    } catch (err) {
      if (cepError) cepError.textContent = err.message || 'CEP não encontrado.';
    } finally {
      if (cepLoading) cepLoading.classList.add('hidden');
    }
  }
})();

(function initCheckoutRendering() {
  if (!checkoutElement) return;

  const packagesList = checkoutElement.querySelector('#packages-list');
  const emptyPackagesHTML = checkoutElement.querySelector('#empty-packages')?.outerHTML || '';
  const pricing = checkoutElement.querySelector('#pricing');
  const coupon = checkoutElement.querySelector('#coupon');
  const couponInput = coupon?.querySelector('input');
  const couponButton = coupon?.querySelector('button');
  const couponError = coupon?.querySelector('#coupon-error');

  /** @type {null | { id:number, coupon:string, type:'PERCENTAGE'|'PRICE', value:number, applies_to?: number[] }} */
  let appliedDiscount = null;

  const loyaltyCreditToggle = document.getElementById('loyalty-credit-toggle');
  const loyaltyCreditCheckbox = document.getElementById('loyalty-credit-checkbox');
  const loyaltyCreditAvailableEl = document.getElementById('loyalty-credit-available');
  let loyaltyCreditAvailable = 0;
  let loyaltyCreditMaxPercent = 100;

  function customerToken() {
    try {
      var sub = (window.NERIX && window.NERIX.shopSubdomain) || (window.NERIX && window.NERIX.storeParam) || '';
      return sub ? localStorage.getItem('customer_token_' + sub) || '' : '';
    } catch (e) {
      return '';
    }
  }

  async function loadLoyaltyCredit() {
    var token = customerToken();
    if (!token || !loyaltyCreditToggle) return;
    try {
      var res = await fetch(window.location.origin + '/api/public/loyalty', {
        headers: { Authorization: 'Bearer ' + token, 'X-Store-Subdomain': (window.NERIX && window.NERIX.shopSubdomain) || '' },
        credentials: 'include',
      });
      if (!res.ok) return;
      var data = await res.json();
      if (!data.enabled || !(Number(data.credit_balance) > 0)) return;
      loyaltyCreditAvailable = Number(data.credit_balance);
      loyaltyCreditMaxPercent = Number(data.max_credit_usage_percent_per_order);
      if (!isFinite(loyaltyCreditMaxPercent) || loyaltyCreditMaxPercent <= 0) loyaltyCreditMaxPercent = 100;
      if (loyaltyCreditAvailableEl) loyaltyCreditAvailableEl.textContent = Nerix.formatPrice(loyaltyCreditAvailable, store.currency);
      if (loyaltyCreditMaxPercent < 100) {
        var labelEl = loyaltyCreditToggle.querySelector('label');
        var hint = loyaltyCreditToggle.querySelector('.loyalty-credit-max-hint');
        if (labelEl && !hint) {
          hint = document.createElement('span');
          hint.className = 'loyalty-credit-max-hint block text-[11px] font-normal opacity-75';
          labelEl.appendChild(hint);
        }
        if (hint) hint.textContent = 'Cobre até ' + loyaltyCreditMaxPercent + '% do valor do pedido.';
      }
      loyaltyCreditToggle.classList.remove('hidden');
      loyaltyCreditToggle.classList.add('flex');
    } catch (e) {}
  }
  loadLoyaltyCredit();
  if (loyaltyCreditCheckbox) loyaltyCreditCheckbox.addEventListener('change', updatePricingUI);

  const cartGoalEl = document.getElementById('checkout-cart-goal');
  const orderBumpsEl = document.getElementById('checkout-order-bumps');

  function cartKeySub() {
    return (
      (window.NERIX && window.NERIX.shopSubdomain) ||
      (window.NERIX && window.NERIX.storeParam) ||
      'default'
    );
  }

  // Meta Premiada: o estado (níveis, progresso, elegibilidade) vem sempre do endpoint público
  // /api/public/cart-goal/evaluate — cartGoalService no backend é a única fonte da verdade,
  // então o que aparece aqui é exatamente o que orderService valida no fechamento do pedido.
  let cartGoalState = null;
  let cartGoalRedeemedThresholds = [];
  let cartGoalFetchToken = 0;

  function loadCartGoalRedeemedLS() {
    try {
      const raw = JSON.parse(localStorage.getItem('cart_goal_redeemed_' + cartKeySub()) || '[]');
      cartGoalRedeemedThresholds = Array.isArray(raw) ? raw.map(Number).filter((n) => Number.isFinite(n)) : [];
    } catch (e) {
      cartGoalRedeemedThresholds = [];
    }
  }

  function saveCartGoalRedeemedLS() {
    try {
      localStorage.setItem('cart_goal_redeemed_' + cartKeySub(), JSON.stringify(cartGoalRedeemedThresholds));
    } catch (e) {}
  }
  loadCartGoalRedeemedLS();

  function cartGoalAppliedTiers() {
    if (!cartGoalState || !cartGoalState.enabled || cartGoalState.blockedReason) return [];
    return (cartGoalState.tiers || []).filter(
      (t) => t.achieved && (cartGoalState.redemptionMode === 'automatic' || cartGoalRedeemedThresholds.includes(t.threshold))
    );
  }

  function computeCartGoalDiscountAmount() {
    const applied = cartGoalAppliedTiers().filter((t) => t.reward_type === 'PERCENTAGE' || t.reward_type === 'FIXED');
    if (!applied.length) return 0;
    const total = applied.reduce((sum, t) => {
      const v = t.reward_type === 'FIXED' ? Number(t.reward_value || 0) : (cartGoalState.subtotal * Number(t.reward_value || 0)) / 100;
      return sum + v;
    }, 0);
    return Math.min(Math.round(total * 100) / 100, cartGoalState.subtotal);
  }

  /** Garante que os brindes (nível FREE_PRODUCT) no carrinho batem com os níveis aplicados agora — adiciona o que falta, remove o que não é mais elegível. Devolve true se mexeu no carrinho. */
  function syncCartGoalFreeProducts() {
    if (!window.Cart) return false;
    const appliedProductIds = new Set(
      cartGoalAppliedTiers()
        .filter((t) => t.reward_type === 'FREE_PRODUCT' && t.product_id)
        .map((t) => Number(t.product_id))
    );
    const current = window.Cart.get() || [];
    let changed = false;
    current
      .filter((it) => it.cart_goal_reward === true && !appliedProductIds.has(Number(it.id)))
      .forEach((it) => {
        window.Cart.remove(it.id);
        changed = true;
      });
    appliedProductIds.forEach((productId) => {
      const already = (window.Cart.get() || []).some((it) => it.cart_goal_reward === true && Number(it.id) === productId);
      if (!already) {
        window.Cart.add(productId, 1, {}, { cart_goal_reward: true });
        changed = true;
      }
    });
    return changed;
  }

  async function refreshCartGoalState() {
    const token = ++cartGoalFetchToken;
    try {
      const items = (window.Cart?.get() || [])
        .filter((it) => it.cart_goal_reward !== true)
        .map((it) => ({
          product_id: it.parent_product_id != null ? Number(it.parent_product_id) : Number(it.id),
          variant_id: it.parent_product_id != null ? Number(it.id) : null,
        }));
      const subtotal = window.Cart?.calculateTotal?.() || 0;
      const result = await Nerix.evaluateCartGoal({ items, subtotal, coupon_active: !!appliedDiscount });
      if (token !== cartGoalFetchToken) return;
      cartGoalState = (result && result.data) || null;
    } catch (e) {
      if (token !== cartGoalFetchToken) return;
      cartGoalState = null;
    }

    // Poda níveis resgatados manualmente que deixaram de ser alcançados (ex.: item removido do carrinho).
    if (cartGoalState) {
      const achieved = new Set((cartGoalState.tiers || []).filter((t) => t.achieved).map((t) => t.threshold));
      const pruned = cartGoalRedeemedThresholds.filter((t) => achieved.has(t));
      if (pruned.length !== cartGoalRedeemedThresholds.length) {
        cartGoalRedeemedThresholds = pruned;
        saveCartGoalRedeemedLS();
      }
    }

    const cartChanged = syncCartGoalFreeProducts();
    renderCartGoal();
    if (typeof window.__nerixRenderHeaderCartGoal === 'function') window.__nerixRenderHeaderCartGoal(cartGoalState);
    updatePricingUI();
    if (cartChanged) refreshCartGoalState();
  }

  function cartGoalTierBadge(tier) {
    if (tier.reward_type === 'FREE_PRODUCT') return 'Brinde';
    if (tier.reward_type === 'FIXED') return Nerix.formatPrice(tier.reward_value, store.currency);
    return tier.reward_value + '%';
  }

  function cartGoalRewardLabel(tier) {
    if (tier.reward_type === 'FREE_PRODUCT') return 'ganhar um brinde';
    if (tier.reward_type === 'FIXED') return Nerix.formatPrice(tier.reward_value, store.currency) + ' de desconto';
    return tier.reward_value + '% de desconto';
  }

  function cartGoalTierTypeIconHtml(tier) {
    if (tier.reward_type === 'FREE_PRODUCT') return '<i class="ph ph-gift" aria-hidden="true"></i>';
    if (tier.reward_type === 'FIXED') return '<i class="ph ph-tag" aria-hidden="true"></i>';
    return '<i class="ph ph-percent" aria-hidden="true"></i>';
  }

  function resetCartGoalCardStyle() {
    if (!cartGoalEl) return;
    cartGoalEl.style.background = '';
    cartGoalEl.style.borderColor = '';
  }

  function renderCartGoal() {
    if (!cartGoalEl) return;
    const state = cartGoalState;

    if (!state || !state.enabled || !state.showOnCheckout || !(state.tiers || []).length || state.blockedReason) {
      cartGoalEl.classList.add('hidden');
      cartGoalEl.innerHTML = '';
      resetCartGoalCardStyle();
      return;
    }

    const color = state.progressColor || '#3b82f6';
    const tiers = state.tiers;
    const maxThreshold = tiers[tiers.length - 1].threshold;
    const allDone = !state.nextTier;
    const statusText = allDone
      ? 'Você desbloqueou tudo! 🎉'
      : 'Faltam ' + Nerix.formatPrice(state.remainingToNext, store.currency) + ' para ' + cartGoalRewardLabel(state.nextTier);

    const pins = tiers
      .map((tier) => {
        const left = maxThreshold > 0 ? Math.min(100, (tier.threshold / maxThreshold) * 100) : 0;
        const circle = tier.achieved
          ? '<span class="flex size-5 items-center justify-center rounded-full text-[11px] text-white shadow-sm shadow-black/30" style="background-color:' +
            escapeCheckoutHtml(color) +
            '"><i class="ph-fill ph-check" aria-hidden="true"></i></span>'
          : '<span class="flex size-5 items-center justify-center rounded-full border border-white/15 bg-background text-[11px] text-muted-foreground">' +
            cartGoalTierTypeIconHtml(tier) +
            '</span>';
        return (
          '<div class="absolute top-0 flex w-14 -translate-x-1/2 flex-col items-center gap-1 text-center" style="left:' +
          left +
          '%">' +
          circle +
          '<span class="truncate text-[10px] font-medium leading-none ' +
          (tier.achieved ? 'text-emerald-400' : 'text-muted-foreground') +
          '">' +
          escapeCheckoutHtml(cartGoalTierBadge(tier)) +
          '</span>' +
          '</div>'
        );
      })
      .join('');

    const fillPct = maxThreshold > 0 ? Math.min(100, (state.subtotal / maxThreshold) * 100) : 0;
    const anim = state.animatedBar ? ' transition-all duration-500' : '';

    const manualRedeemableTiers =
      state.redemptionMode === 'manual'
        ? tiers.filter((t) => t.achieved && !cartGoalRedeemedThresholds.includes(t.threshold))
        : [];
    const btn = manualRedeemableTiers.length
      ? '<button type="button" id="checkout-redeem-cart-goal" class="mt-3 w-full btn-primary h-9 text-sm">' +
        escapeCheckoutHtml(state.redeemButtonText) +
        '</button>'
      : '';

    cartGoalEl.classList.remove('hidden');
    cartGoalEl.style.background =
      'linear-gradient(135deg, color-mix(in srgb, ' + color + ' 12%, transparent), rgba(255,255,255,0.03))';
    cartGoalEl.style.borderColor = 'color-mix(in srgb, ' + color + ' 30%, transparent)';
    cartGoalEl.innerHTML =
      '<div class="flex items-start gap-3">' +
      '<span class="flex size-9 shrink-0 items-center justify-center rounded-full text-base" style="background-color:color-mix(in srgb, ' +
      escapeCheckoutHtml(color) +
      ' 16%, transparent);color:' +
      escapeCheckoutHtml(color) +
      '"><i class="ph-fill ph-gift" aria-hidden="true"></i></span>' +
      '<div class="min-w-0 flex-1 pt-0.5">' +
      '<p class="truncate text-sm font-semibold text-foreground">' +
      escapeCheckoutHtml(state.campaignName) +
      '</p>' +
      '<p class="mt-0.5 text-xs text-muted-foreground">' +
      escapeCheckoutHtml(statusText) +
      '</p>' +
      '</div>' +
      '</div>' +
      '<div class="relative mt-4 px-1.5">' +
      '<div class="h-2 w-full overflow-hidden rounded-full bg-white/10">' +
      '<div class="h-full rounded-full' +
      anim +
      '" style="width:' +
      fillPct +
      '%;background-color:' +
      escapeCheckoutHtml(color) +
      '"></div>' +
      '</div>' +
      '<div class="relative mt-2 h-9">' +
      pins +
      '</div>' +
      '</div>' +
      btn;

    const redeemBtn = document.getElementById('checkout-redeem-cart-goal');
    if (redeemBtn) {
      redeemBtn.addEventListener('click', () => {
        manualRedeemableTiers.forEach((t) => {
          if (!cartGoalRedeemedThresholds.includes(t.threshold)) cartGoalRedeemedThresholds.push(t.threshold);
        });
        saveCartGoalRedeemedLS();
        syncCartGoalFreeProducts();
        renderCartGoal();
        updatePricingUI();
        try {
          document.dispatchEvent(new CustomEvent('checkout:progressive-changed'));
        } catch (e2) {}
      });
    }
  }

  function escapeCheckoutHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function apiStoreHeaders() {
    const h = { Accept: 'application/json' };
    const sub = (window.NERIX && window.NERIX.shopSubdomain) || '';
    if (sub) h['X-Store-Subdomain'] = sub;
    return h;
  }

  async function refreshOrderBumps() {
    if (!orderBumpsEl) return;
    const items = Cart.get() || [];
    if (items.length === 0) {
      orderBumpsEl.classList.add('hidden');
      orderBumpsEl.innerHTML = '';
      return;
    }
    let bumps = [];
    try {
      const res = await fetch(window.location.origin + '/api/public/order-bumps/active', {
        headers: apiStoreHeaders(),
        credentials: 'same-origin',
      });
      if (res.ok) bumps = await res.json();
    } catch (e) {
      bumps = [];
    }
    if (!Array.isArray(bumps) || bumps.length === 0) {
      orderBumpsEl.classList.add('hidden');
      orderBumpsEl.innerHTML = '';
      return;
    }

    orderBumpsEl.classList.remove('hidden');
    orderBumpsEl.innerHTML =
      '<p class="text-xs font-semibold text-foreground flex items-center gap-1.5">' +
      '<i class="ph ph-sparkle text-primary" aria-hidden="true"></i> Oferta especial</p>' +
      '<div class="space-y-2 mt-2" id="checkout-order-bumps-list"></div>';
    const list = document.getElementById('checkout-order-bumps-list');
    if (!list) return;

    const html = bumps
      .map((bump) => {
        const product = bump.product;
        if (!product) return '';
        const isVariant = !!bump.variant_id;
        const lineId = isVariant ? Number(product.id || bump.variant_id) : Number(product.id);
        const parentId = isVariant ? Number(bump.product_id) : null;
        const hasStockInfo =
          product.available_stock !== undefined &&
          product.available_stock !== null &&
          String(product.available_stock).trim() !== '';
        const stockQty = hasStockInfo ? Number(product.available_stock) : null;
        const isOutOfStock =
          product.stock_available === false ||
          (hasStockInfo && Number.isFinite(stockQty) && stockQty <= 0);
        const inCart = items.some((it) => {
          if (isVariant) return Number(it.id) === lineId && Number(it.parent_product_id) === parentId;
          return Number(it.id) === lineId && !it.parent_product_id;
        });
        const basePrice = Number(product.price || 0);
        const custom = bump.custom_price != null ? Number(bump.custom_price) : null;
        const price = custom != null && !isNaN(custom) && custom > 0 ? custom : basePrice;
        let img = '';
        if (product.images) {
          const first = Array.isArray(product.images) ? product.images[0] : product.images;
          if (first) img = String(first);
        } else if (product.image_url) {
          img = String(product.image_url);
        }
        const imgTag = img
          ? '<img src="' +
            escapeCheckoutHtml(img) +
            '" alt="" class="size-11 rounded object-cover bg-white/5 shrink-0" loading="lazy" />'
          : '<div class="size-11 rounded bg-white/5 shrink-0 grid place-items-center"><i class="ph ph-package opacity-60" aria-hidden="true"></i></div>';

        const ctaBlock = bump.cta
          ? '<div class="text-xs font-medium text-foreground mb-1">' + escapeCheckoutHtml(bump.cta) + '</div>'
          : '';

        const btn = isOutOfStock
          ? '<span class="text-xs text-red-400">Sem estoque</span>'
          : inCart
          ? '<span class="text-xs text-green-400">No carrinho</span>'
          : '<button type="button" class="btn-outline h-8 px-3 text-xs shrink-0" data-order-bump-add="' +
            bump.id +
            '">Adicionar</button>';

        return (
          '<div class="flex gap-2 items-center rounded-md border border-white/10 p-2 bg-background/30">' +
          imgTag +
          '<div class="min-w-0 flex-1">' +
          ctaBlock +
          '<div class="text-sm font-medium truncate">' +
          escapeCheckoutHtml(product.name || bump.title) +
          '</div>' +
          '<div class="text-xs text-muted-foreground">' +
          Nerix.formatPrice(price, store.currency) +
          '</div></div>' +
          btn +
          '</div>'
        );
      })
      .filter(Boolean)
      .join('');

    list.innerHTML = html;
    list.querySelectorAll('[data-order-bump-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-order-bump-add'), 10);
        const bump = bumps.find((b) => Number(b.id) === id);
        if (!bump || !bump.product) return;
        const product = bump.product;
        const hasStockInfo =
          product.available_stock !== undefined &&
          product.available_stock !== null &&
          String(product.available_stock).trim() !== '';
        const stockQty = hasStockInfo ? Number(product.available_stock) : null;
        const isOutOfStock =
          product.stock_available === false ||
          (hasStockInfo && Number.isFinite(stockQty) && stockQty <= 0);
        if (isOutOfStock) return;
        const isVariant = !!bump.variant_id;
        const lineId = isVariant ? Number(product.id || bump.variant_id) : Number(product.id);
        const parentId = isVariant ? Number(bump.product_id) : null;
        const basePrice = Number(product.price || 0);
        const custom = bump.custom_price != null ? Number(bump.custom_price) : null;
        const unit = custom != null && !isNaN(custom) && custom > 0 ? custom : basePrice;
        Cart.add(
          lineId,
          1,
          {},
          {
            parent_product_id: parentId,
            order_bump_id: bump.id,
            unit_price_override: unit,
          }
        );
        Cart.calculate().then(() => {
          renderPackages();
          try {
            document.dispatchEvent(new Event('cart:updated'));
          } catch (e3) {}
        });
      });
    });
  }

  function setCouponButtonState(state) {
    if (!couponButton) return;
    couponButton.setAttribute('data-state', state);
  }

  function computeTotals() {
    const subtotal = window.Cart?.calculateTotal?.() || 0;
    const progressiveDiscount = computeCartGoalDiscountAmount();

    let couponDiscount = 0;
    if (appliedDiscount && subtotal > 0) {
      const applicableSubtotal = subtotal;

      if (appliedDiscount.type === 'PERCENTAGE') {
        couponDiscount = applicableSubtotal * (Number(appliedDiscount.value || 0) / 100);
      } else if (appliedDiscount.type === 'PRICE') {
        couponDiscount = Math.min(Number(appliedDiscount.value || 0), applicableSubtotal);
      }
    }

    let gatewayDiscount = 0;
    let feeValue = 0;
    const installmentBaseTotal = Math.max(0, subtotal - couponDiscount - progressiveDiscount);
    const gatewayData = window.selectedGatewayData;
    if (gatewayData && (gatewayData.fee !== 0 || gatewayData.feeType === 'CARD_REAL') && subtotal > 0) {
      if (gatewayData.fee < 0) {
        const absFee = Math.abs(gatewayData.fee);
        if (gatewayData.isPercentageFee) {
          gatewayDiscount = subtotal * (absFee / 100);
        } else {
          gatewayDiscount = absFee;
        }
      } else {
        const afterDiscount = installmentBaseTotal;
        if (gatewayData.feeType === 'CARD_REAL') {
          feeValue = CreditCardHandler.calculateRealCardFee(afterDiscount, CreditCardHandler.getInstallments(), gatewayData);
        } else if (gatewayData.isPercentageFee) {
          feeValue = afterDiscount * (gatewayData.fee / 100);
        } else {
          feeValue = gatewayData.fee;
        }
      }
    }

    const totalDiscount = couponDiscount + gatewayDiscount;
    const totalBeforeCredit = Math.max(
      0,
      subtotal - couponDiscount - gatewayDiscount - progressiveDiscount + feeValue
    );
    const creditApplied =
      loyaltyCreditCheckbox && loyaltyCreditCheckbox.checked
        ? (() => {
            const maxByPercent = Math.floor(totalBeforeCredit * (loyaltyCreditMaxPercent / 100) * 100) / 100;
            return Math.round(Math.min(loyaltyCreditAvailable, totalBeforeCredit, maxByPercent) * 100) / 100;
          })()
        : 0;
    const total = Math.max(0, totalBeforeCredit - creditApplied);
    return {
      subtotal,
      discountValue: totalDiscount,
      progressiveDiscount,
      feeValue,
      creditApplied,
      total,
      installmentBaseTotal,
    };
  }

  function updatePricingUI() {
    if (!pricing) return;
    const { subtotal, discountValue, progressiveDiscount, feeValue, creditApplied, total, installmentBaseTotal } = computeTotals();
    const subtotalEl = pricing.querySelector('.subtotal-value');
    const discountEl = pricing.querySelector('.discount-value');
    const feeEl = pricing.querySelector('.fee-value');
    const feeRow = document.getElementById('fee-row');
    const totalEl = pricing.querySelector('.total-value');
    const payButtonPrice = document.querySelector('#pay-button-price');
    const progressiveRow = document.getElementById('progressive-discount-row');
    const progressiveVal = pricing.querySelector('.progressive-discount-value');
    const loyaltyCreditRow = document.getElementById('loyalty-credit-row');
    const loyaltyCreditVal = pricing.querySelector('.loyalty-credit-value');

    if (subtotalEl) subtotalEl.textContent = Nerix.formatPrice(subtotal, store.currency);
    if (discountEl) discountEl.textContent = Nerix.formatPrice(discountValue, store.currency);
    if (loyaltyCreditRow && loyaltyCreditVal) {
      if (creditApplied > 0) {
        loyaltyCreditRow.classList.remove('hidden');
        loyaltyCreditVal.textContent = '- ' + Nerix.formatPrice(creditApplied, store.currency);
      } else {
        loyaltyCreditRow.classList.add('hidden');
      }
    }
    if (progressiveRow && progressiveVal) {
      if (progressiveDiscount > 0) {
        progressiveRow.classList.remove('hidden');
        progressiveVal.textContent = '- ' + Nerix.formatPrice(progressiveDiscount, store.currency);
      } else {
        progressiveRow.classList.add('hidden');
      }
    }
    if (feeRow) {
      if (feeValue > 0) {
        feeRow.classList.remove('hidden');
        if (feeEl) feeEl.textContent = Nerix.formatPrice(feeValue, store.currency);
      } else {
        feeRow.classList.add('hidden');
      }
    }
    if (totalEl) totalEl.textContent = Nerix.formatPrice(total, store.currency);
    if (payButtonPrice) payButtonPrice.textContent = Nerix.formatPrice(total, store.currency);
    if (window.selectedGateway === 'CREDITCARD' && window.CreditCardHandler?.updateInstallments) {
      window.CreditCardHandler.updateInstallments(installmentBaseTotal, window.selectedGatewayData?.maxInstallments || 12);
    }
  }

  function renderPackages() {
    if (!packagesList) return;
    const pkgs = window.Cart?.getPackages?.() || [];
    if (!pkgs.length) {
      packagesList.innerHTML = emptyPackagesHTML;
      if (orderBumpsEl) {
        orderBumpsEl.classList.add('hidden');
        orderBumpsEl.innerHTML = '';
      }
      if (cartGoalEl) {
        cartGoalState = null;
        cartGoalFetchToken += 1;
        cartGoalEl.classList.add('hidden');
        cartGoalEl.innerHTML = '';
        resetCartGoalCardStyle();
        if (typeof window.__nerixRenderHeaderCartGoal === 'function') window.__nerixRenderHeaderCartGoal(null);
      }
      updatePricingUI();
      return;
    }

    packagesList.innerHTML = getCheckoutItemsRender(pkgs);
    updatePricingUI();
    void refreshCartGoalState();
    void refreshOrderBumps();
    initCartActionListeners(packagesList);
  }

  let dynamicCheckoutFields = null;

  function detectCheckoutStoreSubdomain() {
    try {
      if (window.NERIX && (window.NERIX.shopSubdomain || window.NERIX.storeParam)) {
        return String(window.NERIX.shopSubdomain || window.NERIX.storeParam || '').trim();
      }
      const host = window.location.hostname || '';
      const isLocal =
        host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
      if (!isLocal) return '';
      const first = (window.location.pathname || '/').split('/').filter(Boolean)[0] || '';
      const blocked = {
        api: true,
        login: true,
        register: true,
        checkout: true,
        payment: true,
        order: true,
        chat: true,
        categories: true,
        terms: true,
        account: true,
      };
      return !first || blocked[first] ? '' : first;
    } catch (e) {
      return '';
    }
  }

  async function refreshCheckoutFieldsSource() {
    try {
      const cartItems = Cart.get() || [];
      const ids = Array.from(
        new Set(
          cartItems
            .flatMap((i) => [Number(i.id), Number(i.parent_product_id)])
            .filter((n) => Number.isFinite(n) && n > 0)
        )
      );

      if (ids.length === 0) {
        dynamicCheckoutFields = [];
        return;
      }

      const sub = detectCheckoutStoreSubdomain();
      const query = new URLSearchParams();
      ids.forEach((id) => query.append('product_ids', String(id)));
      if (sub) query.set('store', sub);

      const response = await fetch('/api/public/checkout-fields?' + query.toString(), {
        headers: sub ? { 'X-Store-Subdomain': sub } : {},
      });
      if (!response.ok) throw new Error('checkout-fields fetch failed');

      const data = await response.json();
      dynamicCheckoutFields = Array.isArray(data) ? data : [];
    } catch (e) {
      // fallback para os dados embutidos no HTML
      dynamicCheckoutFields = null;
    }
  }

  function normalizeCheckoutField(rawField, idx) {
    const src = rawField && typeof rawField === 'object' ? rawField : {};
    const rawType = String(src.type || src.field_type || 'TEXT').toUpperCase();
    let type = rawType;
    if (type === 'TEXT' || type === 'STRING') type = 'TEXT';
    else if (type === 'NUMBER' || type === 'NUMERIC') type = 'NUMBER';
    else if (type === 'SELECT') type = 'SELECT';
    else if (type === 'ROBLOX') type = 'ROBLOX';
    else if (type === 'WHATSAPP' || type === 'PHONE' || type === 'TEL') type = 'WHATSAPP';
    else type = 'TEXT';

    const idNum = Number(src.id);
    const safeName = Number.isFinite(idNum) && idNum > 0 ? String(idNum) : `field_${idx + 1}`;
    return {
      id: Number.isFinite(idNum) && idNum > 0 ? idNum : null,
      name: safeName,
      type,
      label: String(src.title || src.label || '').trim(),
      description: String(src.description || '').trim(),
      placeholder: String(src.placeholder || '').trim(),
      required: src.required === true || src.is_required === true,
      min: src.min ?? src.min_length ?? null,
      max: src.max ?? src.max_length ?? null,
      options: Array.isArray(src.options) ? src.options : [],
      applies_to: Array.isArray(src.applies_to) ? src.applies_to : [],
    };
  }

  function renderCheckoutFields() {
    const container = document.getElementById('checkout_fields');
    const fields = Array.isArray(dynamicCheckoutFields)
      ? dynamicCheckoutFields
      : getScriptData('__nerix_checkout_fields', []);
    if (!container) return;

    if (!Array.isArray(fields) || fields.length === 0) {
      container.classList.add('hidden');
      return;
    }

    let cartIds = new Set();
    const cartItems = Cart.get();
    cartIds = new Set(
      (cartItems || [])
        .flatMap((i) => [parseInt(i.id), parseInt(i.parent_product_id)])
        .filter((n) => Number.isFinite(n) && n > 0)
    );

    const applicable = fields.filter((field) => {
      const arr = Array.isArray(field.applies_to) ? field.applies_to : [];
      // Campo global explícito
      if (arr.includes(-1)) return true;
      // Campo sem vínculo (UI mostra "Aplica-se a: Nenhum"): trata como global
      if (arr.length === 0) return true;
      if (cartIds.size === 0) return false;
      return arr.some((pid) => cartIds.has(pid));
    });

    if (applicable.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    const normalized = applicable.map(normalizeCheckoutField);
    const html = getCheckoutFieldsRender(normalized);
    container.innerHTML = html;

    CustomFields.afterRender(container);
  }

  async function applyCoupon(code) {
    if (!code) {
      if (couponError) couponError.textContent = 'Informe um cupom válido';
      return;
    }
    if (
      cartGoalState &&
      cartGoalState.enabled &&
      (cartGoalState.tiers || []).length > 0 &&
      !cartGoalState.allowWithCoupon &&
      cartGoalAppliedTiers().length > 0
    ) {
      if (couponError)
        couponError.textContent = 'Cupom indisponível enquanto a meta premiada estiver ativa.';
      return;
    }
    try {
      if (couponError) couponError.textContent = '';
      const { data } = await Nerix.getDiscount(code);
      if (!data) {
        throw new Error(data?.message || 'Cupom inválido');
      }
      const discount = data;
      const appliesToAll = Array.isArray(discount.applies_to) && discount.applies_to.includes(-1);
      const cartItems = Cart.get() || [];
      if (!appliesToAll && cartItems.length > 0) {
        const hasIneligible = cartItems.some((item) => {
          const lineIds = [Number(item.id)];
          if (item.parent_product_id != null) lineIds.push(Number(item.parent_product_id));
          return lineIds
            .filter((n) => Number.isFinite(n) && n > 0)
            .some((id) => !discount.applies_to.includes(id));
        });
        if (hasIneligible) {
          throw new Error(
            'O cupom de desconto não é aplicável para um ou mais itens no seu carrinho.'
          );
        }
      }
      appliedDiscount = discount;
      localStorage.setItem('cart-discount', JSON.stringify({ coupon: discount.coupon, discount }));
      setCouponButtonState('remove');
      renderPackages();
    } catch (err) {
      if (couponError)
        couponError.textContent = err?.message || 'Não foi possível aplicar este cupom';
      appliedDiscount = null;
      localStorage.removeItem('cart-discount');
      setCouponButtonState('apply');
      updatePricingUI();
    }
  }

  function removeCoupon() {
    appliedDiscount = null;
    localStorage.removeItem('cart-discount');
    setCouponButtonState('apply');
    if (couponError) couponError.textContent = '';
    if (couponInput) couponInput.value = '';
    void refreshCartGoalState();
  }

  async function restoreCoupon() {
    try {
      const raw = localStorage.getItem('cart-discount');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (couponInput && saved?.coupon) couponInput.value = saved.coupon;
      await applyCoupon(saved?.coupon);
    } catch {}
  }

  async function init() {
    try {
      loadCartGoalRedeemedLS();
      await window.Cart?.calculate?.();
      renderPackages();
      await refreshCheckoutFieldsSource();
      renderCheckoutFields();
      await restoreCoupon();
    } catch (err) {}
  }

  couponButton?.addEventListener('click', async () => {
    if (appliedDiscount) {
      removeCoupon();
      return;
    }
    await applyCoupon(couponInput?.value?.trim());
  });

  init();

  document.addEventListener('cart:updated', async () => {
    renderPackages();
    await refreshCheckoutFieldsSource();
    renderCheckoutFields();
  });

  document.addEventListener('gateway:changed', () => {
    updatePricingUI();
  });

  document.addEventListener('checkout:progressive-changed', () => {
    renderCartGoal();
    updatePricingUI();
  });

  window.__nerixCheckoutState = {
    getAppliedDiscount() {
      return appliedDiscount;
    },
    getCartGoalRedeemedThresholds() {
      return cartGoalRedeemedThresholds.slice();
    },
    cartKeySub,
    getCreditApplied() {
      return computeTotals().creditApplied;
    },
  };
})();

(function initCheckoutSubmit() {
  if (!checkoutElement) return;

  const payButton = checkoutElement.querySelector('#pay-button');
  if (!payButton) return;

  function setLoading(state) {
    try {
      if (state) {
        payButton.setAttribute('disabled', 'true');
        payButton.setAttribute('aria-busy', 'true');
        payButton.classList.add('opacity-80');

        if (!payButton.dataset.originalHtml) {
          payButton.dataset.originalHtml = payButton.innerHTML;
        }

        payButton.innerHTML = `<div class="flex items-center justify-center gap-2">${Spinner({
          size: 6,
        })}</div>`;
      } else {
        payButton.removeAttribute('disabled');
        payButton.removeAttribute('aria-busy');
        payButton.classList.remove('opacity-80');

        if (payButton.dataset.originalHtml) {
          payButton.innerHTML = payButton.dataset.originalHtml;
        }
      }
    } catch {}
  }

  payButton.addEventListener('click', async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const termsCheckbox = document.getElementById('terms-checkbox');
      if (!termsCheckbox || termsCheckbox.checked !== true) {
        toast.error('Você deve aceitar os termos e condições para continuar.');
        return;
      }

      const gateway = Checkout?.getSelectedGateway?.();
      const name = checkoutElement.querySelector('input[name="client_name"]')?.value?.trim();
      const email = checkoutElement.querySelector('input[name="client_email"]')?.value?.trim();
      const discord = checkoutElement.querySelector('input[name="client_discord"]')?.value?.trim();
      const clientDocument = checkoutElement
        .querySelector('input[name="client_document"]')
        ?.value?.trim();
      const docInput = checkoutElement.querySelector('input[name="client_document"]');
      const docRequiredByStore = docInput?.getAttribute('data-required') === 'true';
      const docVisible = !!docInput && !docInput.classList.contains('hidden');
      const docRequired = docRequiredByStore || docVisible;
      const clientDocumentDigits = String(clientDocument || '').replace(/\D/g, '');
      if (docRequired && clientDocumentDigits.length !== 11) {
        toast.error('CPF obrigatório: informe um CPF válido com 11 dígitos.');
        return;
      }
      let phone = '';
      const phoneWrapperEl = checkoutElement.querySelector('#phone-field-wrapper');
      if (phoneWrapperEl && !phoneWrapperEl.classList.contains('hidden')) {
        const rawPhone = checkoutElement.querySelector('input[name="client_phone"]')?.value?.trim();
        if (rawPhone) {
          phone = PhoneInput.toE164(rawPhone, PhoneInput.getCountryCode());
        }
      }
      const selectedPaymentButton = checkoutElement.querySelector('[data-payment-method][data-selected="true"]');
      const phoneRequiredByGateway = selectedPaymentButton?.getAttribute('data-require-phone') === 'true';
      if (phoneRequiredByGateway && String(phone || '').replace(/\D/g, '').length < 10) {
        toast.error('Telefone obrigatorio: informe um telefone valido.');
        return;
      }

      const rawCart = Cart.get() || [];
      const st = window.__nerixCheckoutState || {};
      const redeemedCartGoalThresholds =
        typeof st.getCartGoalRedeemedThresholds === 'function' ? st.getCartGoalRedeemedThresholds() : [];

      const parsedCart = rawCart.map((item) => {
        const hasParent = !!item.parent_product_id;
        return {
          package_id: hasParent ? parseInt(item.parent_product_id, 10) : parseInt(item.id, 10),
          variant_id: hasParent ? parseInt(item.id, 10) : null,
          quantity: parseInt(item.quantity || 1, 10),
          fields: item.fields || {},
          order_bump_id: item.order_bump_id ? parseInt(item.order_bump_id, 10) : null,
          cart_goal_reward: item.cart_goal_reward === true,
        };
      });

      let coupon;
      try {
        const saved = JSON.parse(localStorage.getItem('cart-discount') || 'null');
        coupon = saved?.coupon;
      } catch {}

      let clientAddress;
      const addressEl = checkoutElement.querySelector('#address-section');
      if (addressEl && !addressEl.classList.contains('hidden')) {
        const cep = addressEl.querySelector('input[name="address_cep"]')?.value?.trim();
        const street = addressEl.querySelector('input[name="address_street"]')?.value?.trim();
        const number = addressEl.querySelector('input[name="address_number"]')?.value?.trim();
        const complement = addressEl.querySelector('input[name="address_complement"]')?.value?.trim();
        const neighborhood = addressEl.querySelector('input[name="address_neighborhood"]')?.value?.trim();
        const city = addressEl.querySelector('input[name="address_city"]')?.value?.trim();
        const state = addressEl.querySelector('input[name="address_state"]')?.value?.trim();

        if (!cep || !street || !number || !neighborhood || !city || !state) {
          toast.error('Preencha todos os campos de endereço obrigatórios.');
          return;
        }

        clientAddress = { cep, street, number, complement, neighborhood, city, state };
      }

      const payload = {
        gateway,
        payment_provider: window.selectedGatewayData?.provider || null,
        client_email: email,
        client_name: name,
        client_phone: phone,
        fields: collectCheckoutFields(),
        client_discord: discord,
        terms: termsCheckbox.checked,
      };

      if (clientAddress) payload.client_address = clientAddress;
      if (clientDocumentDigits) payload.client_document = clientDocumentDigits;
      if (coupon) payload.coupon = coupon;
      if (parsedCart && parsedCart.length) payload.cart = parsedCart;
      payload.redeemed_cart_goal_thresholds = redeemedCartGoalThresholds;
      const creditToSend = typeof st.getCreditApplied === 'function' ? st.getCreditApplied() : 0;
      if (creditToSend > 0) payload.use_store_credit_amount = creditToSend;

      var affiliateCode = typeof Nerix.getAffiliateRef === 'function' ? Nerix.getAffiliateRef() : null;
      if (affiliateCode) payload.affiliate_code = affiliateCode;

      let checkoutData;
      if (gateway === 'CREDITCARD' && CreditCardHandler.isWalletCardProvider(window.selectedGatewayData)) {
        const result = await CreditCardHandler.submitWalletCard(async (tokenData) => {
          payload.payment_token = tokenData.token;
          payload.installments = CreditCardHandler.getInstallments();
          const response = await Nerix.checkout(payload);
          checkoutData = response.data;
          return checkoutData.provider_transaction || checkoutData;
        });
        if (result && result.status === 'error') throw new Error(result.error || 'Nao foi possivel processar o cartao.');
      } else {
        if (gateway === 'CREDITCARD') {
          const { payment_token } = await CreditCardHandler.generateToken();
          payload.payment_token = payment_token;
          payload.installments = CreditCardHandler.getInstallments();
        }
        const response = await Nerix.checkout(payload);
        checkoutData = response.data;
      }

      const data = checkoutData;

      const { checkout_url, order_id, order_number, status } = data;
      const orderRef = order_number || order_id;

      const cartContents = Cart.getPackages().map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
        quantity: pkg.quantity,
        price: pkg.pricing.price,
      }));

      Nerix.track('initiate_checkout', {
        value: Cart.calculateTotal(),
        currency: store.currency,
        transaction_id: orderRef,
        contents: cartContents,
      });

      Cart.clear();
      try {
        const keyFn =
          window.__nerixCheckoutState && typeof window.__nerixCheckoutState.cartKeySub === 'function'
            ? window.__nerixCheckoutState.cartKeySub
            : null;
        const k = keyFn
          ? keyFn()
          : (window.NERIX && window.NERIX.shopSubdomain) ||
            (window.NERIX && window.NERIX.storeParam) ||
            'default';
        localStorage.removeItem('cart_goal_redeemed_' + k);
      } catch (e4) {}

      // `shopUrl()` adiciona o prefixo `/shop` + `?store=` em dev.
      // URLs retornadas pela API começam com `/` (ex: `/payment/123`) e URLs
      // de gateway externo vêm absolutas (https://...) — só prefixa as
      // relativas que começam com `/`.
      const toShop = (u) => {
        if (!u) return u;
        if (/^https?:\/\//i.test(u)) return u;
        return typeof shopUrl === 'function' ? shopUrl(u) : u;
      };

      if (status === 'APPROVED') {
        location.href = toShop(`/order/${orderRef}`);
      } else if (gateway === 'PIX') {
        location.href = toShop(`/payment/${orderRef}`);
      } else {
        location.href = toShop(checkout_url);
      }
    } catch (err) {
      const msg =
        err?.data?.errors?.[0]?.message ||
        err?.message ||
        'Não foi possível processar o seu pedido.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  });
})();


