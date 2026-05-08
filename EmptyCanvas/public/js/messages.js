// public/js/messages.js
(function () {
  'use strict';

  const state = {
    members: [],
    chats: [],
    selectedChatId: '',
    selectedChat: null,
    comments: [],
    query: '',
    currentUser: null,
    loading: false,
    newMenuOpen: false,
    createMode: 'chat',
    activeFilter: 'all',
    readState: {},
    pendingAttachment: null,
    mentionItems: [],
    mentionActiveIndex: 0,
    mentionStart: -1,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeSearch(value) {
    return String(value || '').trim().toLowerCase();
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'M';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function shortName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'User';
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1][0] || ''}`.trim();
  }

  function setBusy(el, busy, text) {
    if (!el) return;
    el.disabled = !!busy;
    if (text) {
      const label = el.querySelector('span') || el;
      if (busy) {
        el.dataset.originalText = label.textContent || '';
        label.textContent = text;
      } else if (el.dataset.originalText) {
        label.textContent = el.dataset.originalText;
        delete el.dataset.originalText;
      }
    }
  }

  function toast(message, type = 'info') {
    if (window.showToast) {
      try { window.showToast(message, type); return; } catch {}
    }
    if (type === 'error') console.error(message);
  }

  async function apiJson(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      ...options,
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false || data?.success === false) {
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function hydrateIcons() {
    if (window.feather) {
      try { window.feather.replace(); } catch {}
    }
  }


  const MESSAGE_ATTACHMENT_PREFIX = '[[OPS_ATTACHMENT_V1]]';

  function parseAttachment(value) {
    const raw = String(value || '').trim();
    if (!raw.startsWith(MESSAGE_ATTACHMENT_PREFIX)) return null;
    try {
      const data = JSON.parse(raw.slice(MESSAGE_ATTACHMENT_PREFIX.length));
      const url = String(data?.url || '').trim();
      if (!url) return null;
      return {
        name: String(data?.name || 'Attachment').trim() || 'Attachment',
        url,
        mime: String(data?.mime || '').trim(),
        size: Number(data?.size || 0) || 0,
      };
    } catch {
      return null;
    }
  }

  function humanFileSize(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = n;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function attachmentIsImage(attachment) {
    const mime = String(attachment?.mime || '').toLowerCase();
    const url = String(attachment?.url || attachment?.previewUrl || '').toLowerCase();
    return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(url);
  }

  function readStateKey() {
    const email = normalizeSearch(state.currentUser?.email);
    const name = normalizeSearch(state.currentUser?.name);
    return `operationsHub.messages.readState.${email || name || 'anonymous'}`;
  }

  function loadReadState() {
    try {
      const raw = localStorage.getItem(readStateKey());
      state.readState = raw ? JSON.parse(raw) || {} : {};
    } catch {
      state.readState = {};
    }
  }

  function saveReadState() {
    try { localStorage.setItem(readStateKey(), JSON.stringify(state.readState || {})); } catch {}
  }

  function markChatRead(chat) {
    const id = String(chat?.id || state.selectedChatId || '');
    if (!id) return;
    const lastTime = String(chat?.lastMessageTime || chat?.lastEditedTime || chat?.createdTime || new Date().toISOString());
    state.readState[id] = lastTime;
    saveReadState();
  }

  function chatTimeValue(value) {
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? time : 0;
  }

  function isChatUnread(chat) {
    if (!chat || String(chat.id || '') === String(state.selectedChatId || '')) return false;
    const count = Number(chat.commentsCount || 0);
    if (!count) return false;
    const last = chatTimeValue(chat.lastMessageTime || chat.lastEditedTime || chat.createdTime);
    const read = chatTimeValue(state.readState?.[String(chat.id || '')]);
    return last > read;
  }

  function chatParticipantCount(chat) {
    return String(chat?.participantNames || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean).length;
  }

  function isGroupChat(chat) {
    const type = String(chat?.chatType || chat?.type || '').toLowerCase();
    return type === 'group' || type === 'room' || chatParticipantCount(chat) > 2;
  }

  function chatStatus(chat) {
    return String(chat?.status || chat?.state || '').trim().toLowerCase();
  }

  function isArchivedChat(chat) {
    const status = chatStatus(chat);
    return !!chat?.archived || status === 'archived' || status === 'archive';
  }

  function isClosedChat(chat) {
    const status = chatStatus(chat);
    return !!chat?.closed || status === 'closed' || status === 'done';
  }

  function chatMatchesFilter(chat, filter = state.activeFilter) {
    switch (filter) {
      case 'unread': return isChatUnread(chat);
      case 'groups': return isGroupChat(chat);
      case 'archived': return isArchivedChat(chat);
      case 'closed': return isClosedChat(chat);
      case 'all':
      default: return !isArchivedChat(chat) && !isClosedChat(chat);
    }
  }

  function filteredChats() {
    const q = state.query.trim().toLowerCase();
    return state.chats
      .filter((c) => chatMatchesFilter(c))
      .filter((c) => !q || [c.title, c.preview, c.participantNames].some((x) => String(x || '').toLowerCase().includes(q)));
  }

  function renderFilterTabs() {
    const tabs = $('#msgFilterTabs');
    if (!tabs) return;
    const filters = ['all', 'unread', 'groups', 'archived', 'closed'];
    const counts = Object.fromEntries(filters.map((f) => [f, state.chats.filter((chat) => chatMatchesFilter(chat, f)).length]));
    $$('[data-filter]', tabs).forEach((btn) => {
      const filter = btn.dataset.filter || 'all';
      btn.classList.toggle('is-active', filter === state.activeFilter);
      const badge = btn.querySelector('span');
      if (badge) badge.textContent = String(counts[filter] || 0);
    });
  }

  function setActiveFilter(filter) {
    state.activeFilter = ['all', 'unread', 'groups', 'archived', 'closed'].includes(filter) ? filter : 'all';
    renderFilterTabs();
    renderChatsList();
  }

  function formatMessageText(value) {
    let safe = escapeHtml(value || '');
    const names = (state.members || [])
      .map((m) => String(m.name || '').trim())
      .filter((name) => name.length >= 2)
      .sort((a, b) => b.length - a.length);
    for (const name of names) {
      const escapedName = escapeHtml(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|\\s)@(${escapedName})(?=$|\\s|[.,:;!?])`, 'gi');
      safe = safe.replace(re, '$1<span class="msg-mention">@$2</span>');
    }
    return safe.replace(/\n/g, '<br>');
  }

  function attachmentMarkup(attachment) {
    if (!attachment?.url) return '';
    const name = escapeHtml(attachment.name || 'Attachment');
    const meta = [attachment.mime, humanFileSize(attachment.size)].filter(Boolean).join(' • ');
    const url = escapeHtml(attachment.url);
    const isImage = attachmentIsImage(attachment);
    const preview = isImage
      ? `<span class="msg-attachment-image"><img src="${url}" alt="${name}" loading="lazy" /></span>`
      : '';
    return `
      <a class="msg-attachment-card ${isImage ? 'is-image' : ''}" href="${url}" target="_blank" rel="noopener">
        ${preview}
        <span class="msg-attachment-file-row">
          <span class="msg-attachment-icon"><i data-feather="${isImage ? 'image' : 'paperclip'}"></i></span>
          <span class="msg-attachment-info">
            <strong>${name}</strong>
            <small>${escapeHtml(meta || 'Open attachment')}</small>
          </span>
          <span class="msg-attachment-open"><i data-feather="external-link"></i></span>
        </span>
      </a>
    `;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });
  }

  function getMentionContext(input) {
    if (!input) return null;
    const value = String(input.value || '');
    const cursor = Number(input.selectionStart ?? value.length);
    const before = value.slice(0, cursor);
    const atIndex = before.lastIndexOf('@');
    if (atIndex < 0) return null;
    const prefix = before.slice(0, atIndex);
    if (prefix && !/[\s(\[{]$/.test(prefix)) return null;
    const query = before.slice(atIndex + 1);
    if (/\s/.test(query) || query.length > 40) return null;
    return { start: atIndex, end: cursor, query: query.toLowerCase() };
  }

  function closeMentionMenu() {
    const menu = $('#msgMentionMenu');
    if (menu) {
      menu.hidden = true;
      menu.innerHTML = '';
    }
    state.mentionItems = [];
    state.mentionActiveIndex = 0;
    state.mentionStart = -1;
  }

  function renderMentionMenu() {
    const menu = $('#msgMentionMenu');
    if (!menu) return;
    if (!state.mentionItems.length) {
      closeMentionMenu();
      return;
    }
    menu.hidden = false;
    menu.innerHTML = state.mentionItems.map((m, index) => {
      const avatar = m.photoUrl
        ? `<span class="msg-mention-avatar"><img src="${escapeHtml(m.photoUrl)}" alt="${escapeHtml(m.name || 'User')}" /></span>`
        : `<span class="msg-mention-avatar">${escapeHtml(initials(m.name))}</span>`;
      return `
        <button type="button" class="msg-mention-option ${index === state.mentionActiveIndex ? 'is-active' : ''}" data-mention-index="${index}">
          ${avatar}
          <span class="msg-mention-person">
            <strong>${escapeHtml(m.name || 'Unnamed')}</strong>
            <small>${escapeHtml(m.department || m.position || 'Team member')}</small>
          </span>
        </button>
      `;
    }).join('');
    $$('[data-mention-index]', menu).forEach((btn) => {
      btn.addEventListener('mousedown', (event) => {
        event.preventDefault();
        insertMention(Number(btn.dataset.mentionIndex || 0));
      });
    });
    hydrateIcons();
  }

  function updateMentionSuggestions() {
    const input = $('#msgComposerInput');
    const ctx = getMentionContext(input);
    if (!ctx) {
      closeMentionMenu();
      return;
    }
    const q = ctx.query;
    const members = (state.members || []).filter((m) => {
      const haystack = [m.name, m.department, m.position, m.email].join(' ').toLowerCase();
      return !q || haystack.includes(q);
    }).slice(0, 8);
    state.mentionStart = ctx.start;
    state.mentionItems = members;
    state.mentionActiveIndex = 0;
    renderMentionMenu();
  }

  function insertMention(index = state.mentionActiveIndex) {
    const input = $('#msgComposerInput');
    const member = state.mentionItems[index];
    if (!input || !member) return;
    const value = String(input.value || '');
    const cursor = Number(input.selectionStart ?? value.length);
    const ctx = getMentionContext(input);
    if (!ctx) return;
    const mention = `@${String(member.name || 'User').trim()} `;
    input.value = `${value.slice(0, ctx.start)}${mention}${value.slice(cursor)}`;
    const nextPos = ctx.start + mention.length;
    input.focus();
    try { input.setSelectionRange(nextPos, nextPos); } catch {}
    closeMentionMenu();
  }

  function handleMentionKeydown(event) {
    if (!state.mentionItems.length || $('#msgMentionMenu')?.hidden) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      state.mentionActiveIndex = (state.mentionActiveIndex + 1) % state.mentionItems.length;
      renderMentionMenu();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      state.mentionActiveIndex = (state.mentionActiveIndex - 1 + state.mentionItems.length) % state.mentionItems.length;
      renderMentionMenu();
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      insertMention();
    } else if (event.key === 'Escape') {
      closeMentionMenu();
    }
  }

  function currentUserKey() {
    const name = normalizeSearch(state.currentUser?.name);
    const email = normalizeSearch(state.currentUser?.email);
    return { name, email };
  }

  function isCurrentUserMember(member) {
    const cur = currentUserKey();
    const name = normalizeSearch(member?.name);
    const email = normalizeSearch(member?.email);
    return (!!cur.email && !!email && cur.email === email) || (!!cur.name && !!name && cur.name === name);
  }

  function selectableMembers() {
    return state.members.filter((member) => !isCurrentUserMember(member));
  }

  async function loadCurrentUser() {
    try {
      const data = await apiJson('/api/account');
      state.currentUser = {
        name: data.name || data.username || '',
        email: data.email || '',
        photoUrl: data.photoUrl || '',
      };
    } catch {
      const cached = (localStorage.getItem('username') || '').trim();
      state.currentUser = { name: cached || 'User', email: '', photoUrl: '' };
    }
  }

  async function loadMembers() {
    const data = await apiJson('/api/messages/team-members');
    state.members = Array.isArray(data.members) ? data.members : [];
  }

  async function loadChats() {
    const data = await apiJson('/api/messages/chats?limit=80');
    state.chats = Array.isArray(data.chats) ? data.chats : [];
  }

  async function refreshAll({ keepSelection = true } = {}) {
    const refreshBtn = $('#msgRefreshBtn');
    refreshBtn?.classList.add('is-loading');
    try {
      state.loading = true;
      renderLoading();
      await loadCurrentUser();
      loadReadState();
      await Promise.all([loadMembers(), loadChats()]);
      renderPeopleStrip();
      renderFilterTabs();
      renderChatsList();
      populateNewChatMembers();
      renderGroupMemberPicker();
      if (keepSelection && state.selectedChatId) {
        const stillExists = state.chats.find((c) => c.id === state.selectedChatId);
        if (stillExists) {
          state.selectedChat = stillExists;
          renderSelectedChatShell();
        }
      }
    } catch (error) {
      renderError(error.message || 'Failed to load messages.');
    } finally {
      state.loading = false;
      refreshBtn?.classList.remove('is-loading');
      hydrateIcons();
    }
  }

  function renderLoading() {
    const people = $('#msgPeopleStrip');
    const list = $('#msgChatsList');
    if (people && !state.members.length) {
      people.innerHTML = `
        ${newButtonMarkup()}
        <div class="msg-strip-loading">Loading users...</div>
      `;
      bindNewMenu();
    }
    if (list && !state.chats.length) {
      list.innerHTML = `<div class="msg-list-loading"><span></span> Loading chats...</div>`;
    }
  }

  function renderError(message) {
    const list = $('#msgChatsList');
    const count = $('#msgChatsCount');
    if (count) count.textContent = '0';
    if (list) {
      list.innerHTML = `<div class="msg-empty-list">${escapeHtml(message || 'Could not load messages.')}</div>`;
    }
  }

  function newButtonMarkup() {
    return `
      <div class="msg-new-menu-wrap ${state.newMenuOpen ? 'is-open' : ''}">
        <button type="button" class="msg-person-card msg-person-card--new" id="msgNewBtn" aria-haspopup="true" aria-expanded="${state.newMenuOpen ? 'true' : 'false'}">
          <span class="msg-person-plus"><i data-feather="plus"></i></span>
          <span>New</span>
        </button>
        <div class="msg-new-menu" id="msgNewMenu" ${state.newMenuOpen ? '' : 'hidden'}>
          <button type="button" class="msg-new-choice" id="msgOpenNewChat" aria-label="New chat">
            <span><i data-feather="message-circle"></i></span>
            <strong>New Chat</strong>
          </button>
          <button type="button" class="msg-new-choice" id="msgOpenNewGroup" aria-label="New group">
            <span><i data-feather="users"></i></span>
            <strong>New Group</strong>
          </button>
        </div>
      </div>
    `;
  }

  function setNewMenu(open) {
    state.newMenuOpen = !!open;
    const wrap = $('.msg-new-menu-wrap');
    const menu = $('#msgNewMenu');
    const btn = $('#msgNewBtn');
    if (wrap) wrap.classList.toggle('is-open', state.newMenuOpen);
    if (menu) menu.hidden = !state.newMenuOpen;
    if (btn) btn.setAttribute('aria-expanded', state.newMenuOpen ? 'true' : 'false');
    hydrateIcons();
  }

  function bindNewMenu() {
    $('#msgNewBtn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      setNewMenu(!state.newMenuOpen);
    });
    $('#msgOpenNewChat')?.addEventListener('click', (event) => {
      event.stopPropagation();
      setNewMenu(false);
      openNewChatModal('chat');
    });
    $('#msgOpenNewGroup')?.addEventListener('click', (event) => {
      event.stopPropagation();
      setNewMenu(false);
      openNewChatModal('group');
    });
  }

  function renderPeopleStrip() {
    const el = $('#msgPeopleStrip');
    if (!el) return;
    const q = state.query.trim().toLowerCase();
    const members = selectableMembers()
      .filter((m) => !q || [m.name, m.position, m.department, m.email, m.phone].some((x) => String(x || '').toLowerCase().includes(q)))
      .slice(0, 30);

    const rows = members.map((m) => {
      const avatar = m.photoUrl
        ? `<span class="msg-person-avatar"><img src="${escapeHtml(m.photoUrl)}" alt="${escapeHtml(m.name || 'User')}" /></span>`
        : `<span class="msg-person-avatar">${escapeHtml(initials(m.name))}</span>`;
      const search = [m.name, m.position, m.department, m.email, m.phone].filter(Boolean).join(' ');
      return `
        <button type="button" class="msg-person-card" data-member-id="${escapeHtml(m.id)}" data-search="${escapeHtml(search)}" title="${escapeHtml(m.name || '')}">
          ${avatar}
          <span>${escapeHtml(shortName(m.name))}</span>
        </button>
      `;
    }).join('');

    el.innerHTML = `
      ${newButtonMarkup()}
      ${rows || '<div class="msg-strip-loading">No users found</div>'}
    `;

    bindNewMenu();
    $$('[data-member-id]', el).forEach((btn) => {
      btn.addEventListener('click', () => {
        const member = state.members.find((m) => m.id === btn.dataset.memberId);
        if (member) openNewChatModal('chat', member);
      });
    });
    hydrateIcons();
  }

  function renderChatsList() {
    const el = $('#msgChatsList');
    const count = $('#msgChatsCount');
    const title = $('#msgListTitle');
    if (!el) return;

    const chats = filteredChats();
    const labels = {
      all: 'Recent chats',
      unread: 'Unread chats',
      groups: 'Group rooms',
      archived: 'Archived chats',
      closed: 'Closed chats',
    };

    if (title) title.textContent = labels[state.activeFilter] || 'Recent chats';
    if (count) count.textContent = String(chats.length);
    renderFilterTabs();

    if (!chats.length) {
      const emptyMessages = {
        all: 'No chats found.',
        unread: 'No unread chats.',
        groups: 'No group chats yet.',
        archived: 'No archived chats.',
        closed: 'No closed chats.',
      };
      el.innerHTML = `<div class="msg-empty-list">${escapeHtml(emptyMessages[state.activeFilter] || 'No chats found.')}</div>`;
      return;
    }

    el.innerHTML = chats.map((chat) => {
      const search = [chat.title, chat.preview, chat.participantNames].filter(Boolean).join(' ');
      const unread = isChatUnread(chat);
      const badges = [
        isGroupChat(chat) ? '<span class="msg-chat-badge">Group</span>' : '',
        isArchivedChat(chat) ? '<span class="msg-chat-badge">Archived</span>' : '',
        isClosedChat(chat) ? '<span class="msg-chat-badge">Closed</span>' : '',
      ].filter(Boolean).join('');
      return `
        <button type="button" class="msg-chat-row ${chat.id === state.selectedChatId ? 'is-active' : ''} ${unread ? 'is-unread' : ''}" data-chat-id="${escapeHtml(chat.id)}" data-search="${escapeHtml(search)}">
          <span class="msg-chat-avatar">${escapeHtml(initials(chat.title))}</span>
          <span class="msg-chat-main">
            <span class="msg-chat-title-wrap">
              <span class="msg-chat-title">${escapeHtml(chat.title || 'Chat')}</span>
              ${unread ? '<span class="msg-unread-dot" aria-label="Unread"></span>' : ''}
            </span>
            <span class="msg-chat-preview">${escapeHtml(chat.preview || 'No messages yet')}</span>
            ${badges ? `<span class="msg-chat-badges">${badges}</span>` : ''}
          </span>
          <span class="msg-chat-meta">${escapeHtml(chat.lastMessageTimeText || chat.lastEditedTimeText || '')}</span>
        </button>
      `;
    }).join('');

    $$('[data-chat-id]', el).forEach((row) => {
      row.addEventListener('click', () => selectChat(row.dataset.chatId));
    });
  }

  async function selectChat(chatId) {
    const chat = state.chats.find((c) => c.id === chatId);
    if (!chat) return;
    state.selectedChatId = chatId;
    state.selectedChat = chat;
    clearPendingAttachment();
    renderChatsList();
    renderSelectedChatShell();
    const commentsEl = $('#msgComments');
    if (commentsEl) commentsEl.innerHTML = `<div class="msg-comments-loading"><span></span> Loading messages...</div>`;
    try {
      const data = await apiJson(`/api/messages/chats/${encodeURIComponent(chatId)}/comments`);
      state.comments = Array.isArray(data.comments) ? data.comments : [];
      markChatRead(state.selectedChat);
      renderChatsList();
      renderComments();
    } catch (error) {
      if (commentsEl) commentsEl.innerHTML = `<div class="msg-empty-list">${escapeHtml(error.message || 'Could not load messages.')}</div>`;
    }
  }

  function closeActiveChat() {
    state.selectedChatId = '';
    state.selectedChat = null;
    state.comments = [];
    const empty = $('#msgEmptyState');
    const conv = $('#msgConversation');
    const shell = $('.messages-shell');
    if (empty) empty.hidden = false;
    if (conv) conv.hidden = true;
    shell?.classList.remove('is-chat-open');
    clearPendingAttachment();
    renderChatsList();
  }

  function renderSelectedChatShell() {
    const empty = $('#msgEmptyState');
    const conv = $('#msgConversation');
    const shell = $('.messages-shell');
    if (empty) empty.hidden = true;
    if (conv) conv.hidden = false;
    shell?.classList.add('is-chat-open');

    const chat = state.selectedChat || {};
    const title = chat.title || 'Chat';
    const titleEl = $('#msgConvTitle');
    const subEl = $('#msgConvSubtitle');
    const avEl = $('#msgConvAvatar');
    const notionLink = $('#msgOpenNotion');
    const participants = String(chat.participantNames || '').trim();
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = participants || `${Number(chat.commentsCount || 0)} message${Number(chat.commentsCount || 0) === 1 ? '' : 's'}`;
    if (avEl) avEl.textContent = initials(title);
    if (notionLink) {
      if (chat.url) {
        notionLink.href = chat.url;
        notionLink.hidden = false;
      } else {
        notionLink.hidden = true;
      }
    }
    hydrateIcons();
  }

  function renderComments() {
    const el = $('#msgComments');
    if (!el) return;
    if (!state.comments.length) {
      el.innerHTML = `<div class="msg-empty-list">No messages yet.</div>`;
      return;
    }
    el.innerHTML = state.comments.map((c) => {
      if (c.isSystem || String(c.messageType || '').toLowerCase() === 'system') {
        return `
          <div class="msg-system-row">
            <span>${escapeHtml(c.body || c.rawText || '')}</span>
          </div>
        `;
      }
      const attachment = c.attachment || parseAttachment(c.body || c.rawText || '');
      const bodyHtml = attachment ? attachmentMarkup(attachment) : formatMessageText(c.body || c.rawText || '');
      return `
        <div class="msg-bubble-row ${c.isMine ? 'is-mine' : ''}">
          <div class="msg-bubble ${attachment ? 'has-attachment' : ''}">
            <div class="msg-bubble-sender">${escapeHtml(c.sender || 'User')}</div>
            <div class="msg-bubble-body">${bodyHtml}</div>
            <div class="msg-bubble-time">${escapeHtml(c.createdTimeText || '')}</div>
          </div>
        </div>
      `;
    }).join('');
    hydrateIcons();
    requestAnimationFrame(() => {
      try { el.scrollTop = el.scrollHeight; } catch {}
    });
  }

  function updateChatAfterComment(comment, fallbackPreview = '') {
    if (!comment || !state.selectedChatId) return;
    const preview = comment.attachment
      ? `📎 ${comment.attachment.name || 'Attachment'}`
      : (comment.body || fallbackPreview || 'New message');
    state.chats = state.chats.map((c) => {
      if (String(c.id) !== String(state.selectedChatId)) return c;
      return {
        ...c,
        preview,
        commentsCount: Number(c.commentsCount || 0) + 1,
        lastMessageTime: comment.createdTime || new Date().toISOString(),
        lastMessageTimeText: comment.createdTimeText || 'just now',
      };
    });
    state.chats.sort((a, b) => new Date(b.lastMessageTime || 0) - new Date(a.lastMessageTime || 0));
    state.selectedChat = state.chats.find((c) => String(c.id) === String(state.selectedChatId)) || state.selectedChat;
    markChatRead(state.selectedChat);
    renderChatsList();
    renderFilterTabs();
    renderSelectedChatShell();
  }

  async function postTextMessage(message) {
    const data = await apiJson(`/api/messages/chats/${encodeURIComponent(state.selectedChatId)}/comments`, {
      method: 'POST',
      body: { message },
    });
    if (data.comment) {
      state.comments.push(data.comment);
      updateChatAfterComment(data.comment, message);
    }
    return data.comment || null;
  }

  async function postAttachmentMessage(attachment) {
    const data = await apiJson(`/api/messages/chats/${encodeURIComponent(state.selectedChatId)}/attachments`, {
      method: 'POST',
      body: {
        filename: attachment.file?.name || attachment.name || 'attachment',
        mime: attachment.file?.type || attachment.mime || 'application/octet-stream',
        size: attachment.file?.size || attachment.size || 0,
        dataUrl: attachment.dataUrl,
      },
    });
    if (data.comment) {
      state.comments.push(data.comment);
      updateChatAfterComment(data.comment, `📎 ${attachment.name || 'Attachment'}`);
    }
    return data.comment || null;
  }

  function clearPendingAttachment() {
    const oldUrl = state.pendingAttachment?.previewUrl || '';
    if (oldUrl) {
      try { URL.revokeObjectURL(oldUrl); } catch {}
    }
    state.pendingAttachment = null;
    renderAttachmentDraft();
    const input = $('#msgAttachmentInput');
    if (input) input.value = '';
  }

  function renderAttachmentDraft() {
    const box = $('#msgAttachmentDraft');
    if (!box) return;
    const item = state.pendingAttachment;
    if (!item) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const isPreparing = item.status === 'reading';
    const isUploading = item.status === 'uploading';
    const isImage = attachmentIsImage(item);
    const thumbnail = isImage && item.previewUrl
      ? `<span class="msg-draft-thumb is-image"><img src="${escapeHtml(item.previewUrl)}" alt="${escapeHtml(item.name || 'Attachment')}" /></span>`
      : `<span class="msg-draft-thumb"><i data-feather="paperclip"></i></span>`;
    const statusText = isUploading ? 'Uploading...' : (isPreparing ? 'Preparing preview...' : 'Ready to send');
    box.hidden = false;
    box.innerHTML = `
      <div class="msg-draft-card ${isPreparing || isUploading ? 'is-loading' : ''}">
        ${thumbnail}
        <span class="msg-draft-info">
          <strong>${escapeHtml(item.name || 'Attachment')}</strong>
          <small>${escapeHtml([item.mime, humanFileSize(item.size), statusText].filter(Boolean).join(' • '))}</small>
          <span class="msg-draft-progress"><i></i></span>
        </span>
        <button type="button" class="msg-draft-remove" id="msgDraftRemove" aria-label="Remove selected attachment">×</button>
      </div>
    `;
    $('#msgDraftRemove')?.addEventListener('click', clearPendingAttachment);
    hydrateIcons();
  }

  async function prepareAttachmentFile(file) {
    if (!state.selectedChatId) {
      toast('Please select a chat first.', 'error');
      return;
    }
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      toast('File is too large. Maximum size is 12MB.', 'error');
      return;
    }
    clearPendingAttachment();
    const previewUrl = file.type && file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    state.pendingAttachment = {
      file,
      name: file.name || 'attachment',
      mime: file.type || 'application/octet-stream',
      size: file.size || 0,
      previewUrl,
      dataUrl: '',
      status: 'reading',
    };
    renderAttachmentDraft();
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (!state.pendingAttachment || state.pendingAttachment.file !== file) return;
      state.pendingAttachment.dataUrl = dataUrl;
      state.pendingAttachment.status = 'ready';
      renderAttachmentDraft();
      toast('Attachment selected. Press Send to upload it.', 'success');
    } catch (error) {
      clearPendingAttachment();
      toast(error.message || 'Failed to read attachment.', 'error');
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const input = $('#msgComposerInput');
    const btn = $('#msgSendBtn');
    const msg = String(input?.value || '').trim();
    const pending = state.pendingAttachment;
    if (!state.selectedChatId || (!msg && !pending)) return;
    if (pending && pending.status === 'reading') {
      toast('Please wait until the attachment preview is ready.', 'info');
      return;
    }
    setBusy(btn, true, pending ? 'Sending...' : undefined);
    try {
      if (msg) {
        await postTextMessage(msg);
        if (input) input.value = '';
        closeMentionMenu();
      }
      if (pending) {
        pending.status = 'uploading';
        renderAttachmentDraft();
        await postAttachmentMessage(pending);
        clearPendingAttachment();
      }
      renderComments();
    } catch (error) {
      if (pending && state.pendingAttachment) {
        state.pendingAttachment.status = 'ready';
        renderAttachmentDraft();
      }
      toast(error.message || 'Failed to send message.', 'error');
    } finally {
      setBusy(btn, false);
    }
  }

  function populateNewChatMembers(selectedId = '') {
    const select = $('#msgNewChatMember');
    if (!select) return;
    const members = selectableMembers();
    select.innerHTML = members.map((m) => `
      <option value="${escapeHtml(m.id)}" ${m.id === selectedId ? 'selected' : ''}>${escapeHtml(m.name || 'Unnamed')}${m.department ? ` — ${escapeHtml(m.department)}` : ''}</option>
    `).join('');
  }

  function renderGroupMemberPicker(selectedIds = []) {
    const box = $('#msgGroupMembersList');
    if (!box) return;
    const selected = new Set((Array.isArray(selectedIds) ? selectedIds : []).map((id) => String(id)));
    const members = selectableMembers();
    if (!members.length) {
      box.innerHTML = '<div class="msg-empty-list">No team members available.</div>';
      return;
    }
    box.innerHTML = members.map((m) => {
      const avatar = m.photoUrl
        ? `<span class="msg-member-check-avatar"><img src="${escapeHtml(m.photoUrl)}" alt="${escapeHtml(m.name || 'User')}" /></span>`
        : `<span class="msg-member-check-avatar">${escapeHtml(initials(m.name))}</span>`;
      return `
        <label class="msg-member-check">
          <input type="checkbox" value="${escapeHtml(m.id)}" ${selected.has(String(m.id)) ? 'checked' : ''} />
          ${avatar}
          <span class="msg-member-check-text">
            <strong>${escapeHtml(m.name || 'Unnamed')}</strong>
            <small>${escapeHtml(m.department || m.position || 'Team member')}</small>
          </span>
        </label>
      `;
    }).join('');
  }

  function setCreateMode(mode, member = null) {
    state.createMode = mode === 'group' ? 'group' : 'chat';
    const isGroup = state.createMode === 'group';
    const modeInput = $('#msgNewChatMode');
    const title = $('#msgNewChatTitle');
    const subtitle = $('#msgNewChatSubtitle');
    const icon = $('#msgNewChatIcon');
    const singleField = $('#msgSingleMemberField');
    const groupField = $('#msgGroupMembersField');
    const submitLabel = $('#msgNewChatCreate span');
    if (modeInput) modeInput.value = state.createMode;
    if (title) title.textContent = isGroup ? 'New Group' : 'New Chat';
    if (subtitle) subtitle.textContent = isGroup ? 'Choose a subject and the people for this group room.' : 'Choose a subject and the team member for this chat room.';
    if (icon) icon.innerHTML = `<i data-feather="${isGroup ? 'users' : 'message-circle'}"></i>`;
    if (singleField) singleField.hidden = isGroup;
    if (groupField) groupField.hidden = !isGroup;
    if (submitLabel) submitLabel.textContent = isGroup ? 'Create Group' : 'Create Chat';
    populateNewChatMembers(member?.id || '');
    renderGroupMemberPicker(member ? [member.id] : []);
  }

  function openNewChatModal(mode = 'chat', member = null) {
    const overlay = $('#msgNewChatModal');
    if (!overlay) return;
    setCreateMode(mode, member);
    const subjectInput = $('#msgNewChatSubject');
    const err = $('#msgNewChatError');
    if (subjectInput) subjectInput.value = '';
    if (err) err.textContent = '';
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#msgNewChatSubject')?.focus(), 80);
    hydrateIcons();
  }

  function closeNewChatModal() {
    const overlay = $('#msgNewChatModal');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }

  async function selectCreatedChat(chat, comments) {
    state.selectedChatId = chat.id;
    state.selectedChat = chat;
    clearPendingAttachment();
    state.comments = Array.isArray(comments) ? comments : [];
    markChatRead(chat);
    renderFilterTabs();
    renderChatsList();
    renderSelectedChatShell();
    renderComments();
  }

  function selectedGroupMemberIds() {
    return $$('#msgGroupMembersList input[type="checkbox"]:checked').map((input) => String(input.value || '').trim()).filter(Boolean);
  }

  async function submitNewChat(event) {
    event.preventDefault();
    const select = $('#msgNewChatMember');
    const subjectInput = $('#msgNewChatSubject');
    const createBtn = $('#msgNewChatCreate');
    const err = $('#msgNewChatError');
    const mode = String($('#msgNewChatMode')?.value || state.createMode || 'chat');
    const subject = String(subjectInput?.value || '').trim();

    if (!subject) {
      if (err) err.textContent = 'Please enter the subject.';
      subjectInput?.focus();
      return;
    }

    let body = { title: subject };
    if (mode === 'group') {
      const ids = selectedGroupMemberIds();
      if (!ids.length) {
        if (err) err.textContent = 'Please select at least one person.';
        return;
      }
      body = { ...body, type: 'group', targetUserIds: ids };
    } else {
      const member = state.members.find((m) => m.id === select?.value) || null;
      if (!member) {
        if (err) err.textContent = 'Please select a team member.';
        return;
      }
      body = { ...body, type: 'chat', targetUserId: member.id, targetName: member.name || '' };
    }

    setBusy(createBtn, true, 'Creating...');
    if (err) err.textContent = '';
    try {
      const data = await apiJson('/api/messages/chats', {
        method: 'POST',
        body,
      });
      closeNewChatModal();
      if (data.chat) {
        state.chats = [data.chat, ...state.chats.filter((c) => String(c.id) !== String(data.chat.id))];
        await selectCreatedChat(data.chat, data.comments || []);
      }
    } catch (error) {
      if (err) err.textContent = error.message || 'Failed to create chat.';
    } finally {
      setBusy(createBtn, false);
    }
  }

  function bindEvents() {
    $('#msgRefreshBtn')?.addEventListener('click', () => refreshAll({ keepSelection: true }));
    $('#msgSearchInput')?.addEventListener('input', (e) => {
      state.query = String(e.target.value || '');
      renderPeopleStrip();
      renderChatsList();
    });
    $('#msgComposer')?.addEventListener('submit', sendMessage);
    $('#msgAttachBtn')?.addEventListener('click', () => $('#msgAttachmentInput')?.click());
    $('#msgAttachmentInput')?.addEventListener('change', (event) => prepareAttachmentFile(event.target?.files?.[0] || null));
    $('#msgComposerInput')?.addEventListener('input', updateMentionSuggestions);
    $('#msgComposerInput')?.addEventListener('keydown', handleMentionKeydown);
    $('#msgComposerInput')?.addEventListener('blur', () => setTimeout(closeMentionMenu, 160));
    $('#msgBackMobile')?.addEventListener('click', closeActiveChat);

    $('#msgFilterTabs')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-filter]');
      if (btn) setActiveFilter(btn.dataset.filter || 'all');
    });

    $('#msgNewChatForm')?.addEventListener('submit', submitNewChat);
    $('#msgNewChatClose')?.addEventListener('click', closeNewChatModal);
    $('#msgNewChatCancel')?.addEventListener('click', closeNewChatModal);
    $('#msgNewChatModal')?.addEventListener('click', (e) => {
      if (e.target === $('#msgNewChatModal')) closeNewChatModal();
    });
    document.addEventListener('click', (e) => {
      if (!state.newMenuOpen) return;
      if (!e.target.closest('.msg-new-menu-wrap')) setNewMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('#msgNewChatModal')?.hidden) closeNewChatModal();
        closeMentionMenu();
        setNewMenu(false);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    refreshAll({ keepSelection: false });
  });
})();
