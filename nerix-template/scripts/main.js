const base_url = (window.NERIX && window.NERIX.baseUrl) || window.location.origin;

function _shopUrl(pathname, extraQuery) {
  if (typeof window.shopUrl === 'function') return window.shopUrl(pathname, extraQuery);
  var url = base_url + pathname;
  if (extraQuery) url += (url.indexOf('?') === -1 ? '?' : '&') + extraQuery;
  return url;
}

function Spinner({ size = 5 }) {
  return `<i class="ph ph-spinner size-${size} text-white/80 animate-spin" id="spinner" aria-hidden="true"></i>`;
}

function useTyping(inputElement, { onStart, onStop, delay = 600 }) {
  let typingTimer;
  let isTyping = false;

  const handleInput = () => {
    const value = inputElement.value;

    if (!isTyping) {
      isTyping = true;
      onStart?.(value);
    }

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      isTyping = false;
      onStop?.(value);
    }, delay);
  };

  inputElement.addEventListener('input', handleInput);

  return () => {
    inputElement.removeEventListener('input', handleInput);
    clearTimeout(typingTimer);
  };
}

function callNotification(content, status) {
  const html = `
<div class="flex items-center gap-2">
  ${
    status === 'error'
      ? '<i class="ph ph-x-circle text-red-500 me-0.5 min-size-4 inline" aria-hidden="true"></i>'
      : '<i class="ph ph-check-circle text-green-500 me-0.5 min-size-4 inline" aria-hidden="true"></i>'
  }
  <p class="text-sm">${content}</p>
</div>
`;

  Toastify({
    style: {
      background: `rgb(var(--background))`,
      border: 'solid 1px rgb(var(--border))',
      borderRadius: '8px',
      boxShadow: 'none',
      maxWidth: '520px',
      minWidth: '310px',
      width: 'fit-content',
      display: 'flex',
      gap: '16px',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 12px',
    },
    escapeMarkup: false,
    text: html,
    duration: 3000,
    close: true,
    gravity: 'bottom',
    position: 'right',
  }).showToast();
}

const toast = {
  success: function (content) {
    callNotification(content, 'success');
  },
  error: function (content) {
    callNotification(content, 'error');
  },
};

