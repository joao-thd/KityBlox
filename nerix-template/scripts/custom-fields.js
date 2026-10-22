// Shared Custom Fields interactions (ROBLOX, error clear, icons)
(function defineCustomFieldsShared() {
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

      if (typeof window.useTyping === 'function') {
        window.useTyping(input, {
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
              const res = await window.Nerix.getRoblox(username);
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

  window.CustomFields = Object.assign(window.CustomFields || {}, {
    afterRender,
  });
})();
