let currentEmail = '';

function shopAuthErrorMessage(err) {
  if (!err) return 'Erro desconhecido.';
  var d = err.data;
  if (d && typeof d.error === 'string' && d.error) return d.error;
  if (d && Array.isArray(d.errors) && d.errors[0] && d.errors[0].message) return d.errors[0].message;
  if (typeof err.message === 'string' && err.message && err.message !== 'Request failed') return err.message;
  return 'Erro ao processar solicitação.';
}

function customerStorageKey() {
  var sub = '';
  try {
    sub =
      (window.NERIX && window.NERIX.shopSubdomain) ||
      (window.NERIX && window.NERIX.storeParam) ||
      '';
    if (!sub) {
      var host = window.location.hostname || '';
      var isLocal =
        host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
      if (isLocal) {
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
        if (first && !blocked[first]) sub = first;
      }
    }
  } catch (e) {
    sub = '';
  }
  return sub || null;
}

function setupOtpInputs() {
  const otpInputs = document.querySelectorAll('.otp-input');

  otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      const value = e.target.value;

      if (!/^\d*$/.test(value)) {
        e.target.value = '';
        return;
      }

      if (value && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) {
        otpInputs[index - 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

      if (pastedData.length === 6) {
        otpInputs.forEach((input, i) => {
          input.value = pastedData[i] || '';
        });
        otpInputs[5].focus();
      }
    });
  });
}

function showOtpStep(email) {
  currentEmail = email;
  document.getElementById('email-step').classList.add('hidden');
  document.getElementById('otp-step').classList.remove('hidden');
  document.getElementById('user-email').textContent = email;
  document.getElementById('back-to-email').classList.remove('hidden');
  document.querySelector('.submit-button').textContent = 'Verificar código';

  document.querySelector('.otp-input').focus();
}

function showEmailStep() {
  document.getElementById('email-step').classList.remove('hidden');
  document.getElementById('otp-step').classList.add('hidden');
  document.getElementById('back-to-email').classList.add('hidden');
  document.querySelector('.submit-button').textContent = 'Enviar código';
  document.getElementById('email').focus();
}

function getOtpCode() {
  const otpInputs = document.querySelectorAll('.otp-input');
  return Array.from(otpInputs)
    .map((input) => input.value)
    .join('');
}

document.addEventListener('DOMContentLoaded', setupOtpInputs);

document.addEventListener('DOMContentLoaded', function () {
  try {
    var params = new URLSearchParams(window.location.search);
    var oauthError = params.get('error');
    if (!oauthError || typeof toast === 'undefined' || !toast.error) return;
    var messages = {
      google_auth_failed: 'Não foi possível entrar com Google. Tente novamente.',
      google_auth_invalid: 'Login com Google inválido ou expirado. Tente novamente.',
      discord_auth_failed: 'Não foi possível entrar com Discord. Tente novamente.',
      discord_auth_invalid: 'Login com Discord inválido ou expirado. Tente novamente.',
      account_blocked: 'Sua conta está bloqueada.',
      store_not_found: 'Loja não encontrada.',
    };
    toast.error(messages[oauthError] || 'Erro ao autenticar. Tente novamente.');
    params.delete('error');
    var clean =
      window.location.pathname +
      (params.toString() ? '?' + params.toString() : '') +
      window.location.hash;
    window.history.replaceState({}, '', clean);
  } catch (e) {}
});

document.getElementById('magic-link-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const emailStep = document.getElementById('email-step');
  const otpStep = document.getElementById('otp-step');

  if (!emailStep.classList.contains('hidden')) {
    const email = document.getElementById('email').value;

    if (!email) {
      toast.error('Por favor, insira seu email.');
      return;
    }

    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.innerHTML = Spinner({ size: 5 });

    try {
      await Nerix.requestOtp(email);

      toast.success(
        'Código de verificação enviado para seu email! Verifique sua caixa de entrada.'
      );
      showOtpStep(email);
    } catch (error) {
      toast.error(shopAuthErrorMessage(error));
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = originalText;
    }
  } else {
    const otpCode = getOtpCode();

    if (otpCode.length !== 6) {
      toast.error('Por favor, insira o código de 6 dígitos.');
      return;
    }

    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.innerHTML = Spinner({ size: 5 });

    try {
      const result = await Nerix.verifyOtp(currentEmail, otpCode);

      if (result && result.token) {
        const key = customerStorageKey();
        if (key) {
          try {
            localStorage.setItem('customer_token_' + key, result.token);
            if (result.customer) {
              localStorage.setItem('customer_' + key, JSON.stringify(result.customer));
            }
            window.dispatchEvent(new Event('customerUpdated'));
          } catch (storageErr) {
            console.warn('[auth] localStorage', storageErr);
          }
        }
        toast.success('Login realizado com sucesso!');
        window.location.href =
          typeof shopUrl === 'function' ? shopUrl('/account/orders') : '/account/orders';
      } else {
        toast.error((result && result.message) || 'Código inválido. Tente novamente.');
        document.querySelectorAll('.otp-input').forEach((input) => (input.value = ''));
        document.querySelector('.otp-input').focus();
      }
    } catch (error) {
      toast.error(shopAuthErrorMessage(error));
      document.querySelectorAll('.otp-input').forEach((input) => (input.value = ''));
      document.querySelector('.otp-input').focus();
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = originalText;
    }
  }
});

document.getElementById('back-to-email').addEventListener('click', () => {
  showEmailStep();
  document.querySelectorAll('.otp-input').forEach((input) => (input.value = ''));
});