function getScriptData(id, fallback = []) {
  try {
    const element = document.getElementById(id);
    return JSON.parse(element?.textContent || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function toggleMobileSearch() {
  const container = document.getElementById('mobile-search-container');
  if (!container) return;
  container.classList.toggle('hidden');

  if (!container.classList.contains('hidden')) {
    const input = document.getElementById('search-bar-mobile');
    if (input) input.focus();
  } else {
    const result = document.getElementById('search-result-mobile');
    if (result) result.classList.add('hidden');
  }
}

function handleSearch(inputSelector, resultSelector) {
  const inputElement = document.querySelector(inputSelector);
  const resultElement = document.querySelector(resultSelector);

  if (!inputElement || !resultElement) return;

  inputElement.addEventListener('click', () => {
    if (
      inputElement.value.trim() &&
      resultElement.children.length &&
      !resultElement.innerHTML.includes('flex items-center justify-center')
    ) {
      resultElement.classList.remove('hidden');
    }
  });

  inputElement.addEventListener('focus', () => {
    if (
      inputElement.value.trim() &&
      resultElement.children.length &&
      !resultElement.innerHTML.includes('flex items-center justify-center')
    ) {
      resultElement.classList.remove('hidden');
    }
  });

  useTyping(inputElement, {
    onStart: () => {
      resultElement.innerHTML = `<div class="p-3 flex items-center justify-center">${Spinner({
        size: 10,
      })}</div>`;
      resultElement.classList.remove('hidden');
    },
    onStop: async (content) => {
      if (!content) {
        resultElement.classList.add('hidden');
        return;
      }

      try {
        const response = await fetch(
          _shopUrl('/search', `q=${encodeURIComponent(content)}&page=1&limit=10&bar=true&include_variations=true&load_parent=true`)
        );
        const data = await response.text();
        resultElement.innerHTML = Nerix.sanitizeHTML(data);
        resultElement.classList.remove('hidden');

        if (typeof publishEvent === 'function') {
          publishEvent('search', { search: content });
        }
      } catch (error) {
        resultElement.innerHTML = '<div class="p-2 text-red-500">Erro ao buscar</div>';
        resultElement.classList.remove('hidden');
      }
    },
  });

  document.addEventListener('click', (e) => {
    if (!inputElement.contains(e.target) && !resultElement.contains(e.target)) {
      resultElement.classList.add('hidden');
    }
  });
}

function initRevealObserver() {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
    }
  );

  document.querySelectorAll('.reveal-fade-up').forEach((el) => {
    revealObserver.observe(el);
  });
}

async function loadCategory(categoryId, element, currentPackage = null) {
  const extra = currentPackage
    ? `category_id=${categoryId}&current_package=${currentPackage}&limit=10`
    : `category_id=${categoryId}&package_list=true&limit=1000`;

  const url = _shopUrl('/search', extra);
  const content = await fetch(url).then((res) => res.text());

  element.innerHTML = Nerix.sanitizeHTML(content);

  const similarSlider = document.getElementById('similar-packages-slider');
  if (currentPackage && similarSlider) {
    const slider = new KeenSlider(similarSlider, {
      slides: {
        perView: 5,
        spacing: 8,
      },
      breakpoints: {
        '(max-width: 1024px)': {
          slides: {
            perView: 2,
            spacing: 4,
          },
        },
      },
    });

    document.getElementById('similar-slider-prev')?.addEventListener('click', () => slider.prev());
    document.getElementById('similar-slider-next')?.addEventListener('click', () => slider.next());
  }

  initRevealObserver();
}

(() => {
  initRevealObserver();

  document.querySelectorAll('.package-list').forEach((element) => {
    new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadCategory(
              entry.target.dataset.categoryId,
              element,
              entry.target.dataset.currentPackage
            );
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: '0px 0px 0px 0px',
        threshold: 0.1,
      }
    ).observe(element);
  });
})();

(() => {
  handleSearch('#search-bar', '#search-result');
  handleSearch('#search-bar-mobile', '#search-result-mobile');
})();

(() => {
  const licenseContainers = document.querySelectorAll('.license-key[data-license-raw]');

  licenseContainers.forEach((container) => {
    const raw = container.getAttribute('data-license-raw') || '';
    const formatted = container.getAttribute('data-license-formatted') || null;

    const valueToProcess = formatted || raw;

    let parsed;

    try {
      parsed = JSON.parse(valueToProcess);
    } catch {
      const row = container.parentElement;
      if (!row) return;

      if (row.querySelector('[data-action="copy"]')) return;

      row.classList.add('flex', 'items-center', 'justify-between', 'gap-1');

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'text-xs group';
      copyBtn.setAttribute('data-action', 'copy');
      copyBtn.setAttribute('data-content', raw);
      copyBtn.setAttribute('data-is-copied', 'false');
      copyBtn.innerHTML = `
        <i class="ph ph-check size-3.5 hidden group-data-[is-copied=true]:block" aria-hidden="true"></i>
        <i class="ph ph-copy size-3.5 hidden group-data-[is-copied=false]:block" aria-hidden="true"></i>
      `;

      row.appendChild(copyBtn);

      return;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const row = container.parentElement;
      if (!row) return;

      if (row.querySelector('[data-action="copy"]')) return;

      row.classList.add('flex', 'items-center', 'justify-between', 'gap-1');

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'text-xs group';
      copyBtn.setAttribute('data-action', 'copy');
      copyBtn.setAttribute('data-content', raw);
      copyBtn.setAttribute('data-is-copied', 'false');
      copyBtn.innerHTML = `
        <i class="ph ph-check size-3.5 hidden group-data-[is-copied=true]:block" aria-hidden="true"></i>
        <i class="ph ph-copy size-3.5 hidden group-data-[is-copied=false]:block" aria-hidden="true"></i>
      `;

      row.appendChild(copyBtn);

      return;
    }

    container.innerHTML = '';
    container.classList.add('space-y-2');

    Object.entries(parsed).forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'space-y-1';

      const labelEl = document.createElement('span');
      labelEl.className = 'text-sm font-medium text-muted-foreground';
      labelEl.textContent = String(label);

      const field = document.createElement('div');
      field.className =
        'w-full min-h-9 px-3 py-2 rounded-md border bg-background flex items-center justify-between gap-2';

      const valueEl = document.createElement('span');
      valueEl.className = 'break-all line-clamp-3 flex-1';
      valueEl.textContent = String(value ?? '');

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'group flex-shrink-0';
      copyBtn.setAttribute('data-action', 'copy');
      copyBtn.setAttribute('data-content', String(value ?? ''));
      copyBtn.setAttribute('data-is-copied', 'false');
      copyBtn.innerHTML = `
        <i class="ph ph-check size-3.5 hidden group-data-[is-copied=true]:block" aria-hidden="true"></i>
        <i class="ph ph-copy size-3.5 hidden group-data-[is-copied=false]:block" aria-hidden="true"></i>
      `;

      field.appendChild(valueEl);
      field.appendChild(copyBtn);

      row.appendChild(labelEl);
      row.appendChild(field);

      container.appendChild(row);
    });
  });
})();

