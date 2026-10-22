async function submitBecomeAffiliate(event) {
  event.preventDefault();

  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const refCodeInput = document.getElementById('affiliate-ref-code');

  if (!refCodeInput) return;

  const rawRefCode = refCodeInput.value.trim();

  if (!rawRefCode) {
    toast.error('Informe um código para o seu link de afiliado.');
    return;
  }

  const normalizedRefCode = rawRefCode;
  const sanitizedRefCode = normalizedRefCode.replace(/[^A-Za-z0-9_-]/g, '');

  if (sanitizedRefCode !== normalizedRefCode) {
    toast.error('Use apenas letras e números.');
    return;
  }

  if (sanitizedRefCode.length < 3) {
    toast.error('Informe um código com pelo menos 3 caracteres.');
    return;
  }

  submitBtn.disabled = true;

  try {
    await Nerix.becomeAffiliate({ ref_code: sanitizedRefCode });
    toast.success('Solicitação registrada! Atualizando…');
    closeDialog('become-affiliate');
    window.location.reload();
  } catch (error) {
    toast.error(
      error.data?.errors?.[0]?.message ||
        error.data?.error ||
        error.message ||
        'Não foi possível concluir a solicitação.'
    );
  } finally {
    submitBtn.disabled = false;
  }
}
