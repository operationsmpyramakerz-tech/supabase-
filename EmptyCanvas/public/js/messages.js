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
      await Promise.all([loadCurrentUser(), loadMembers(), loadChats()]);
      renderPeopleStrip();
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
    if (!el) return;

    const q = state.query.trim().toLowerCase();
    const chats = state.chats.filter((c) => !q || [c.title, c.preview, c.participantNames].some((x) => String(x || '').toLowerCase().includes(q)));

    if (count) count.textContent = String(chats.length);

    if (!chats.length) {
      el.innerHTML = `<div class="msg-empty-list">No chats found.</div>`;
      return;
    }

    el.innerHTML = chats.map((chat) => {
      const search = [chat.title, chat.preview, chat.participantNames].filter(Boolean).join(' ');
      return `
        <button type="button" class="msg-chat-row ${chat.id === state.selectedChatId ? 'is-active' : ''}" data-chat-id="${escapeHtml(chat.id)}" data-search="${escapeHtml(search)}">
          <span class="msg-chat-avatar">${escapeHtml(initials(chat.title))}</span>
          <span class="msg-chat-main">
            <span class="msg-chat-title">${escapeHtml(chat.title || 'Chat')}</span>
            <span class="msg-chat-preview">${escapeHtml(chat.preview || 'No messages yet')}</span>
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
    renderChatsList();
    renderSelectedChatShell();
    const commentsEl = $('#msgComments');
    if (commentsEl) commentsEl.innerHTML = `<div class="msg-comments-loading"><span></span> Loading messages...</div>`;
    try {
      const data = await apiJson(`/api/messages/chats/${encodeURIComponent(chatId)}/comments`);
      state.comments = Array.isArray(data.comments) ? data.comments : [];
      renderComments();
    } catch (error) {
      if (commentsEl) commentsEl.innerHTML = `<div class="msg-empty-list">${escapeHtml(error.message || 'Could not load messages.')}</div>`;
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
      return `
        <div class="msg-bubble-row ${c.isMine ? 'is-mine' : ''}">
          <div class="msg-bubble">
            <div class="msg-bubble-sender">${escapeHtml(c.sender || 'User')}</div>
            <div class="msg-bubble-body">${escapeHtml(c.body || c.rawText || '')}</div>
            <div class="msg-bubble-time">${escapeHtml(c.createdTimeText || '')}</div>
          </div>
        </div>
      `;
    }).join('');
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
    state.comments = Array.isArray(comments) ? comments : [];
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
    $('#msgBackMobile')?.addEventListener('click', () => $('.messages-shell')?.classList.remove('is-chat-open'));

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
        setNewMenu(false);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    refreshAll({ keepSelection: false });
  });
})();