document.querySelectorAll('[data-action=copy]').forEach((element) => {
  const content = element.getAttribute('data-content');

  element.addEventListener('click', () => {
    window.navigator.clipboard.writeText(content);
    element.disabled = true;
    element.setAttribute('data-is-copied', 'true');

    setTimeout(() => {
      element.disabled = false;
      element.setAttribute('data-is-copied', 'false');
    }, 1500);

    toast.success('Conteúdo copiado com sucesso.');
  });
});

document.querySelectorAll('[data-action="copy-all-keys"]').forEach((button) => {
  button.addEventListener('click', () => {
    const licenseGroup = button.closest('[data-license-group]');
    if (!licenseGroup) return;

    const licenseKeys = Array.from(licenseGroup.querySelectorAll('.license-key[data-license-raw]'))
      .map((el) => el.getAttribute('data-license-raw') || '')
      .filter((key) => key);

    if (licenseKeys.length === 0) {
      toast.error('Nenhuma chave encontrada para copiar.');
      return;
    }

    const keysText = licenseKeys.join('\n');
    navigator.clipboard
      .writeText(keysText)
      .then(() => {
        button.disabled = true;
        button.setAttribute('data-is-copied', 'true');

        setTimeout(() => {
          button.disabled = false;
          button.setAttribute('data-is-copied', 'false');
        }, 2000);

        toast.success(`${licenseKeys.length} chave(s) copiada(s) com sucesso.`);
      })
      .catch((err) => {
        console.error(err);
        toast.error('Erro ao copiar as chaves.');
      });
  });
});

document.querySelectorAll('[data-action="download-keys"]').forEach((button) => {
  button.addEventListener('click', () => {
    const licenseGroup = button.closest('[data-license-group]');
    if (!licenseGroup) return;

    const licenseKeys = Array.from(licenseGroup.querySelectorAll('.license-key[data-license-raw]'))
      .map((el) => el.getAttribute('data-license-raw') || '')
      .filter((key) => key);

    if (licenseKeys.length === 0) {
      toast.error('Nenhuma chave encontrada para baixar.');
      return;
    }

    const packageName = button.getAttribute('data-package-name') || 'Produto';

    const keysText = licenseKeys.join('\n');
    const blob = new Blob([keysText], { type: 'text/plain;charset=utf-8' });

    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `${licenseKeys.length}x - ${packageName}.txt`;

    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    URL.revokeObjectURL(url);

    button.disabled = true;
    button.setAttribute('data-is-downloaded', 'true');

    setTimeout(() => {
      button.disabled = false;
      button.setAttribute('data-is-downloaded', 'false');
    }, 2000);

    toast.success(`${licenseKeys.length} chave(s) baixada(s) com sucesso.`);
  });
});

