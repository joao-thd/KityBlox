function initChat() {
  const chatContainer = document.getElementById('chat-delivery-container');
  if (!chatContainer) return;

  const CHAT_TOKEN = chatContainer.dataset.token;
  const CHANNEL_ID = chatContainer.dataset.channelId;

  if (!CHAT_TOKEN || !CHANNEL_ID) return;

  const $ = (id) => document.getElementById(id);
  const messagesContainer = $('chat-messages');
  const dialogMessagesContainer = $('chat-dialog-messages');
  const chatForm = $('chat-form');
  const dialogForm = $('chat-dialog-form');
  const chatInput = $('chat-input');
  const dialogInput = $('chat-dialog-input');
  const fileInput = $('chat-file-input');
  const dialogFileInput = $('chat-dialog-file-input');
  const previewsContainer = $('chat-image-previews');
  const dialogPreviewsContainer = $('chat-dialog-image-previews');
  const submitBtn = $('chat-submit-btn');
  const dialogSubmitBtn = $('chat-dialog-submit-btn');
  const sendIcon = $('chat-send-icon');
  const dialogSendIcon = $('chat-dialog-send-icon');
  const loadingIcon = $('chat-loading-icon');
  const dialogLoadingIcon = $('chat-dialog-loading-icon');
  const dropOverlay = $('chat-drop-overlay');
  const lightbox = $('chat-lightbox');
  const lightboxImg = $('chat-lightbox-img');
  const chatDialog = $('dialog-chat-expanded');
  const chatLoader = $('chat-loader');
  const newMessageIndicator = $('chat-new-message-indicator');
  const goToBottomBtn = $('chat-go-to-bottom-btn');

  let hasNewMessages = false;
  let previousMessagesLength = 0;
  let hasScrolledInitially = false;

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateKey(timestamp) {
    return new Date(timestamp).toISOString().split('T')[0];
  }

  function getDateLabel(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateKey = formatDateKey(timestamp);
    const todayKey = formatDateKey(today);
    const yesterdayKey = formatDateKey(yesterday);

    if (dateKey === todayKey) return 'Hoje';
    if (dateKey === yesterdayKey) return 'Ontem';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function isNearBottom(container) {
    if (!container) return false;
    const threshold = 100;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    return scrollHeight - scrollTop - clientHeight < threshold;
  }

  function scrollToBottom(container) {
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function updateNewMessageIndicator() {
    if (hasNewMessages) {
      newMessageIndicator.classList.remove('hidden');
    } else {
      newMessageIndicator.classList.add('hidden');
    }
  }

  function handleGoToBottom() {
    scrollToBottom(messagesContainer);
    hasNewMessages = false;
    updateNewMessageIndicator();
  }

  function isDialogOpen() {
    return chatDialog.getAttribute('data-state') === 'open';
  }

  function syncDialogMessages() {
    dialogMessagesContainer.innerHTML = messagesContainer.innerHTML;
    dialogMessagesContainer.scrollTop = dialogMessagesContainer.scrollHeight;
  }

  const dialogObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'data-state' && isDialogOpen()) {
        syncDialogMessages();
        dialogInput.focus();
      }
    }
  });
  dialogObserver.observe(chatDialog, { attributes: true });

  function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.classList.remove('hidden');
    lightbox.classList.add('flex');
    setTimeout(() => lightbox.classList.add('opacity-100'), 10);
  }

  function closeLightbox() {
    lightbox.classList.remove('opacity-100');
    setTimeout(() => {
      lightbox.classList.add('hidden');
      lightbox.classList.remove('flex');
    }, 300);
  }

  $('chat-lightbox-close').onclick = closeLightbox;
  lightbox.onclick = (e) => e.target === lightbox && closeLightbox();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) closeLightbox();
  });
  window.chatOpenLightbox = openLightbox;

  function renderMessages() {
    const messages = chat.getMessages();

    if (!messages.length) {
      const emptyHtml =
        '<div class="flex justify-center py-8"><p class="text-sm text-muted-foreground">Nenhuma mensagem ainda</p></div>';
      messagesContainer.innerHTML = emptyHtml;
      if (isDialogOpen()) dialogMessagesContainer.innerHTML = emptyHtml;
      return;
    }

    let lastDateKey = null;
    let html = '';

    for (const msg of messages) {
      const dateKey = formatDateKey(msg.timestamp);

      if (dateKey !== lastDateKey) {
        html += `<div class="flex justify-center py-2"><div class="rounded-md bg-muted px-3 py-1"><p class="text-xs font-medium text-muted-foreground">${getDateLabel(
          msg.timestamp
        )}</p></div></div>`;
        lastDateKey = dateKey;
      }

      const isBuyer = msg.user_type === 'buyer';
      const attachments = msg.attachments || [];
      const hasMsg = msg.message?.trim();

      const container = isBuyer
        ? 'bg-foreground text-background'
        : 'bg-muted border border-border text-foreground';
      const time = isBuyer ? 'text-background/70' : 'text-muted-foreground';

      const attachHtml = attachments.length
        ? `<div class="flex flex-wrap gap-1 p-1">${attachments
            .map(
              (url, i) =>
                `<div class="cursor-pointer" onclick="window.chatOpenLightbox('${ChatManager.escapeHtml(
                  url
                )}')"><img src="${ChatManager.escapeHtml(url)}" alt="Anexo ${
                  i + 1
                }" class="max-h-40 w-full rounded-md object-cover hover:opacity-80 transition-opacity" loading="lazy"/></div>`
            )
            .join('')}</div>`
        : '';
      const msgHtml = hasMsg
        ? `<p class="break-words py-2 pe-2 ps-2 text-[13px] ${
            attachments.length ? 'pt-0' : ''
          }">${ChatManager.parseChatMarkdown(
            msg.message
          )}<span class="inline-block select-none" style="width:2.5rem">&nbsp;</span></p>`
        : '';

      html += `<div class="flex ${
        isBuyer ? 'justify-end' : 'justify-start'
      }"><div class="relative max-w-[85%] sm:max-w-[70%] rounded-lg ${container} ${
        attachments.length ? 'flex flex-col' : ''
      }">${attachHtml}${msgHtml}${
        !hasMsg && attachments.length ? '<div class="h-5"></div>' : ''
      }<div class="absolute bottom-1 right-1.5 z-10 text-[10px] ${time}">${formatTime(
        msg.timestamp
      )}</div></div></div>`;
    }

    messagesContainer.innerHTML = html;

    const newMessageAdded = messages.length > previousMessagesLength;
    const wasScrolledInitially = hasScrolledInitially;

    if (newMessageAdded && wasScrolledInitially) {
      if (isNearBottom(messagesContainer)) {
        setTimeout(() => {
          scrollToBottom(messagesContainer);
        }, 0);
        hasNewMessages = false;
      } else {
        hasNewMessages = true;
      }
    } else {
      setTimeout(() => {
        scrollToBottom(messagesContainer);
      }, 0);
    }

    previousMessagesLength = messages.length;

    if (isDialogOpen()) {
      dialogMessagesContainer.innerHTML = html;
      setTimeout(() => {
        scrollToBottom(dialogMessagesContainer);
      }, 0);
    }

    updateNewMessageIndicator();
  }

  function renderPreviews() {
    const previews = chat.getPreviews();
    const html = previews.length
      ? previews
          .map(
            (p, i) =>
              `<div class="relative group"><img src="${p}" class="h-20 w-20 rounded-lg object-cover border border-border"/><button type="button" onclick="window._chatRemoveImage(${i})" class="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"><i class="ph ph-x size-3 text-white" aria-hidden="true"></i></button></div>`
          )
          .join('')
      : '';

    previewsContainer.innerHTML = html;
    dialogPreviewsContainer.innerHTML = html;
    previewsContainer.classList.toggle('hidden', !previews.length);
    dialogPreviewsContainer.classList.toggle('hidden', !previews.length);

  }

  window._chatRemoveImage = (i) => {
    chat.removeFile(i);
    renderPreviews();
  };

  function handleFiles(files) {
    const { added, invalid } = chat.addFiles(files);

    invalid.forEach(({ reason }) => {
      const defaults = ChatManager.defaults;
      if (reason === 'type') toast.error('Apenas imagens são permitidas');
      else if (reason === 'size') toast.error('Imagem muito grande (máx 10MB)');
      else if (reason === 'limit') toast.error(`Máximo ${defaults.maxAttachments} imagens`);
    });

    if (added.length) {
      setTimeout(renderPreviews, 50);
    }
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    dialogSubmitBtn.disabled = loading;
    sendIcon.classList.toggle('hidden', loading);
    dialogSendIcon.classList.toggle('hidden', loading);
    loadingIcon.classList.toggle('hidden', !loading);
    dialogLoadingIcon.classList.toggle('hidden', !loading);
  }

  const chat = window.useChat({
    channelId: CHANNEL_ID,
    token: CHAT_TOKEN,
    onMessage: (msg) => {
      if (msg.user_type !== 'buyer') {
        playNotificationSound();
      }
      renderMessages();
    },
    onMessagesLoaded: () => {
      renderMessages();
      chatLoader.classList.add('hidden');
      hasScrolledInitially = true;
      setTimeout(() => {
        scrollToBottom(messagesContainer);
        if (isDialogOpen()) {
          scrollToBottom(dialogMessagesContainer);
        }
      }, 100);
    },
    onError: (err) => {
      if (err?.type === 'not_connected') toast.error('Chat não conectado');
      else if (err?.type === 'send_error') toast.error('Erro ao enviar mensagem');
      else if (err?.type === 'load_error') {
        messagesContainer.innerHTML =
          '<div class="flex justify-center py-8"><p class="text-sm text-red-600 dark:text-red-400">Erro ao carregar mensagens</p></div>';
      }
    },
  });

  async function sendMessage(fromDialog = false) {
    const input = fromDialog ? dialogInput : chatInput;
    const message = input.value.trim();
    if (!message && !chat.getFiles().length) return;

    try {
      setLoading(true);
      await chat.sendMessage(message);
      input.value = '';
      renderPreviews();
      hasNewMessages = false;
      setTimeout(() => {
        scrollToBottom(messagesContainer);
        updateNewMessageIndicator();
      }, 100);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }

  chatForm.onsubmit = (e) => {
    e.preventDefault();
    sendMessage(false);
  };
  dialogForm.onsubmit = (e) => {
    e.preventDefault();
    sendMessage(true);
  };
  $('chat-image-btn').onclick = () => fileInput.click();
  $('chat-dialog-image-btn').onclick = () => dialogFileInput.click();
  fileInput.onchange = (e) => {
    if (e.target.files) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  };
  dialogFileInput.onchange = (e) => {
    if (e.target.files) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  ChatManager.setupChatInput(chatInput, chatForm);
  ChatManager.setupChatInput(dialogInput, dialogForm);

  document.addEventListener('paste', (e) => {
    if (
      !chatContainer.contains(document.activeElement) &&
      !chatDialog.contains(document.activeElement)
    )
      return;
    const files = [];
    for (const item of e.clipboardData?.items || []) {
      if (item.type.includes('image')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) handleFiles(files);
  });

  messagesContainer.addEventListener('scroll', () => {
    if (hasNewMessages && isNearBottom(messagesContainer)) {
      hasNewMessages = false;
      updateNewMessageIndicator();
    }
  });

  goToBottomBtn.onclick = handleGoToBottom;

  let dragCounter = 0;
  chatContainer.ondragenter = (e) => {
    e.preventDefault();
    dragCounter++;
    dropOverlay.classList.remove('hidden');
    dropOverlay.classList.add('flex');
  };
  chatContainer.ondragleave = (e) => {
    e.preventDefault();
    if (--dragCounter === 0) {
      dropOverlay.classList.add('hidden');
      dropOverlay.classList.remove('flex');
    }
  };
  chatContainer.ondragover = (e) => e.preventDefault();
  chatContainer.ondrop = (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.add('hidden');
    dropOverlay.classList.remove('flex');
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  };

  chat.loadMessages();
  chat.connect();
}

function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 500; // Frequência em Hz
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {}
}

window.addEventListener('load', initChat);
