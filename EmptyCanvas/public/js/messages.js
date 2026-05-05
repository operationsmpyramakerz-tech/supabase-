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
      if (busy) {
        el.dataset.originalText = el.textContent || '';
        el.textContent = text;
      } else if (el.dataset.originalText) {
        el.textContent = el.dataset.originalText;
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

  async function loadCurrentUser() {
    try {
      const data = await apiJson('/api/account');
      state.currentUser = {
        name: data.name || data.username || '',
        photoUrl: data.photoUrl || '',
      };
    } catch {
      const cached = (localStorage.getItem('username') || '').trim();
      state.currentUser = { name: cached || 'User', photoUrl: '' };
    }
  }

  async function loadMembers() {
    const data = await apiJson('/api/messages/team-members');
    state.members = Array.isArray(data.members) ? data.members : [];
  }

  async function loadChats() {
    const data = await apiJson('/api/messages/chats?limit=60');
    state.chats = Array.isArray(data.chats) ? data.chats : [];
  }

  async function refreshAll({ keepSelection = true } = {}) {
    const refreshBtn = $('#msgRefreshBtn');
    refreshBtn?.classList.add('is-loading');
    try {
      state.loading = true;
      renderLoading();
      await Promise.all([loadCurrentUser(), loadMembers(), loadChats()]);
      renderPeopleStrip();
      renderChatsList();
      populateNewChatMembers();
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
        <button type="button" class="msg-person-card msg-person-card--new" id="msgNewChatBtn">
          <span class="msg-person-plus"><i data-feather="plus"></i></span>
          <span>New Chat</span>
        </button>
        <div class="msg-strip-loading">Loading users...</div>
      `;
      $('#msgNewChatBtn')?.addEventListener('click', () => openNewChatModal());
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

  function renderPeopleStrip() {
    const el = $('#msgPeopleStrip');
    if (!el) return;
    const q = state.query.trim().toLowerCase();
    const members = state.members
      .filter((m) => !q || [m.name, m.position, m.department, m.email, m.phone].some((x) => String(x || '').toLowerCase().includes(q)))
      .slice(0, 30);

    const rows = members.map((m) => {
      const avatar = m.photoUrl
        ? `<span class="msg-person-avatar"><img src="${escapeHtml(m.photoUrl)}" alt="${escapeHtml(m.name || 'User')}" /></span>`
        : `<span class="msg-person-avatar">${escapeHtml(initials(m.name))}</span>`;
      return `
        <button type="button" class="msg-person-card" data-member-id="${escapeHtml(m.id)}" title="${escapeHtml(m.name || '')}">
          ${avatar}
          <span>${escapeHtml(shortName(m.name))}</span>
        </button>
      `;
    }).join('');

    el.innerHTML = `
      <button type="button" class="msg-person-card msg-person-card--new" id="msgNewChatBtn">
        <span class="msg-person-plus"><i data-feather="plus"></i></span>
        <span>New Chat</span>
      </button>
      ${rows || '<div class="msg-strip-loading">No users found</div>'}
    `;

    $('#msgNewChatBtn')?.addEventListener('click', () => openNewChatModal());
    $$('[data-member-id]', el).forEach((btn) => {
      btn.addEventListener('click', () => {
        const member = state.members.find((m) => m.id === btn.dataset.memberId);
        if (member) createChatForMember(member);
      });
    });
    hydrateIcons();
  }

  function renderChatsList() {
    const el = $('#msgChatsList');
    const count = $('#msgChatsCount');
    if (!el) return;

    const q = state.query.trim().toLowerCase();
    const chats = state.chats.filter((c) => !q || [c.title, c.preview].some((x) => String(x || '').toLowerCase().includes(q)));

    if (count) count.textContent = String(chats.length);

    if (!chats.length) {
      el.innerHTML = `<div class="msg-empty-list">No chats found.</div>`;
      return;
    }

    el.innerHTML = chats.map((chat) => `
      <button type="button" class="msg-chat-row ${chat.id === state.selectedChatId ? 'is-active' : ''}" data-chat-id="${escapeHtml(chat.id)}">
        <span class="msg-chat-avatar">${escapeHtml(initials(chat.title))}</span>
        <span class="msg-chat-main">
          <span class="msg-chat-title">${escapeHtml(chat.title || 'Chat')}</span>
          <span class="msg-chat-preview">${escapeHtml(chat.preview || 'No messages yet')}</span>
        </span>
        <span class="msg-chat-meta">${escapeHtml(chat.lastMessageTimeText || chat.lastEditedTimeText || '')}</span>
      </button>
    `).join('');

    $$('[data-chat-id]', el).forEach((row) => {
      row.addEventListener('click', () => selectChat(row.dataset.chatId));
    });
  }

  async function selectChat(chatId) {
    const chat = state.chats.find((c) => c.id === chatId);
    if (!chat) return;
    state.selectedChatId = chatId;
    state.selectedChat = chat;
    renderChatsList();
    renderSelectedChatShell();
    const commentsEl = $('#msgComments');
    if (commentsEl) commentsEl.innerHTML = `<div class="msg-comments-loading"><span></span> Loading comments...</div>`;
    try {
      const data = await apiJson(`/api/messages/chats/${encodeURIComponent(chatId)}/comments`);
      state.comments = Array.isArray(data.comments) ? data.comments : [];
      renderComments();
    } catch (error) {
      if (commentsEl) commentsEl.innerHTML = `<div class="msg-empty-list">${escapeHtml(error.message || 'Could not load comments.')}</div>`;
    }
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
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = `${Number(chat.commentsCount || 0)} comment${Number(chat.commentsCount || 0) === 1 ? '' : 's'} · Notion page comments`;
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
      el.innerHTML = `<div class="msg-empty-list">No comments yet. Send the first message.</div>`;
      return;
    }
    el.innerHTML = state.comments.map((c) => `
      <div class="msg-bubble-row ${c.isMine ? 'is-mine' : ''}">
        <div class="msg-bubble">
          <div class="msg-bubble-sender">${escapeHtml(c.sender || 'User')}</div>
          <div class="msg-bubble-body">${escapeHtml(c.body || c.rawText || '')}</div>
          <div class="msg-bubble-time">${escapeHtml(c.createdTimeText || '')}</div>
        </div>
      </div>
    `).join('');
    requestAnimationFrame(() => {
      try { el.scrollTop = el.scrollHeight; } catch {}
    });
  }

  async function sendMessage(event) {
    event.preventDefault();
    const input = $('#msgComposerInput');
    const btn = $('#msgSendBtn');
    const msg = String(input?.value || '').trim();
    if (!state.selectedChatId || !msg) return;
    setBusy(btn, true);
    try {
      const data = await apiJson(`/api/messages/chats/${encodeURIComponent(state.selectedChatId)}/comments`, {
        method: 'POST',
        body: { message: msg },
      });
      if (input) input.value = '';
      if (data.comment) state.comments.push(data.comment);
      renderComments();
      // Update local preview without waiting for a full Notion reload.
      state.chats = state.chats.map((c) => {
        if (c.id !== state.selectedChatId) return c;
        return {
          ...c,
          preview: data.comment?.body || msg,
          commentsCount: Number(c.commentsCount || 0) + 1,
          lastMessageTime: data.comment?.createdTime || new Date().toISOString(),
          lastMessageTimeText: data.comment?.createdTimeText || 'just now',
        };
      });
      state.chats.sort((a, b) => new Date(b.lastMessageTime || 0) - new Date(a.lastMessageTime || 0));
      state.selectedChat = state.chats.find((c) => c.id === state.selectedChatId) || state.selectedChat;
      renderChatsList();
      renderSelectedChatShell();
    } catch (error) {
      toast(error.message || 'Failed to send message.', 'error');
    } finally {
      setBusy(btn, false);
    }
  }

  function populateNewChatMembers(selectedId = '') {
    const select = $('#msgNewChatMember');
    if (!select) return;
    select.innerHTML = state.members.map((m) => `
      <option value="${escapeHtml(m.id)}" ${m.id === selectedId ? 'selected' : ''}>${escapeHtml(m.name || 'Unnamed')}${m.department ? ` — ${escapeHtml(m.department)}` : ''}</option>
    `).join('');
  }

  function openNewChatModal(member = null) {
    const overlay = $('#msgNewChatModal');
    if (!overlay) return;
    populateNewChatMembers(member?.id || '');
    const titleInput = $('#msgNewChatTitleInput');
    const msgInput = $('#msgNewChatMessage');
    const err = $('#msgNewChatError');
    if (titleInput) titleInput.value = '';
    if (msgInput) msgInput.value = '';
    if (err) err.textContent = '';
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#msgNewChatMessage')?.focus(), 80);
    hydrateIcons();
  }

  function closeNewChatModal() {
    const overlay = $('#msgNewChatModal');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }

  async function createChatForMember(member) {
    if (!member) return;
    const title = `${state.currentUser?.name || 'User'} ↔ ${member.name || 'User'}`;
    try {
      const data = await apiJson('/api/messages/chats', {
        method: 'POST',
        body: {
          targetUserId: member.id,
          targetName: member.name || '',
          title,
        },
      });
      if (data.chat) {
        state.chats.unshift(data.chat);
        state.comments = Array.isArray(data.comments) ? data.comments : [];
        await selectCreatedChat(data.chat, state.comments);
      }
    } catch (error) {
      toast(error.message || 'Failed to create chat.', 'error');
    }
  }

  async function selectCreatedChat(chat, comments) {
    state.selectedChatId = chat.id;
    state.selectedChat = chat;
    state.comments = Array.isArray(comments) ? comments : [];
    renderChatsList();
    renderSelectedChatShell();
    renderComments();
  }

  async function submitNewChat(event) {
    event.preventDefault();
    const select = $('#msgNewChatMember');
    const titleInput = $('#msgNewChatTitleInput');
    const messageInput = $('#msgNewChatMessage');
    const createBtn = $('#msgNewChatCreate');
    const err = $('#msgNewChatError');

    const member = state.members.find((m) => m.id === select?.value) || null;
    if (!member) {
      if (err) err.textContent = 'Please select a team member.';
      return;
    }

    setBusy(createBtn, true);
    if (err) err.textContent = '';
    try {
      const data = await apiJson('/api/messages/chats', {
        method: 'POST',
        body: {
          targetUserId: member.id,
          targetName: member.name || '',
          title: titleInput?.value || '',
          message: messageInput?.value || '',
        },
      });
      closeNewChatModal();
      if (data.chat) {
        state.chats.unshift(data.chat);
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
    $('#msgBackMobile')?.addEventListener('click', () => $('.messages-shell')?.classList.remove('is-chat-open'));

    $('#msgNewChatForm')?.addEventListener('submit', submitNewChat);
    $('#msgNewChatClose')?.addEventListener('click', closeNewChatModal);
    $('#msgNewChatCancel')?.addEventListener('click', closeNewChatModal);
    $('#msgNewChatModal')?.addEventListener('click', (e) => {
      if (e.target === $('#msgNewChatModal')) closeNewChatModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#msgNewChatModal')?.hidden) closeNewChatModal();
    });
  }

  function hydrateIcons() {
    if (window.feather) {
      try { window.feather.replace(); } catch {}
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    refreshAll({ keepSelection: false });
  });
})();