/* Sidebar categories handlers */
function toggleMobileCategories() {
  const dropdown = document.getElementById('mobile-categories-dropdown');
  const button = document.getElementById('mobile-category-toggle');
  if (!dropdown || !button) return;
  const isOpen = dropdown.getAttribute('data-state') === 'open';
  const nextState = isOpen ? 'closed' : 'open';
  dropdown.setAttribute('data-state', nextState);
  button.setAttribute('data-state', nextState);
}

function toggleMobileCategoryGroup(categoryId) {
  const subcategories = document.querySelector(`[data-category="${categoryId}"]`);
  if (!subcategories) return;
  const button = subcategories.previousElementSibling;
  const isOpen = subcategories.getAttribute('data-state') === 'open';
  const nextState = isOpen ? 'closed' : 'open';
  subcategories.setAttribute('data-state', nextState);
  if (button) button.setAttribute('data-state', nextState);
}

function closeMobileCategories() {
  const dropdown = document.getElementById('mobile-categories-dropdown');
  const button = document.getElementById('mobile-category-toggle');
  if (dropdown) dropdown.setAttribute('data-state', 'closed');
  if (button) button.setAttribute('data-state', 'closed');
  document
    .querySelectorAll('.mobile-category-group > button')
    .forEach((el) => el.setAttribute('data-state', 'closed'));
  document.querySelectorAll('.mobile-subcategories').forEach((sub) => {
    sub.setAttribute('data-state', 'closed');
  });
}

function toggleCategoryDropdown(catId) {
  const targetDropdown = document.querySelector(`[data-id="${catId}"]`);
  if (!targetDropdown) return;
  const targetButton = targetDropdown.previousElementSibling;
  const isOpen = targetDropdown.getAttribute('data-state') === 'open';
  const nextState = isOpen ? 'closed' : 'open';
  document.querySelectorAll('.cat-dropdown').forEach((el) => {
    if (el.dataset.id !== String(catId)) {
      el.setAttribute('data-state', 'closed');
      const button = el.previousElementSibling;
      if (button) button.setAttribute('data-state', 'closed');
    }
  });
  targetDropdown.setAttribute('data-state', nextState);
  if (targetButton) targetButton.setAttribute('data-state', nextState);
}

document.addEventListener('click', function (e) {
  const mobileToggle = document.getElementById('mobile-category-toggle');
  const mobileDropdown = document.getElementById('mobile-categories-dropdown');
  if (!mobileToggle || !mobileDropdown) return;
  if (!mobileToggle.contains(e.target) && !mobileDropdown.contains(e.target)) {
    window.closeMobileCategories();
  }
});

document.addEventListener('click', function (e) {
  if (!e.target.closest('.sidebar-categories-menu')) {
    document.querySelectorAll('.cat-dropdown').forEach((el) => {
      el.setAttribute('data-state', 'closed');
      const button = el.previousElementSibling;
      if (button) button.setAttribute('data-state', 'closed');
    });
  }
});
/* Sidebar categories handlers */


(() => {
  if (window.__numberOnlyInit) return;
  window.__numberOnlyInit = true;

  document.addEventListener("keypress", function (event) {
    var target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains("number-only")) return;
    if (event.key && event.key.length === 1 && !/\d/.test(event.key)) {
      event.preventDefault();
    }
  });

  document.addEventListener("input", function (event) {
    var target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains("number-only")) return;
    var original = target.value;
    var clean = original.replace(/\D+/g, "");
    if (clean !== original) {
      var pos = target.selectionStart;
      target.value = clean;
      try {
        var newPos = Math.max(0, (pos || 0) - (original.length - clean.length));
        target.setSelectionRange(newPos, newPos);
      } catch (e) {}
    }
  });
})();
