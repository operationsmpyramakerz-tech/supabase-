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
    presenceEntries: [],
    presenceByName: new Map(),
    presenceByEmail: new Map(),
    lastTypingAt: 0,
    typingStopTimer: null,
    heartbeatTimer: null,
    presenceTimer: null,
    chatsTimer: null,
    commentsTimer: null,
    commentsSignature: '',
    reactions: new Map(),
    reactionsSignature: '',
    visibleTimes: new Set(),
    activeReactionMessageId: '',
    longPressFired: false,
    mediaRecorder: null,
    mediaStream: null,
    voiceChunks: [],
    isRecording: false,
    recordStartedAt: 0,
    customLabels: [],
    floatingNewMenuOpen: false,
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
    return `operationsHub.emails.readState.${email || name || 'anonymous'}`;
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
    try { window.__opsRefreshMailUnread?.(); } catch {}
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

  function dateKey(value) {
    const time = Date.parse(value || '');
    if (!Number.isFinite(time)) return '';
    const d = new Date(time);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDateDivider(value) {
    const time = Date.parse(value || '');
    if (!Number.isFinite(time)) return '';
    const d = new Date(time);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const key = dateKey(value);
    if (key === dateKey(today.toISOString())) return 'Today';
    if (key === dateKey(yesterday.toISOString())) return 'Yesterday';
    try {
      return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
    } catch {
      return key;
    }
  }

  function formatMessageTime(value) {
    const time = Date.parse(value || '');
    if (!Number.isFinite(time)) return '';
    try {
      return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(time));
    } catch {
      return '';
    }
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

  function labelsStorageKey() {
    const email = normalizeSearch(state.currentUser?.email);
    const name = normalizeSearch(state.currentUser?.name);
    return `operationsHub.emails.customLabels.${email || name || 'anonymous'}`;
  }

  function sanitizeLabelColor(value) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
    return '#1d9bf0';
  }

  function clampNumber(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.max(min, Math.min(max, numeric));
  }

  function normalizeHexDraft(value) {
    const raw = String(value || '').trim().replace(/[^0-9a-f#]/gi, '');
    const withoutHash = raw.replace(/^#/, '').slice(0, 6);
    return withoutHash ? `#${withoutHash}` : '#';
  }

  function hslToHex(hue, saturation, lightness = 53) {
    const h = ((clampNumber(hue, 0, 360) % 360) + 360) % 360;
    const s = clampNumber(saturation, 0, 100) / 100;
    const l = clampNumber(lightness, 0, 100) / 100;
    const c = (1 - Math.abs((2 * l) - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - (c / 2);
    let r1 = 0;
    let g1 = 0;
    let b1 = 0;
    if (h < 60) [r1, g1, b1] = [c, x, 0];
    else if (h < 120) [r1, g1, b1] = [x, c, 0];
    else if (h < 180) [r1, g1, b1] = [0, c, x];
    else if (h < 240) [r1, g1, b1] = [0, x, c];
    else if (h < 300) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];
    return [r1, g1, b1]
      .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0'))
      .join('')
      .replace(/^/, '#');
  }

  function hexToHsl(color) {
    const hex = sanitizeLabelColor(color).replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let sValue = 0;
    if (max !== min) {
      const d = max - min;
      sValue = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d) + (g < b ? 6 : 0);
          break;
        case g:
          h = ((b - r) / d) + 2;
          break;
        default:
          h = ((r - g) / d) + 4;
          break;
      }
      h *= 60;
    }
    return {
      h: Math.round(h),
      s: Math.round(sValue * 100),
      l: Math.round(l * 100),
    };
  }

  function labelTextColor(bg) {
    const hex = sanitizeLabelColor(bg).replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.66 ? '#0f172a' : '#ffffff';
  }

  function normalizeCustomLabels(labels) {
    return (Array.isArray(labels) ? labels : [])
      .map((item, index) => {
        if (typeof item === 'string') {
          const name = item.trim();
          return name ? { id: `local-${index}-${name}`, name, color: '#1d9bf0' } : null;
        }
        const name = String(item?.name || item?.label_name || '').trim();
        if (!name) return null;
        return {
          id: String(item?.id || item?.labelId || `local-${index}-${name}`).trim(),
          name,
          color: sanitizeLabelColor(item?.color || item?.background_color || '#1d9bf0'),
          sortOrder: Number(item?.sort_order ?? item?.sortOrder ?? index) || index,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (Number(a.sortOrder || 0) - Number(b.sortOrder || 0)) || a.name.localeCompare(b.name))
      .slice(0, 24);
  }

  function loadCustomLabelsFromLocalStorage() {
    try {
      const raw = localStorage.getItem(labelsStorageKey());
      state.customLabels = normalizeCustomLabels(JSON.parse(raw || '[]'));
    } catch {
      state.customLabels = [];
    }
  }

  async function loadCustomLabels() {
    try {
      const data = await apiJson('/api/messages/labels');
      state.customLabels = normalizeCustomLabels(data?.labels || []);
      saveCustomLabels();
    } catch (error) {
      loadCustomLabelsFromLocalStorage();
      if (state.customLabels.length) ensureCustomLabelChips();
    }
  }

  function saveCustomLabels() {
    try { localStorage.setItem(labelsStorageKey(), JSON.stringify(state.customLabels || [])); } catch {}
  }

  function ensureCustomLabelChips() {
    const tabs = $('#msgFilterTabs');
    const addBtn = $('#msgAddLabelBtn');
    if (!tabs || !addBtn) return;
    $$('.msg-custom-label-chip', tabs).forEach((chip) => chip.remove());
    (state.customLabels || []).forEach((label) => {
      const chip = document.createElement('button');
      const bg = sanitizeLabelColor(label.color);
      chip.type = 'button';
      chip.className = 'msg-filter-chip msg-custom-label-chip';
      chip.setAttribute('aria-label', `Email label ${label.name}`);
      chip.dataset.labelId = String(label.id || '');
      chip.style.setProperty('--msg-label-bg', bg);
      chip.style.setProperty('--msg-label-fg', labelTextColor(bg));
      chip.innerHTML = `<i data-feather="tag"></i><span class="msg-filter-text">${escapeHtml(label.name)}</span>`;
      tabs.insertBefore(chip, addBtn);
    });
    hydrateIcons();
  }

  function setLabelModalColor(color, options = {}) {
    const clean = sanitizeLabelColor(color);
    const input = $('#msgLabelColor');
    const preview = $('#msgLabelColorPreview');
    const hexInput = $('#msgLabelHex');
    const hexSwatch = $('#msgLabelHexSwatch');
    const hueSlider = $('#msgLabelHue');
    const saturationSlider = $('#msgLabelSaturation');
    const sliderCard = $('#msgLabelColorSliderCard');
    const hsl = hexToHsl(clean);

    if (input) input.value = clean;
    if (hexInput && options.syncHex !== false) hexInput.value = clean.toUpperCase();
    if (hueSlider && options.syncSliders !== false) hueSlider.value = String(hsl.h);
    if (saturationSlider && options.syncSliders !== false) saturationSlider.value = String(hsl.s);

    const activeHue = Number(hueSlider?.value || hsl.h);
    const activeSaturation = Number(saturationSlider?.value || hsl.s);
    const activeColor = clean;
    const name = String($('#msgLabelName')?.value || '').trim() || 'Label';

    if (preview) {
      preview.textContent = name.slice(0, 24);
      preview.style.setProperty('--msg-label-preview-bg', activeColor);
      preview.style.setProperty('--msg-label-preview-fg', labelTextColor(activeColor));
    }
    if (hexSwatch) hexSwatch.style.setProperty('--msg-label-preview-bg', activeColor);

    [hueSlider, saturationSlider, sliderCard].filter(Boolean).forEach((el) => {
      el.style.setProperty('--msg-label-hue', String(Math.round(activeHue)));
      el.style.setProperty('--msg-label-saturation', `${Math.round(activeSaturation)}%`);
      el.style.setProperty('--msg-label-current', activeColor);
    });
  }

  function updateLabelColorFromSliders() {
    const hue = clampNumber($('#msgLabelHue')?.value, 0, 360);
    const saturation = clampNumber($('#msgLabelSaturation')?.value, 0, 100);
    setLabelModalColor(hslToHex(hue, saturation, 53), { syncSliders: false });
  }

  function updateLabelColorFromHexInput(event) {
    const input = event?.target || $('#msgLabelHex');
    if (!input) return;
    const draft = normalizeHexDraft(input.value);
    input.value = draft.toUpperCase();
    if (/^#[0-9a-f]{6}$/i.test(draft)) {
      setLabelModalColor(draft);
    }
  }

  function resetInvalidLabelHex() {
    const color = sanitizeLabelColor($('#msgLabelColor')?.value || '#1d9bf0');
    setLabelModalColor(color);
  }

  function openLabelModal() {
    const overlay = $('#msgLabelModal');
    if (!overlay) return;
    const input = $('#msgLabelName');
    const err = $('#msgLabelError');
    if (input) input.value = '';
    if (err) err.textContent = '';
    setLabelModalColor('#1d9bf0');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => input?.focus(), 80);
    hydrateIcons();
  }

  function closeLabelModal() {
    const overlay = $('#msgLabelModal');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }

  async function submitCustomLabel(event) {
    event.preventDefault();
    const nameInput = $('#msgLabelName');
    const colorInput = $('#msgLabelColor');
    const createBtn = $('#msgLabelCreate');
    const err = $('#msgLabelError');
    const name = String(nameInput?.value || '').trim();
    const color = sanitizeLabelColor(colorInput?.value || '#1d9bf0');

    if (!name) {
      if (err) err.textContent = 'Please enter the label name.';
      nameInput?.focus();
      return;
    }
    const exists = (state.customLabels || []).some((x) => normalizeSearch(x.name) === normalizeSearch(name));
    if (exists) {
      if (err) err.textContent = 'This label already exists.';
      return;
    }

    setBusy(createBtn, true, 'Creating...');
    if (err) err.textContent = '';
    try {
      let created = null;
      try {
        const data = await apiJson('/api/messages/labels', {
          method: 'POST',
          body: { name, color },
        });
        created = data?.label || null;
      } catch (apiError) {
        if (/exists/i.test(String(apiError?.message || ''))) throw apiError;
        created = { id: `local-${Date.now()}`, name, color, sortOrder: state.customLabels.length };
      }
      state.customLabels = normalizeCustomLabels([...(state.customLabels || []), created]);
      saveCustomLabels();
      ensureCustomLabelChips();
      closeLabelModal();
      toast('Label added.', 'success');
    } catch (error) {
      if (err) err.textContent = error.message || 'Failed to create label.';
    } finally {
      setBusy(createBtn, false);
    }
  }

  function renderFilterTabs() {
    const tabs = $('#msgFilterTabs');
    if (!tabs) return;
    ensureCustomLabelChips();
    const filters = ['all', 'unread', 'groups', 'archived', 'closed'];
    const counts = Object.fromEntries(filters.map((f) => [f, state.chats.filter((chat) => chatMatchesFilter(chat, f)).length]));
    $$('[data-filter]', tabs).forEach((btn) => {
      const filter = btn.dataset.filter || 'all';
      btn.classList.toggle('is-active', filter === state.activeFilter);
      const badge = btn.querySelector('.msg-filter-count') || btn.querySelector('span:last-child');
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
    const isAudio = String(attachment?.mime || '').toLowerCase().startsWith('audio/');
    const typeLabel = isImage ? 'Image attachment' : (isAudio ? 'Audio attachment' : 'File attachment');
    return `
      <a class="msg-attachment-card msg-attachment-card--compact ${isImage ? 'is-image' : ''} ${isAudio ? 'is-audio' : ''}" href="${url}" target="_blank" rel="noopener" title="Open ${name}">
        <span class="msg-attachment-file-row">
          <span class="msg-attachment-icon"><i data-feather="${isImage ? 'image' : (isAudio ? 'mic' : 'paperclip')}"></i></span>
          <span class="msg-attachment-info">
            <strong>${name}</strong>
            <small>${escapeHtml(meta || typeLabel)}</small>
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

  const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  function reactionsSignature(items = []) {
    return (Array.isArray(items) ? items : [])
      .map((item) => `${item.messageId || ''}:${item.emoji || ''}:${item.count || 0}:${item.mine ? '1' : '0'}`)
      .sort()
      .join('|');
  }

  function syncReactions(items = []) {
    const nextSig = reactionsSignature(items);
    const changed = nextSig !== state.reactionsSignature;
    const map = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const id = String(item.messageId || '').trim();
      if (!id) return;
      const list = map.get(id) || [];
      list.push({
        emoji: String(item.emoji || '').trim(),
        count: Number(item.count || 0) || 0,
        mine: !!item.mine,
      });
      map.set(id, list);
    });
    state.reactions = map;
    state.reactionsSignature = nextSig;
    return changed;
  }

  async function loadReactionsForComments(comments = state.comments) {
    const ids = (Array.isArray(comments) ? comments : [])
      .map((c) => String(c?.id || '').trim())
      .filter(Boolean);
    if (!ids.length) return syncReactions([]);
    try {
      const data = await apiJson(`/api/messages/reactions?messageIds=${encodeURIComponent(ids.join(','))}`);
      return syncReactions(data.reactions || []);
    } catch {
      return false;
    }
  }

  function reactionBadgesMarkup(messageId) {
    const list = state.reactions.get(String(messageId || '')) || [];
    const visible = list.filter((item) => item.emoji && item.count > 0);
    if (!visible.length) return '';
    return `<div class="msg-reaction-badges">${visible.map((item) => `
      <button type="button" class="msg-reaction-badge ${item.mine ? 'is-mine' : ''}" data-reaction-message-id="${escapeHtml(messageId)}" data-reaction-emoji="${escapeHtml(item.emoji)}" aria-label="${escapeHtml(item.emoji)} reaction">
        <span>${escapeHtml(item.emoji)}</span><b>${escapeHtml(item.count)}</b>
      </button>
    `).join('')}</div>`;
  }

  function reactionPickerMarkup(messageId) {
    if (String(state.activeReactionMessageId || '') !== String(messageId || '')) return '';
    return `<div class="msg-reaction-picker" data-picker-for="${escapeHtml(messageId)}">
      ${QUICK_REACTIONS.map((emoji) => `<button type="button" data-reaction-message-id="${escapeHtml(messageId)}" data-reaction-emoji="${escapeHtml(emoji)}">${escapeHtml(emoji)}</button>`).join('')}
    </div>`;
  }

  async function setMessageReaction(messageId, emoji) {
    const id = String(messageId || '').trim();
    const cleanEmoji = String(emoji || '').trim();
    if (!id || !cleanEmoji) return;
    try {
      const data = await apiJson('/api/messages/reactions', {
        method: 'POST',
        body: {
          messageId: id,
          chatId: state.selectedChatId || '',
          emoji: cleanEmoji,
        },
      });
      syncReactions(data.reactions || []);
      state.activeReactionMessageId = '';
      renderComments({ scrollToBottom: false });
    } catch (error) {
      toast(error.message || 'Failed to save reaction.', 'error');
    }
  }

  function toggleMessageTime(messageId) {
    const id = String(messageId || '').trim();
    if (!id) return;
    if (state.visibleTimes.has(id)) state.visibleTimes.delete(id);
    else state.visibleTimes.add(id);
    state.activeReactionMessageId = '';
    renderComments({ scrollToBottom: false });
  }

  function openReactionPicker(messageId) {
    const id = String(messageId || '').trim();
    if (!id) return;
    state.activeReactionMessageId = state.activeReactionMessageId === id ? '' : id;
    renderComments({ scrollToBottom: false });
    try { navigator.vibrate?.(18); } catch {}
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
    try { window.__opsRefreshMailUnread?.(); } catch {}
  }

  function presenceNameKey(value) {
    return normalizeSearch(value);
  }

  function presenceEmailKey(value) {
    return normalizeSearch(value);
  }

  function isPresenceCurrentUser(entry) {
    const cur = currentUserKey();
    const email = presenceEmailKey(entry?.email);
    const name = presenceNameKey(entry?.name);
    return (!!cur.email && !!email && cur.email === email) || (!!cur.name && !!name && cur.name === name);
  }

  function rebuildPresenceMaps() {
    state.presenceByName = new Map();
    state.presenceByEmail = new Map();
    for (const entry of state.presenceEntries || []) {
      if (!entry || entry.online === false) continue;
      const name = presenceNameKey(entry.name);
      const email = presenceEmailKey(entry.email);
      if (name) state.presenceByName.set(name, entry);
      if (email) state.presenceByEmail.set(email, entry);
    }
  }

  function syncPresenceEntries(entries) {
    state.presenceEntries = Array.isArray(entries) ? entries : [];
    rebuildPresenceMaps();
    renderTypingIndicator();
  }

  function presenceForMember(member) {
    const email = presenceEmailKey(member?.email);
    const name = presenceNameKey(member?.name);
    return (email && state.presenceByEmail.get(email)) || (name && state.presenceByName.get(name)) || null;
  }

  function isMemberOnline(member) {
    const entry = presenceForMember(member);
    return !!entry && !isPresenceCurrentUser(entry);
  }

  function selectedChatHasOnlineParticipant() {
    const chat = state.selectedChat || {};
    const names = String(chat.participantNames || '')
      .split(/[,;|]+/)
      .map((x) => presenceNameKey(x))
      .filter(Boolean);
    const emails = String(chat.participantEmails || '')
      .split(/[,;|]+/)
      .map((x) => presenceEmailKey(x))
      .filter(Boolean);
    return state.presenceEntries.some((entry) => {
      if (!entry?.online || isPresenceCurrentUser(entry)) return false;
      const n = presenceNameKey(entry.name);
      const e = presenceEmailKey(entry.email);
      return (!!n && names.includes(n)) || (!!e && emails.includes(e));
    });
  }

  function renderTypingIndicator() {
    const el = $('#msgTypingIndicator');
    if (!el) return;
    const chatId = String(state.selectedChatId || '');
    if (!chatId) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    const typing = (state.presenceEntries || [])
      .filter((entry) => entry && entry.online !== false && entry.isTyping && String(entry.activeChatId || '') === chatId && !isPresenceCurrentUser(entry));
    if (!typing.length) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    const names = typing.map((entry) => shortName(entry.name || 'Someone')).slice(0, 2);
    const label = typing.length === 1
      ? `${names[0]} is typing...`
      : `${names.join(', ')}${typing.length > 2 ? ` and ${typing.length - 2} others` : ''} are typing...`;
    el.hidden = false;
    el.innerHTML = `<span class="msg-typing-dots"><i></i><i></i><i></i></span><strong>${escapeHtml(label)}</strong>`;
  }

  async function loadPresence() {
    try {
      const query = state.selectedChatId ? `?chatId=${encodeURIComponent(state.selectedChatId)}` : '';
      const data = await apiJson(`/api/messages/presence${query}`);
      syncPresenceEntries(data.entries || []);
      renderPeopleStrip();
      if (state.selectedChatId) renderSelectedChatShell();
    } catch {
      // Presence is a live enhancement; keep the chat usable if the endpoint/table is not ready.
    }
  }

  async function sendPresence({ isTyping = null } = {}) {
    try {
      const typing = typeof isTyping === 'boolean'
        ? isTyping
        : (Date.now() - Number(state.lastTypingAt || 0) < 3500);
      await apiJson('/api/messages/presence', {
        method: 'POST',
        body: {
          activeChatId: state.selectedChatId || '',
          isTyping: typing,
        },
      });
    } catch {
      // Ignore presence failures.
    }
  }

  function notifyTyping() {
    if (!state.selectedChatId) return;
    state.lastTypingAt = Date.now();
    sendPresence({ isTyping: true });
    if (state.typingStopTimer) clearTimeout(state.typingStopTimer);
    state.typingStopTimer = setTimeout(() => sendPresence({ isTyping: false }), 2200);
  }

  function commentsSignature(comments) {
    return (Array.isArray(comments) ? comments : [])
      .map((c) => `${c.id || ''}:${c.createdTime || ''}:${c.rawText || c.body || ''}`)
      .join('|');
  }

  async function pollSelectedComments() {
    if (!state.selectedChatId) return;
    try {
      const data = await apiJson(`/api/messages/chats/${encodeURIComponent(state.selectedChatId)}/comments`);
      const comments = Array.isArray(data.comments) ? data.comments : [];
      const sig = commentsSignature(comments);
      const commentsChanged = sig !== state.commentsSignature;
      const reactionsChanged = await loadReactionsForComments(comments);
      if (commentsChanged) {
        state.comments = comments;
        state.commentsSignature = sig;
        markChatRead(state.selectedChat);
      }
      if (commentsChanged || reactionsChanged) {
        renderComments({ scrollToBottom: commentsChanged });
        renderFilterTabs();
        renderChatsList();
      }
    } catch {}
  }

  function startRealtimeLoops() {
    stopRealtimeLoops();
    sendPresence({ isTyping: false });
    loadPresence();
    state.heartbeatTimer = setInterval(() => sendPresence(), 8000);
    state.presenceTimer = setInterval(loadPresence, 3500);
    state.chatsTimer = setInterval(() => refreshAll({ keepSelection: true, silent: true }), 10000);
    state.commentsTimer = setInterval(pollSelectedComments, 3000);
  }

  function stopRealtimeLoops() {
    ['heartbeatTimer', 'presenceTimer', 'chatsTimer', 'commentsTimer'].forEach((key) => {
      if (state[key]) {
        clearInterval(state[key]);
        state[key] = null;
      }
    });
  }

  async function refreshAll({ keepSelection = true, silent = false } = {}) {
    const refreshBtn = $('#msgRefreshBtn');
    refreshBtn?.classList.add('is-loading');
    try {
      state.loading = true;
      if (!silent) renderLoading();
      await loadCurrentUser();
      loadReadState();
      await Promise.all([loadMembers(), loadChats()]);
      renderPeopleStrip();
      renderFilterTabs();
      renderChatsList();
      populateNewChatMembers();
      renderGroupMemberPicker();
      if (!silent) await loadPresence();
      if (keepSelection && state.selectedChatId) {
        const stillExists = state.chats.find((c) => c.id === state.selectedChatId);
        if (stillExists) {
          state.selectedChat = stillExists;
          renderSelectedChatShell();
        }
      }
    } catch (error) {
      if (!silent) renderError(error.message || 'Failed to load emails.');
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
        <div class="msg-strip-loading">Loading recipients...</div>
      `;
      bindNewMenu();
    }
    if (list && !state.chats.length) {
      list.innerHTML = `<div class="msg-list-loading"><span></span> Loading inbox...</div>`;
    }
  }

  function renderError(message) {
    const list = $('#msgChatsList');
    const count = $('#msgChatsCount');
    if (count) count.textContent = '0';
    if (list) {
      list.innerHTML = `<div class="msg-empty-list">${escapeHtml(message || 'Could not load emails.')}</div>`;
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
          <button type="button" class="msg-new-choice" id="msgOpenNewChat" aria-label="New email">
            <span><i data-feather="mail"></i></span>
            <strong>New Email</strong>
          </button>
          <button type="button" class="msg-new-choice" id="msgOpenNewGroup" aria-label="New team thread">
            <span><i data-feather="users"></i></span>
            <strong>Team Thread</strong>
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

  function setFloatingNewMenu(open) {
    state.floatingNewMenuOpen = !!open;
    const menu = $('#msgFloatingNewMenu');
    const btn = $('#msgFloatingNewBtn');
    const wrap = $('#msgFloatingNewWrap');
    if (menu) menu.hidden = !state.floatingNewMenuOpen;
    if (btn) btn.setAttribute('aria-expanded', state.floatingNewMenuOpen ? 'true' : 'false');
    if (wrap) wrap.classList.toggle('is-open', state.floatingNewMenuOpen);
    hydrateIcons();
  }

  function bindFloatingNewMenu() {
    $('#msgFloatingNewBtn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      setFloatingNewMenu(!state.floatingNewMenuOpen);
    });
    $('#msgFloatingOpenNewChat')?.addEventListener('click', (event) => {
      event.stopPropagation();
      setFloatingNewMenu(false);
      openNewChatModal('chat');
    });
    $('#msgFloatingOpenNewGroup')?.addEventListener('click', (event) => {
      event.stopPropagation();
      setFloatingNewMenu(false);
      openNewChatModal('group');
    });
  }

  function transformEmailShortcutToHome() {
    // Keep the normal Emails shortcut on the Emails page.
    // Older redesign iterations converted it into Home and hid the sidebar; this is intentionally disabled.
    return false;
  }

  function initEmailPageChrome() {
    return false;
  }

  function renderPeopleStrip() {
    const el = $('#msgPeopleStrip');
    if (!el) return;
    const q = state.query.trim().toLowerCase();
    const members = selectableMembers()
      .filter((m) => !q || [m.name, m.position, m.department, m.email, m.phone].some((x) => String(x || '').toLowerCase().includes(q)))
      .slice(0, 30);

    const rows = members.map((m) => {
      const avatarInner = m.photoUrl
        ? `<span class="msg-person-avatar"><img src="${escapeHtml(m.photoUrl)}" alt="${escapeHtml(m.name || 'User')}" /></span>`
        : `<span class="msg-person-avatar">${escapeHtml(initials(m.name))}</span>`;
      const online = isMemberOnline(m);
      const avatar = `<span class="msg-person-avatar-wrap ${online ? 'is-online' : ''}">${avatarInner}${online ? '<span class="msg-online-dot" aria-label="Online"></span>' : ''}</span>`;
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
      ${rows || '<div class="msg-strip-loading">No recipients found</div>'}
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
      all: 'Inbox',
      unread: 'Unread emails',
      groups: 'Team threads',
      archived: 'Archived emails',
      closed: 'Closed emails',
    };

    if (title) title.textContent = labels[state.activeFilter] || 'Recent chats';
    if (count) count.textContent = String(chats.length);
    renderFilterTabs();

    if (!chats.length) {
      const emptyMessages = {
        all: 'No emails found.',
        unread: 'No unread emails.',
        groups: 'No team threads yet.',
        archived: 'No archived emails.',
        closed: 'No closed emails.',
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
          <span class="msg-chat-avatar-wrap">
            <span class="msg-chat-avatar">${escapeHtml(initials(chat.title))}</span>
            ${unread ? '<span class="msg-unread-dot" aria-label="Unread"></span>' : ''}
          </span>
          <span class="msg-chat-main">
            <span class="msg-chat-title-wrap">
              <span class="msg-chat-title">${escapeHtml(chat.title || 'Email')}</span>
            </span>
            <span class="msg-chat-preview">${escapeHtml(chat.preview || 'No replies yet')}</span>
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
      state.commentsSignature = commentsSignature(state.comments);
      await loadReactionsForComments(state.comments);
      markChatRead(state.selectedChat);
      renderChatsList();
      renderComments();
      sendPresence({ isTyping: false });
      loadPresence();
    } catch (error) {
      if (commentsEl) commentsEl.innerHTML = `<div class="msg-empty-list">${escapeHtml(error.message || 'Could not load emails.')}</div>`;
    }
  }

  function closeActiveChat() {
    state.selectedChatId = '';
    state.selectedChat = null;
    state.comments = [];
    state.commentsSignature = '';
    state.reactions = new Map();
    state.reactionsSignature = '';
    state.visibleTimes = new Set();
    state.activeReactionMessageId = '';
    sendPresence({ isTyping: false });
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
    const title = chat.title || 'Email';
    const titleEl = $('#msgConvTitle');
    const subEl = $('#msgConvSubtitle');
    const avEl = $('#msgConvAvatar');
    const notionLink = $('#msgOpenNotion');
    const participants = String(chat.participantNames || '').trim();
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = participants || `${Number(chat.commentsCount || 0)} repl${Number(chat.commentsCount || 0) === 1 ? 'y' : 'ies'}`;
    if (avEl) {
      avEl.textContent = initials(title);
      avEl.classList.toggle('is-online', selectedChatHasOnlineParticipant());
    }
    renderTypingIndicator();
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

  function renderComments({ scrollToBottom = true } = {}) {
    const el = $('#msgComments');
    if (!el) return;
    state.commentsSignature = commentsSignature(state.comments);
    state.visibleTimes = new Set(Array.from(state.visibleTimes || []).filter((id) => (state.comments || []).some((c) => String(c.id || '') === String(id))));
    if (!state.comments.length) {
      el.innerHTML = `<div class="msg-empty-list">No replies yet.</div>`;
      return;
    }

    let previousDateKey = '';
    const blocks = [];
    (state.comments || []).forEach((c) => {
      const created = c.createdTime || c.created_at || '';
      const key = dateKey(created);
      if (key && key !== previousDateKey) {
        previousDateKey = key;
        blocks.push(`
          <div class="msg-date-divider" data-date-key="${escapeHtml(key)}">
            <span>${escapeHtml(formatDateDivider(created))}</span>
          </div>
        `);
      }

      if (c.isSystem || String(c.messageType || '').toLowerCase() === 'system') {
        blocks.push(`
          <div class="msg-system-row">
            <span>${escapeHtml(c.body || c.rawText || '')}</span>
          </div>
        `);
        return;
      }

      const messageId = String(c.id || '');
      const attachment = c.attachment || parseAttachment(c.body || c.rawText || '');
      const bodyHtml = attachment ? attachmentMarkup(attachment) : formatMessageText(c.body || c.rawText || '');
      const timeText = formatMessageTime(created) || c.createdTimeText || '';
      const showTime = state.visibleTimes.has(messageId);
      const senderHtml = c.isMine ? '' : `<div class="msg-bubble-sender">${escapeHtml(c.sender || 'User')}</div>`;
      const messageLabel = c.isMine ? 'you' : (c.sender || 'User');
      blocks.push(`
        <div class="msg-bubble-row ${c.isMine ? 'is-mine' : ''}" data-message-row-id="${escapeHtml(messageId)}">
          <div class="msg-bubble ${attachment ? 'has-attachment' : ''} ${showTime ? 'is-time-visible' : ''}" data-message-id="${escapeHtml(messageId)}" tabindex="0" role="button" aria-label="Message from ${escapeHtml(messageLabel)}">
            ${reactionPickerMarkup(messageId)}
            ${senderHtml}
            <div class="msg-bubble-body">${bodyHtml}</div>
            <div class="msg-bubble-time">${escapeHtml(timeText)}</div>
            ${reactionBadgesMarkup(messageId)}
          </div>
        </div>
      `);
    });

    el.innerHTML = blocks.join('');
    bindCommentInteractions(el);
    hydrateIcons();
    if (scrollToBottom) {
      requestAnimationFrame(() => {
        try { el.scrollTop = el.scrollHeight; } catch {}
      });
    }
  }

  function bindCommentInteractions(root) {
    const bubbles = $$('.msg-bubble[data-message-id]', root);
    bubbles.forEach((bubble) => {
      let pressTimer = null;
      const messageId = bubble.dataset.messageId || '';
      const cancelPress = () => {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
      };
      bubble.addEventListener('pointerdown', (event) => {
        if (event.target.closest('a, audio, button, .msg-reaction-picker, .msg-reaction-badges')) return;
        state.longPressFired = false;
        cancelPress();
        pressTimer = setTimeout(() => {
          state.longPressFired = true;
          openReactionPicker(messageId);
        }, 560);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => {
        bubble.addEventListener(type, cancelPress);
      });
      bubble.addEventListener('click', (event) => {
        if (event.target.closest('a, audio, button, .msg-reaction-picker, .msg-reaction-badges')) return;
        if (state.longPressFired) {
          state.longPressFired = false;
          event.preventDefault();
          return;
        }
        toggleMessageTime(messageId);
      });
      bubble.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleMessageTime(messageId);
        }
      });
    });

    $$('[data-reaction-message-id][data-reaction-emoji]', root).forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setMessageReaction(btn.dataset.reactionMessageId || '', btn.dataset.reactionEmoji || '');
      });
    });
  }

  function updateChatAfterComment(comment, fallbackPreview = '') {
    if (!comment || !state.selectedChatId) return;
    const preview = comment.attachment
      ? `${String(comment.attachment.mime || '').toLowerCase().startsWith('audio/') ? '🎙️' : '📎'} ${comment.attachment.name || 'Attachment'}`
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
      updateChatAfterComment(data.comment, `${String(attachment.mime || '').toLowerCase().startsWith('audio/') ? '🎙️' : '📎'} ${attachment.name || 'Attachment'}`);
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
    const isAudio = String(item.mime || '').toLowerCase().startsWith('audio/');
    const thumbnail = isImage && item.previewUrl
      ? `<span class="msg-draft-thumb is-image"><img src="${escapeHtml(item.previewUrl)}" alt="${escapeHtml(item.name || 'Attachment')}" /></span>`
      : `<span class="msg-draft-thumb ${isAudio ? 'is-audio' : ''}"><i data-feather="${isAudio ? 'mic' : 'paperclip'}"></i></span>`;
    const statusText = isUploading ? 'Uploading...' : (isPreparing ? 'Preparing preview...' : 'Ready to send');
    box.hidden = false;
    box.innerHTML = `
      <div class="msg-draft-card ${isPreparing || isUploading ? 'is-loading' : ''}">
        ${thumbnail}
        <span class="msg-draft-info">
          <strong>${escapeHtml(item.name || 'Attachment')}</strong>
          <small>${escapeHtml([item.mime, humanFileSize(item.size), statusText].filter(Boolean).join(' • '))}</small>
          ${isAudio && item.previewUrl ? `<audio class="msg-draft-audio" src="${escapeHtml(item.previewUrl)}" controls preload="metadata"></audio>` : ''}
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
      toast('Please select an email thread first.', 'error');
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
      toast('Attachment selected. Press Send to attach it to the reply.', 'success');
    } catch (error) {
      clearPendingAttachment();
      toast(error.message || 'Failed to read attachment.', 'error');
    }
  }

  function updateVoiceButton() {
    const btn = $('#msgVoiceBtn');
    if (!btn) return;
    btn.classList.toggle('is-recording', !!state.isRecording);
    const label = btn.querySelector('span');
    if (label) label.textContent = state.isRecording ? 'Stop' : 'Voice';
    const icon = btn.querySelector('i');
    if (icon) icon.setAttribute('data-feather', state.isRecording ? 'square' : 'mic');
    hydrateIcons();
  }

  function stopMediaStream() {
    try {
      (state.mediaStream?.getTracks?.() || []).forEach((track) => track.stop());
    } catch {}
    state.mediaStream = null;
  }

  async function startVoiceRecording() {
    if (!state.selectedChatId) {
      toast('Please select an email thread first.', 'error');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('Voice recording is not supported in this browser.', 'error');
      return;
    }
    clearPendingAttachment();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => {
        try { return MediaRecorder.isTypeSupported(type); } catch { return false; }
      }) || '';
      const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined);
      state.mediaStream = stream;
      state.mediaRecorder = recorder;
      state.voiceChunks = [];
      state.isRecording = true;
      state.recordStartedAt = Date.now();
      updateVoiceButton();
      toast('Recording voice note...', 'info');
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) state.voiceChunks.push(event.data);
      });
      recorder.addEventListener('stop', async () => {
        const chunks = state.voiceChunks || [];
        const mime = recorder.mimeType || preferredMime || 'audio/webm';
        const blob = new Blob(chunks, { type: mime });
        const durationMs = Math.max(0, Date.now() - Number(state.recordStartedAt || Date.now()));
        state.mediaRecorder = null;
        state.voiceChunks = [];
        state.isRecording = false;
        updateVoiceButton();
        stopMediaStream();
        if (!blob.size) {
          toast('No voice audio was recorded.', 'error');
          return;
        }
        const ext = mime.includes('mp4') ? 'm4a' : 'webm';
        const previewUrl = URL.createObjectURL(blob);
        state.pendingAttachment = {
          file: null,
          name: `voice-message-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`,
          mime,
          size: blob.size,
          previewUrl,
          dataUrl: '',
          status: 'reading',
          isVoice: true,
          durationMs,
        };
        renderAttachmentDraft();
        try {
          state.pendingAttachment.dataUrl = await readFileAsDataUrl(blob);
          state.pendingAttachment.status = 'ready';
          renderAttachmentDraft();
          toast('Voice note ready. Press Send to attach it to the reply.', 'success');
        } catch (error) {
          clearPendingAttachment();
          toast(error.message || 'Failed to prepare voice message.', 'error');
        }
      });
      recorder.start();
    } catch (error) {
      state.isRecording = false;
      updateVoiceButton();
      stopMediaStream();
      toast(error?.message || 'Microphone permission was denied.', 'error');
    }
  }

  function stopVoiceRecording() {
    try {
      if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') state.mediaRecorder.stop();
      else {
        state.isRecording = false;
        updateVoiceButton();
        stopMediaStream();
      }
    } catch (error) {
      state.isRecording = false;
      updateVoiceButton();
      stopMediaStream();
      toast(error.message || 'Failed to stop recording.', 'error');
    }
  }

  function toggleVoiceRecording() {
    if (state.isRecording) stopVoiceRecording();
    else startVoiceRecording();
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
      state.lastTypingAt = 0;
      sendPresence({ isTyping: false });
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
    if (title) title.textContent = isGroup ? 'New Team Thread' : 'New Email';
    if (subtitle) subtitle.textContent = isGroup ? 'Choose a subject and the recipients for this team email thread.' : 'Choose a subject and the recipient for this internal email.';
    if (icon) icon.innerHTML = `<i data-feather="${isGroup ? 'users' : 'mail'}"></i>`;
    if (singleField) singleField.hidden = isGroup;
    if (groupField) groupField.hidden = !isGroup;
    if (submitLabel) submitLabel.textContent = isGroup ? 'Create Thread' : 'Send Email';
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
    state.commentsSignature = commentsSignature(state.comments);
    await loadReactionsForComments(state.comments);
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
        if (err) err.textContent = 'Please select at least one recipient.';
        return;
      }
      body = { ...body, type: 'group', targetUserIds: ids };
    } else {
      const member = state.members.find((m) => m.id === select?.value) || null;
      if (!member) {
        if (err) err.textContent = 'Please select a recipient.';
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
      if (err) err.textContent = error.message || 'Failed to create email thread.';
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
    $('#msgComposerInput')?.addEventListener('input', (event) => {
      updateMentionSuggestions(event);
      notifyTyping();
    });
    $('#msgComposerInput')?.addEventListener('keydown', handleMentionKeydown);
    $('#msgComposerInput')?.addEventListener('blur', () => setTimeout(closeMentionMenu, 160));
    $('#msgBackMobile')?.addEventListener('click', closeActiveChat);
    $('#msgAddLabelBtn')?.addEventListener('click', openLabelModal);
    $('#msgLabelForm')?.addEventListener('submit', submitCustomLabel);
    $('#msgLabelClose')?.addEventListener('click', closeLabelModal);
    $('#msgLabelCancel')?.addEventListener('click', closeLabelModal);
    $('#msgLabelModal')?.addEventListener('click', (e) => {
      if (e.target === $('#msgLabelModal')) closeLabelModal();
    });
    $('#msgLabelHue')?.addEventListener('input', updateLabelColorFromSliders);
    $('#msgLabelSaturation')?.addEventListener('input', updateLabelColorFromSliders);
    $('#msgLabelHex')?.addEventListener('input', updateLabelColorFromHexInput);
    $('#msgLabelHex')?.addEventListener('blur', resetInvalidLabelHex);
    $('#msgLabelName')?.addEventListener('input', () => setLabelModalColor($('#msgLabelColor')?.value, { syncSliders: false, syncHex: false }));
    bindFloatingNewMenu();

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
      if (state.newMenuOpen && !e.target.closest('.msg-new-menu-wrap')) setNewMenu(false);
      if (state.floatingNewMenuOpen && !e.target.closest('#msgFloatingNewWrap')) setFloatingNewMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('#msgNewChatModal')?.hidden) closeNewChatModal();
        closeMentionMenu();
        setNewMenu(false);
        setFloatingNewMenu(false);
      }
    });
    window.addEventListener('beforeunload', () => {
      try { if (state.isRecording) stopVoiceRecording(); } catch {}
      try {
        const payload = JSON.stringify({ activeChatId: '', isTyping: false, offline: true });
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon?.('/api/messages/presence', blob);
      } catch {}
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    initEmailPageChrome();
    bindEvents();
    await refreshAll({ keepSelection: false });
    await loadCustomLabels();
    renderFilterTabs();
    startRealtimeLoops();
  });
})();
