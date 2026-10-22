(function () {
  'use strict';

  var guestEl = document.getElementById('chat-order-guest');
  var errorEl = document.getElementById('chat-order-error');
  var layoutEl = document.getElementById('chat-order-layout');
  var messagesEl = document.getElementById('chat-order-messages');
  var formEl = document.getElementById('chat-order-form');
  var inputEl = document.getElementById('chat-order-input');
  var submitEl = document.getElementById('chat-order-submit');
  var refEl = document.getElementById('chat-order-ref');
  var backLinkEl = document.getElementById('chat-order-back-link');
  var subtitleEl = document.getElementById('chat-order-subtitle');
  var statusBadgeEl = document.getElementById('chat-order-status-badge');
  var resolvedEl = document.getElementById('chat-order-resolved');

  if (!guestEl || !errorEl || !layoutEl || !messagesEl || !formEl || !inputEl || !submitEl) return;

  var state = {
    conversationId: null,
    lastMessageId: null,
    orderRef: null,
    status: 'active',
    messages: [],
    customerAvatar: null,
    storeLogo: null,
    customerName: 'Cliente',
    storeName: 'Loja',
  };
  var pollTimer = null;
  var socket = null;
  var socketConnected = false;

  function detectSubdomain() {
    var sub =
      (window.NERIX && window.NERIX.shopSubdomain) ||
      (window.NERIX && window.NERIX.storeParam) ||
      '';
    if (sub) return sub;
    var first = (window.location.pathname || '/').split('/').filter(Boolean)[0] || '';
    return first && first !== 'chat' ? first : '';
  }

  function token() {
    var sub = detectSubdomain();
    if (!sub) return '';
    try {
      return localStorage.getItem('customer_token_' + sub) || '';
    } catch (e) {
      return '';
    }
  }

  function orderRefFromPath() {
    var m = (window.location.pathname || '').match(/\/chat\/order\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function apiHeaders() {
    return {
      Authorization: 'Bearer ' + token(),
      'X-Store-Subdomain': detectSubdomain(),
    };
  }

  function setView(name, message) {
    guestEl.classList.toggle('hidden', name !== 'guest');
    errorEl.classList.toggle('hidden', name !== 'error');
    layoutEl.classList.toggle('hidden', name !== 'chat');
    if (name === 'error') errorEl.textContent = message || 'Erro ao carregar chat.';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function timeLabel(iso) {
    try {
      return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '--:--';
    }
  }

  function avatarHtml(url, name, alignRight) {
    var initial = String(name || '?')[0].toUpperCase();
    if (url) {
      return (
        '<div class="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-background/60 border border-white/10">' +
        '<img src="' +
        escapeHtml(url) +
        '" alt="' +
        escapeHtml(name) +
        '" class="w-full h-full object-cover" loading="lazy" decoding="async" referrerpolicy="no-referrer" />' +
        '</div>'
      );
    }
    return (
      '<div class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold ' +
      (alignRight ? 'bg-primary/20 text-primary' : 'bg-background border border-white/10 text-muted-foreground') +
      '">' +
      escapeHtml(initial) +
      '</div>'
    );
  }

  function renderMessages(messages) {
    var list = Array.isArray(messages) ? messages : state.messages;
    state.messages = list;

    if (!list.length) {
      messagesEl.innerHTML = '<p class="text-sm text-muted-foreground text-center py-10">Sem mensagens ainda.</p>';
      return;
    }

    var imgFallback =
      "if(!this.dataset._fb){this.dataset._fb='1';this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22240%22 height=%22160%22%3E%3Crect fill=%22%2318181b%22 width=%22240%22 height=%22160%22/%3E%3C/svg%3E';}";

    var html = list
      .map(function (msg) {
        var isCustomer = msg.sender_type === 'customer';
        var avatarUrl =
          msg.sender_avatar_url ||
          (isCustomer ? state.customerAvatar : state.storeLogo) ||
          null;
        var displayName = isCustomer
          ? msg.sender_name || state.customerName
          : msg.sender_name || state.storeName;
        var imageHtml =
          msg.message_type === 'image' && msg.file_url
            ? '<a href="' +
              escapeHtml(msg.file_url) +
              '" target="_blank" rel="noopener noreferrer" class="block mb-2">' +
              '<img src="' +
              escapeHtml(msg.file_url) +
              '" alt="Anexo" class="max-w-full max-h-48 rounded-md object-cover" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="' +
              imgFallback +
              '" />' +
              '</a>'
            : msg.message_type === 'file' && msg.file_url
              ? '<a href="' +
                escapeHtml(msg.file_url) +
                '" target="_blank" rel="noopener noreferrer" class="block mb-2 text-sm underline">Baixar arquivo</a>'
              : '';
        return (
          '<div class="flex items-end gap-2 ' +
          (isCustomer ? 'justify-end' : 'justify-start') +
          '">' +
          (!isCustomer ? avatarHtml(avatarUrl, displayName, false) : '') +
          '<div class="max-w-[78%] rounded-lg px-3 py-2 ' +
          (isCustomer ? 'bg-primary text-primary-foreground' : 'bg-background border border-white/10 text-foreground') +
          '">' +
          imageHtml +
          '<p class="text-sm break-words">' +
          escapeHtml(msg.message || '') +
          '</p>' +
          '<p class="text-[10px] mt-1 ' +
          (isCustomer ? 'text-primary-foreground/75' : 'text-muted-foreground') +
          '">' +
          timeLabel(msg.created_at) +
          '</p>' +
          '</div>' +
          (isCustomer ? avatarHtml(avatarUrl, displayName, true) : '') +
          '</div>'
        );
      })
      .join('');

    messagesEl.innerHTML = html;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function mergeIncomingMessage(msg) {
    if (!msg || !msg.id) return;
    var exists = state.messages.some(function (m) {
      return Number(m.id) === Number(msg.id);
    });
    if (exists) return;
    state.messages = state.messages.concat([msg]);
    state.lastMessageId = Number(msg.id) || state.lastMessageId;
    renderMessages(state.messages);
  }

  async function loadMessages() {
    if (!state.conversationId) return;
    var res = await fetch(
      window.location.origin +
        '/api/public/customer/conversations/' +
        encodeURIComponent(String(state.conversationId)) +
        '/messages',
      { headers: apiHeaders(), credentials: 'include' }
    );
    if (!res.ok) throw new Error('Não foi possível carregar mensagens.');
    var messages = await res.json();
    if (Array.isArray(messages) && messages.length > 0) {
      var last = messages[messages.length - 1];
      state.lastMessageId = Number(last.id) || state.lastMessageId;
    }
    renderMessages(messages || []);
  }

  function applyConversationStatus(status) {
    state.status = status === 'closed' ? 'closed' : 'active';
    var isClosed = state.status === 'closed';

    formEl.classList.toggle('hidden', isClosed);
    if (resolvedEl) resolvedEl.classList.toggle('hidden', !isClosed);
    if (statusBadgeEl) statusBadgeEl.classList.toggle('hidden', !isClosed);

    if (subtitleEl) {
      subtitleEl.textContent = isClosed
        ? 'Este atendimento foi encerrado pela loja.'
        : 'Converse com a loja sobre este pedido.';
    }

    inputEl.disabled = isClosed;
    submitEl.disabled = isClosed;
    if (isClosed) inputEl.value = '';
  }

  function applyConversationMeta(conv) {
    if (!conv) return;
    state.conversationId = conv.id ? Number(conv.id) : state.conversationId;
    applyConversationStatus(conv.status || 'active');
    state.customerAvatar =
      conv.customer_avatar_url ||
      (conv.customer && (conv.customer.avatar_url || conv.customer.profile_picture_url)) ||
      state.customerAvatar;
    state.storeLogo =
      conv.store_logo_url ||
      (conv.store && conv.store.logo_url) ||
      (typeof store !== 'undefined' && store.logo_url) ||
      state.storeLogo;
    state.customerName =
      (conv.customer && conv.customer.name) || conv.customer_name || state.customerName;
    state.storeName = (conv.store && conv.store.name) || state.storeName;
  }

  async function loadConversation() {
    var ref = state.orderRef;
    var res = await fetch(
      window.location.origin + '/api/public/customer/conversations/order/' + encodeURIComponent(ref),
      { headers: apiHeaders(), credentials: 'include' }
    );
    if (res.status === 401) {
      setView('guest');
      return false;
    }
    if (!res.ok) throw new Error('Conversa não encontrada para este pedido.');
    var conv = await res.json();
    applyConversationMeta(conv);
    return !!state.conversationId;
  }

  async function refreshConversationStatus() {
    if (!state.orderRef || !token()) return;
    try {
      var res = await fetch(
        window.location.origin + '/api/public/customer/conversations/order/' + encodeURIComponent(state.orderRef),
        { headers: apiHeaders(), credentials: 'include' }
      );
      if (!res.ok) return;
      var conv = await res.json();
      applyConversationMeta(conv);
    } catch (e) {
      /* ignore */
    }
  }

  function connectSocket() {
    if (!window.io || !token() || !state.conversationId) return;

    socket = window.io(window.location.origin, {
      auth: { token: token() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
    });

    socket.on('connect', function () {
      socketConnected = true;
      socket.emit('join_conversation', { conversationId: state.conversationId });
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    });

    socket.on('disconnect', function () {
      socketConnected = false;
      startPolling();
    });

    socket.on('new_message', function (data) {
      if (data && data.message) mergeIncomingMessage(data.message);
    });

    socket.on('new_conversation_message', function (data) {
      if (data && data.message && Number(data.conversationId) === Number(state.conversationId)) {
        mergeIncomingMessage(data.message);
      }
    });

    socket.on('messages_history', function (data) {
      if (data && Array.isArray(data.messages) && data.messages.length) {
        renderMessages(data.messages);
      }
    });

    socket.on('conversation_status_changed', function (data) {
      if (data && Number(data.conversationId) === Number(state.conversationId)) {
        applyConversationStatus(data.status);
      }
    });
  }

  function startPolling() {
    if (pollTimer || socketConnected) return;
    pollTimer = setInterval(function () {
      loadMessages().catch(function () {});
      refreshConversationStatus();
    }, 2000);
  }

  async function sendMessage() {
    if (state.status === 'closed') return;
    var text = String(inputEl.value || '').trim();
    if (!text || !state.conversationId) return;
    submitEl.disabled = true;
    try {
      var form = new FormData();
      form.append('message', text);
      var res = await fetch(
        window.location.origin +
          '/api/public/customer/conversations/' +
          encodeURIComponent(String(state.conversationId)) +
          '/messages',
        {
          method: 'POST',
          headers: apiHeaders(),
          body: form,
          credentials: 'include',
        }
      );
      if (res.status === 400) {
        applyConversationStatus('closed');
        return;
      }
      if (!res.ok) throw new Error('Falha ao enviar mensagem.');
      var created = await res.json();
      inputEl.value = '';
      if (created && created.id) {
        mergeIncomingMessage(created);
      } else {
        await loadMessages();
      }
    } finally {
      submitEl.disabled = false;
    }
  }

  async function bootstrap() {
    state.orderRef = orderRefFromPath();
    if (refEl) refEl.textContent = state.orderRef || '—';
    if (backLinkEl && state.orderRef) {
      backLinkEl.setAttribute(
        'href',
        typeof shopUrl === 'function' ? shopUrl('/order/' + state.orderRef) : '/order/' + state.orderRef
      );
    }
    if (!token() || !detectSubdomain()) {
      setView('guest');
      return;
    }
    try {
      var hasConversation = await loadConversation();
      if (!hasConversation) return;
      setView('chat');
      await loadMessages();
      connectSocket();
      startPolling();
    } catch (e) {
      setView('error', (e && e.message) || 'Erro ao abrir chat.');
    }
  }

  formEl.addEventListener('submit', function (ev) {
    ev.preventDefault();
    sendMessage().catch(function () {});
  });

  window.addEventListener('beforeunload', function () {
    if (pollTimer) clearInterval(pollTimer);
    if (socket) socket.disconnect();
  });

  bootstrap();
})();
