// Shared no-data empty state helper used by all pages.
(function initOpsNoDataHelper() {
  const DEFAULT_TEXT = 'Sorry, No data available';
  const IMAGE_SRC = '/images/no-data-illustration.png';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function html(options = {}) {
    const text = options.text || DEFAULT_TEXT;
    const compact = options.compact ? ' ops-no-data-state--compact' : '';
    const className = options.className ? ` ${String(options.className).trim()}` : '';
    return `
      <div class="ops-no-data-state${compact}${className}" role="status" aria-live="polite">
        <img class="ops-no-data-state__image" src="${IMAGE_SRC}" alt="" loading="lazy">
        <div class="ops-no-data-state__text">${escapeHtml(text)}</div>
      </div>
    `;
  }

  function set(target, options = {}) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    el.innerHTML = html(options);
  }

  window.OpsNoData = { html, set, DEFAULT_TEXT, IMAGE_SRC };
})();

// Hide internal provider/configuration wording from all user-facing browser messages.
(function initOpsSafeMessageHelper() {
  const INTERNAL_RE = /(notion|supabase|database\s*id|database\s*ids|team_members|products_database|school_stocktaking_db_id|vercel|environment\s+variables?|service_role|api\s*key|schema\s+cache|migration|rpc|rest|sql|helper\s+function|table\s+is\s+not\s+configured|source\s+is\s+required|data\s+source\s+is\s+not\s+configured)/i;

  function fallbackForText(text) {
    const value = String(text || '').toLowerCase();
    if (value.includes('login') || value.includes('password') || value.includes('team_members')) return 'Invalid username or password.';
    if (value.includes('stock')) return 'Failed to load stock data. Please try again.';
    if (value.includes('school') || value.includes('b2b')) return 'Failed to load school data. Please try again.';
    if (value.includes('expense')) return 'Failed to load expenses. Please try again.';
    if (value.includes('order')) return 'Failed to load orders. Please try again.';
    if (value.includes('task')) return 'Failed to load tasks. Please try again.';
    if (value.includes('message') || value.includes('mail')) return 'Failed to load messages. Please try again.';
    if (value.includes('product') || value.includes('proposal') || value.includes('kit')) return 'Failed to load product data. Please try again.';
    return 'Something went wrong. Please try again.';
  }

  function sanitize(text) {
    const value = String(text ?? '').trim();
    if (!value) return value;
    if (INTERNAL_RE.test(value)) return fallbackForText(value);
    return value;
  }

  window.OpsSafeMessage = { sanitize };

  const nativeAlert = window.alert ? window.alert.bind(window) : null;
  if (nativeAlert && !window.__opsAlertSanitized) {
    window.__opsAlertSanitized = true;
    window.alert = function patchedAlert(message) {
      return nativeAlert(sanitize(message));
    };
  }
})();



// Shared delete confirmation used by every page.
// It replaces vague Yes/No prompts with an explicit, accessible destructive-action message.
(function initOpsDeleteConfirm() {
  if (window.OpsDeleteConfirm) return;

  let overlay = null;
  let resolver = null;
  let lastFocus = null;
  let keyHandler = null;

  function ensureStyles() {
    if (document.getElementById('opsDeleteConfirmStyles')) return;
    const style = document.createElement('style');
    style.id = 'opsDeleteConfirmStyles';
    style.textContent = `
      .ops-delete-confirm[hidden]{display:none!important}
      .ops-delete-confirm{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:22px;font-family:inherit}
      .ops-delete-confirm__backdrop{position:absolute;inset:0;background:rgba(12,15,20,.56);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)}
      .ops-delete-confirm__card{position:relative;z-index:1;width:min(460px,100%);padding:32px 30px 28px;border:1px solid rgba(15,23,42,.08);border-radius:26px;background:#fff;box-shadow:0 34px 100px rgba(0,0,0,.28);text-align:center;animation:opsDeleteConfirmIn .2s ease-out}
      .ops-delete-confirm__icon{width:62px;height:62px;margin:0 auto 17px;display:grid;place-items:center;border-radius:20px;background:#fff2f1;color:#e32d26;box-shadow:inset 0 0 0 1px #ffd5d1}
      .ops-delete-confirm__icon svg{width:34px;height:34px;fill:none;stroke:currentColor;stroke-width:2.25;stroke-linecap:round;stroke-linejoin:round}
      .ops-delete-confirm[data-variant=archive] .ops-delete-confirm__icon{background:#fff7ed;color:#d97706;box-shadow:inset 0 0 0 1px #fed7aa}
      .ops-delete-confirm[data-variant=restore] .ops-delete-confirm__icon{background:#ecfdf5;color:#059669;box-shadow:inset 0 0 0 1px #a7f3d0}
      .ops-delete-confirm__card h2{margin:0;color:#17191e;font-size:25px;line-height:1.2;letter-spacing:-.025em;font-weight:900}
      .ops-delete-confirm__card p{max-width:370px;margin:12px auto 0;color:#626a76;font-size:14px;line-height:1.62;font-weight:550}
      .ops-delete-confirm__actions{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:25px}
      .ops-delete-confirm__button{min-height:50px;border:0;border-radius:14px;padding:12px 16px;font:inherit;font-size:14px;font-weight:850;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,background .16s ease}
      .ops-delete-confirm__button:focus-visible{outline:3px solid rgba(227,45,38,.22);outline-offset:3px}
      .ops-delete-confirm__button--cancel{background:#f0f1f3;color:#2d333c}
      .ops-delete-confirm__button--cancel:hover{background:#e6e8eb;transform:translateY(-1px)}
      .ops-delete-confirm__button--delete{background:linear-gradient(180deg,#ff3a31,#ef2119);color:#fff;box-shadow:0 10px 22px rgba(239,33,25,.3),inset 0 1px 0 rgba(255,255,255,.28)}
      .ops-delete-confirm__button--delete:hover{transform:translateY(-1px);box-shadow:0 14px 28px rgba(239,33,25,.38),inset 0 1px 0 rgba(255,255,255,.28)}
      .ops-delete-confirm[data-variant=archive] .ops-delete-confirm__button--delete{background:linear-gradient(180deg,#f59e0b,#d97706);box-shadow:0 10px 22px rgba(217,119,6,.28),inset 0 1px 0 rgba(255,255,255,.28)}
      .ops-delete-confirm[data-variant=archive] .ops-delete-confirm__button--delete:hover{box-shadow:0 14px 28px rgba(217,119,6,.35),inset 0 1px 0 rgba(255,255,255,.28)}
      .ops-delete-confirm[data-variant=restore] .ops-delete-confirm__button--delete{background:linear-gradient(180deg,#10b981,#059669);box-shadow:0 10px 22px rgba(5,150,105,.28),inset 0 1px 0 rgba(255,255,255,.28)}
      .ops-delete-confirm[data-variant=restore] .ops-delete-confirm__button--delete:hover{box-shadow:0 14px 28px rgba(5,150,105,.35),inset 0 1px 0 rgba(255,255,255,.28)}
      .ops-delete-confirm__button:disabled{opacity:.62;cursor:not-allowed;transform:none!important}
      body.ops-delete-confirm-open{overflow:hidden!important}
      @keyframes opsDeleteConfirmIn{from{opacity:0;transform:translateY(12px) scale(.975)}to{opacity:1;transform:none}}
      @media(max-width:520px){.ops-delete-confirm{padding:16px}.ops-delete-confirm__card{padding:27px 20px 21px;border-radius:22px}.ops-delete-confirm__actions{grid-template-columns:1fr}.ops-delete-confirm__button--delete{grid-row:1}.ops-delete-confirm__button--cancel{grid-row:2}}
      @media(prefers-reduced-motion:reduce){.ops-delete-confirm__card{animation:none}.ops-delete-confirm__button{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    ensureStyles();
    if (overlay?.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'ops-delete-confirm';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="ops-delete-confirm__backdrop" data-ops-delete-cancel></div>
      <section class="ops-delete-confirm__card" role="alertdialog" aria-modal="true" aria-labelledby="opsDeleteConfirmTitle" aria-describedby="opsDeleteConfirmMessage">
        <div class="ops-delete-confirm__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M10.3 3.7 2.7 17a2 2 0 0 0 1.74 3h15.12A2 2 0 0 0 21.3 17L13.7 3.7a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
        </div>
        <h2 id="opsDeleteConfirmTitle">Delete item?</h2>
        <p id="opsDeleteConfirmMessage">This action permanently removes the selected item and cannot be undone.</p>
        <div class="ops-delete-confirm__actions">
          <button type="button" class="ops-delete-confirm__button ops-delete-confirm__button--cancel" data-ops-delete-cancel>No, keep it.</button>
          <button type="button" class="ops-delete-confirm__button ops-delete-confirm__button--delete" data-ops-delete-confirm>Yes, Delete!</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => {
      if (event.target.closest('[data-ops-delete-confirm]')) finish(true);
      else if (event.target.closest('[data-ops-delete-cancel]')) finish(false);
    });
    return overlay;
  }

  function finish(answer) {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ops-delete-confirm-open');
    if (keyHandler) document.removeEventListener('keydown', keyHandler, true);
    keyHandler = null;
    const resolve = resolver;
    resolver = null;
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus({ preventScroll: true }); } catch { try { lastFocus.focus(); } catch {} }
    }
    lastFocus = null;
    if (resolve) resolve(!!answer);
  }

  function confirm(options = {}) {
    const modal = ensureOverlay();
    if (resolver) finish(false);
    lastFocus = document.activeElement;

    const itemName = String(options.itemName || options.name || '').trim();
    const itemType = String(options.itemType || options.entity || 'item').trim();
    const defaultTitle = `Delete ${itemType}?`;
    const defaultMessage = itemName
      ? `You’re going to permanently delete “${itemName}”. This action cannot be undone.`
      : `You’re going to permanently delete this ${itemType}. This action cannot be undone.`;

    const variant = ['delete', 'archive', 'restore'].includes(String(options.variant || '').toLowerCase())
      ? String(options.variant).toLowerCase()
      : 'delete';
    modal.dataset.variant = variant;
    const icon = modal.querySelector('.ops-delete-confirm__icon');
    if (icon) {
      icon.innerHTML = variant === 'archive'
        ? '<svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M5 7l1 13h12l1-13"></path><path d="M9 11h6"></path><path d="M8 4h8l1 3H7l1-3Z"></path></svg>'
        : variant === 'restore'
          ? '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l3 2"></path></svg>'
          : '<svg viewBox="0 0 24 24"><path d="M10.3 3.7 2.7 17a2 2 0 0 0 1.74 3h15.12A2 2 0 0 0 21.3 17L13.7 3.7a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>';
    }
    modal.querySelector('#opsDeleteConfirmTitle').textContent = String(options.title || defaultTitle);
    modal.querySelector('#opsDeleteConfirmMessage').textContent = String(options.message || defaultMessage);
    modal.querySelector('button[data-ops-delete-cancel]').textContent = String(options.cancelLabel || 'No, keep it.');
    modal.querySelector('button[data-ops-delete-confirm]').textContent = String(options.confirmLabel || 'Yes, Delete!');
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ops-delete-confirm-open');

    return new Promise((resolve) => {
      resolver = resolve;
      keyHandler = (event) => {
        if (event.key === 'Escape') { event.preventDefault(); finish(false); return; }
        if (event.key !== 'Tab') return;
        const buttons = [...modal.querySelectorAll('button:not(:disabled)')];
        if (!buttons.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      };
      document.addEventListener('keydown', keyHandler, true);
      window.requestAnimationFrame(() => modal.querySelector('button[data-ops-delete-cancel]')?.focus());
    });
  }

  window.OpsDeleteConfirm = { confirm, open: confirm, close: () => finish(false) };
  window.confirmDelete = confirm;
})();

// Global Arabic/LTR auto-direction helper.
// Text fields and generated text that starts with Arabic should align from the right;
// English/Latin text remains left aligned. This keeps the UI LTR while making Arabic input natural.
(function initOpsAutoDirectionHelper() {
  const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const STRONG_RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  const STRONG_LTR_RE = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;

  function firstStrongDirection(value) {
    const text = String(value || '');
    for (const ch of text) {
      if (STRONG_RTL_RE.test(ch)) return 'rtl';
      if (STRONG_LTR_RE.test(ch)) return 'ltr';
    }
    return ARABIC_RE.test(text) ? 'rtl' : 'ltr';
  }

  function shouldSkipField(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'textarea') return false;
    if (el.isContentEditable) return false;
    if (tag !== 'input') return true;
    const type = String(el.getAttribute('type') || 'text').toLowerCase();
    return !['text', 'search', 'tel', 'url'].includes(type);
  }

  const BIDI_CONTROL_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
  const LTR_TOKEN_RE = /[A-Za-z0-9£$€][A-Za-z0-9._%+@:;\/\\#&=,\-+()[\]{}£$€]*/g;
  const RTL_TOKEN_RE = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]+/g;

  function containsArabic(value) {
    return ARABIC_RE.test(String(value || ''));
  }

  function containsLatin(value) {
    return STRONG_LTR_RE.test(String(value || ''));
  }

  function stripBidiControls(value) {
    return String(value ?? '').replace(BIDI_CONTROL_RE, '');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMixedBidiHtml(value) {
    const raw = stripBidiControls(value);
    if (!raw || !containsArabic(raw)) return escapeHtml(raw);

    const dir = firstStrongDirection(raw);
    const tokenRe = new RegExp(`${LTR_TOKEN_RE.source}|${RTL_TOKEN_RE.source}`, 'g');
    let out = '';
    let last = 0;
    for (const match of raw.matchAll(tokenRe)) {
      const idx = match.index ?? 0;
      const token = match[0] || '';
      if (idx > last) out += escapeHtml(raw.slice(last, idx));
      const tokenDir = STRONG_LTR_RE.test(token) ? 'ltr' : (containsArabic(token) ? 'rtl' : 'auto');
      out += `<bdi class="ops-bidi-run" dir="${tokenDir}">${escapeHtml(token)}</bdi>`;
      last = idx + token.length;
    }
    if (last < raw.length) out += escapeHtml(raw.slice(last));
    return `<bdi class="ops-bidi-wrap" dir="${dir}">${out}</bdi>`;
  }

  function setDirection(el, text, options = {}) {
    if (!el) return;
    const raw = stripBidiControls(text ?? '');
    const dir = raw.trim() ? firstStrongDirection(raw) : '';
    if (!dir) {
      el.removeAttribute('dir');
      el.classList.remove('ops-auto-dir-rtl', 'ops-auto-dir-ltr', 'ops-bidi-text');
      return;
    }
    el.setAttribute('dir', dir);
    el.classList.toggle('ops-auto-dir-rtl', dir === 'rtl');
    el.classList.toggle('ops-auto-dir-ltr', dir !== 'rtl');
    if (containsArabic(raw)) el.classList.add('ops-bidi-text');
    else el.classList.remove('ops-bidi-text');
    if (options.forceTextAlign !== false) {
      el.style.textAlign = dir === 'rtl' ? 'right' : 'left';
    }
  }

  function syncField(el) {
    if (shouldSkipField(el)) return;
    const value = el.isContentEditable ? el.textContent : el.value;
    setDirection(el, value || '', { forceTextAlign: true });
  }

  function bindField(el) {
    if (!el || el.__opsAutoDirBound || shouldSkipField(el)) return;
    el.__opsAutoDirBound = true;
    syncField(el);
    el.addEventListener('input', () => syncField(el));
    el.addEventListener('change', () => syncField(el));
  }

  const TEXT_BLOCK_SELECTOR = [
    '[data-ops-bidi]', '[data-auto-dir]', '[dir="auto"]',
    '.co-title', '.co-sub', '.co-createdby', '.co-modal-status', '.co-modal-status-sub',
    '.co-modal-value', '.co-meta-row strong', '.co-item-title', '.co-item-name', '.co-item-sub',
    '.co-item-issue', '.co-item-issue-desc', '.co-item-total', '.co-est-value',
    '.order-title', '.order-card-title', '.order-card-subtitle', '.order-item__left .name', '.order-item__left .muted',
    '.msg-title', '.msg-preview', '.chat-title', '.chat-preview', '.email-title', '.email-preview',
    '.expense-ticket__route-title', '.expense-ticket__route-endpoint', '.expense-reason',
    '.product-card__title', '.product-card__meta', '.proposal-title', '.proposal-meta',
    '.task-card__title', '.task-card__description', '.task-title', '.task-desc',
    '.stocktaking-cell', '.stock-card-title', '.stock-card-meta',
    '.profile-popover__value', '.profile-popover__name', '.profile-popover__meta',
    '.ops-no-data-state__text'
  ].join(',');

  function hasNonBidiChildren(el) {
    return Array.from(el?.children || []).some((child) => {
      return !child.classList?.contains('ops-bidi-wrap') && !child.classList?.contains('ops-bidi-run');
    });
  }

  function syncTextBlock(el) {
    if (!el || hasNonBidiChildren(el)) return;
    const text = stripBidiControls(String(el.textContent || '')).trim();
    if (!text) return;
    setDirection(el, text, { forceTextAlign: true });
    if (containsArabic(text) && containsLatin(text)) {
      const formatted = formatMixedBidiHtml(text);
      if (el.innerHTML !== formatted) el.innerHTML = formatted;
    }
  }

  function apply(root = document) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('input, textarea, [contenteditable="true"]').forEach(bindField);
    root.querySelectorAll(TEXT_BLOCK_SELECTOR).forEach(syncTextBlock);
  }

  function start() {
    apply(document);

    // Heavy pages (orders/expenses/stock) can render hundreds of nodes at once.
    // Running the full direction scan synchronously for every MutationObserver
    // record can lock the browser when the user clicks quickly between views.
    // Batch the work into one small idle/frame task instead.
    const pendingRoots = new Set();
    const pendingTextBlocks = new Set();
    let scheduled = false;

    function scheduleFlush() {
      if (scheduled) return;
      scheduled = true;
      const run = () => {
        scheduled = false;
        const roots = Array.from(pendingRoots).slice(0, 80);
        const textBlocks = Array.from(pendingTextBlocks).slice(0, 160);
        roots.forEach((root) => pendingRoots.delete(root));
        textBlocks.forEach((el) => pendingTextBlocks.delete(el));

        for (const el of textBlocks) {
          try { if (el?.isConnected) syncTextBlock(el); } catch {}
        }
        for (const root of roots) {
          try { if (root?.isConnected) apply(root); } catch {}
        }

        // If a very large render produced more than one batch, continue without
        // blocking input for a long continuous stretch.
        if (pendingRoots.size || pendingTextBlocks.size) scheduleFlush();
      };

      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 180 });
      } else if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(run);
      } else {
        window.setTimeout(run, 50);
      }
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) {
          if (node && node.nodeType === 1) {
            if (node.matches?.('input, textarea, [contenteditable="true"]')) {
              try { bindField(node); } catch {}
            }
            if (node.matches?.(TEXT_BLOCK_SELECTOR)) pendingTextBlocks.add(node);
            pendingRoots.add(node);
          }
        }
        if (mutation.type === 'characterData') {
          const parent = mutation.target?.parentElement;
          if (parent?.matches?.(TEXT_BLOCK_SELECTOR)) pendingTextBlocks.add(parent);
        }
      }
      scheduleFlush();
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true, characterData: true });
  }

  window.OpsTextDirection = {
    firstStrongDirection,
    containsArabic,
    containsLatin,
    stripBidiControls,
    formatMixedBidiHtml,
    setDirection,
    syncField,
    syncTextBlock,
    apply,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();


// Defensive rapid-click guard.
// Prevents click storms from starting many route changes/modals/API actions at once.
(function initOpsRapidClickGuard() {
  if (window.__opsRapidClickGuardBound) return;
  window.__opsRapidClickGuardBound = true;

  const ACTION_SELECTOR = [
    'button',
    'a[href]',
    '[role="button"]',
    '[data-action]',
    '.nav-link',
    '.notif-row',
    '.card[onclick]',
    '.order-card',
    '.co-card',
    '.task-card',
  ].join(',');
  const EDITABLE_SELECTOR = 'input, textarea, select, option, [contenteditable="true"], .ql-editor';
  const DUPLICATE_WINDOW_MS = 280;
  const STORM_WINDOW_MS = 850;
  const STORM_LIMIT = 9;
  const COOLDOWN_MS = 520;

  let lastSignature = '';
  let lastAt = 0;
  let cooldownUntil = 0;
  const recent = [];

  function isEditableTarget(target) {
    try { return !!target?.closest?.(EDITABLE_SELECTOR); } catch { return false; }
  }

  function actionSignature(el) {
    if (!el) return '';
    const tag = String(el.tagName || '').toLowerCase();
    const id = String(el.id || '').trim();
    const href = String(el.getAttribute?.('href') || '').trim();
    const action = String(el.getAttribute?.('data-action') || '').trim();
    const text = String(el.textContent || '').trim().slice(0, 80);
    return `${tag}|${id}|${href}|${action}|${text}`;
  }

  function block(event) {
    try { event.preventDefault(); } catch {}
    try { event.stopImmediatePropagation(); } catch { try { event.stopPropagation(); } catch {} }
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (!target || isEditableTarget(target)) return;

    const action = target.closest?.(ACTION_SELECTOR);
    if (!action || action.getAttribute?.('data-no-rapid-click-guard') !== null) return;

    const now = Date.now();
    if (now < cooldownUntil) {
      block(event);
      return;
    }

    while (recent.length && now - recent[0] > STORM_WINDOW_MS) recent.shift();
    recent.push(now);

    const sig = actionSignature(action);
    const duplicate = sig && sig === lastSignature && (now - lastAt) < DUPLICATE_WINDOW_MS;
    lastSignature = sig;
    lastAt = now;

    if (duplicate || recent.length > STORM_LIMIT) {
      if (recent.length > STORM_LIMIT) cooldownUntil = now + COOLDOWN_MS;
      block(event);
    }
  }, true);
})();


// public/js/common-ui.js
document.addEventListener('DOMContentLoaded', () => {
  // 🔒 مهم: نخفي روابط السايدبار من البداية لتجنب "فلاش" كل الصفحات
  // لازم الـ body يبقى عليه الكلاس ده قبل ما الصلاحيات تتطبق.
  // هنضيفه هنا كـ safety (وكمان هنضيفه في الـ HTML body كـ default).
  document.body.classList.add('permissions-loading');

  // Page-specific body class (used by CSS to tune some pages like Home/Notifications)
  // Examples: /home => page-home, /expenses/users => page-expenses-users
  try {
    const p = String(window.location?.pathname || "/").replace(/\/+$/, "") || "/";
    const slug = (p === "/") ? "root" : p.split("/").filter(Boolean).join("-");
    document.body.classList.add(`page-${slug}`);
  } catch {}

  const EMBEDDED_SHELL_CONTENT = isOpsShellEmbeddedMode();
  if (EMBEDDED_SHELL_CONTENT) {
    try { document.body.classList.add('shell-embedded'); } catch {}
  }

  const logoutBtn     = document.getElementById('logoutBtn');
  let menuToggle    = null;     // injected on mobile
  let sidebarToggle = document.getElementById('sidebar-toggle');  // removed (logo is the toggle now)

  const KEY_MINI       = 'ui.sidebarMini';   // 1 = mini على الديسكتوب (legacy)
  const KEY_COLLAPSED  = 'ui.sidebarCollapsed'; // 1 = dashboard مغلق (drawer)
  const CACHE_ALLOWED  = 'allowedPages';     // sessionStorage key
  const CHROME_CACHE_KEY = 'ops.ui.chrome.v1'; // localStorage key: stable header/sidebar during hard refresh
  const isMobile = () => window.innerWidth <= 768;

  // =====================================================
  // PWA install prompt helper
  // - There is no real "download" file for a PWA. Android/Windows install is
  //   handled by the browser through the beforeinstallprompt event.
  // - If the browser does not expose the prompt, we show clear manual steps.
  // =====================================================
  window.OpsPWAInstall = window.OpsPWAInstall || {
    deferredPrompt: null,
    lastOutcome: null,
    installedAt: null,
    isStandalone() {
      try {
        return window.matchMedia('(display-mode: standalone)').matches ||
          window.navigator.standalone === true ||
          document.referrer.startsWith('android-app://');
      } catch {
        return false;
      }
    },
    canPrompt() {
      return !!this.deferredPrompt;
    },
  };

  if (!window.__opsPwaInstallPromptBound) {
    window.__opsPwaInstallPromptBound = true;
    window.addEventListener('beforeinstallprompt', (event) => {
      try { event.preventDefault(); } catch {}
      window.OpsPWAInstall.deferredPrompt = event;
      try { window.dispatchEvent(new CustomEvent('ops:pwa-install-available')); } catch {}
    });
    window.addEventListener('appinstalled', () => {
      window.OpsPWAInstall.deferredPrompt = null;
      window.OpsPWAInstall.lastOutcome = 'accepted';
      window.OpsPWAInstall.installedAt = Date.now();
      try { window.dispatchEvent(new CustomEvent('ops:pwa-installed')); } catch {}
    });
  }


  // =====================================================
  // API data cache (sessionStorage) + background prefetch
  // - keeps navigation between pages fast in this multi-page app
  // - first load still comes from the server, then later pages reuse cached JSON
  // - any successful mutation clears the cache so the UI stays fresh
  // =====================================================
  const APP_API_CACHE_NS = 'ops.api.cache.v2';
  const APP_API_CACHE_PREFIX = `${APP_API_CACHE_NS}:entry:`;
  const APP_API_PRIME_PREFIX = `${APP_API_CACHE_NS}:prime:`;
  const APP_API_MAX_ENTRY_CHARS = 1_500_000;
  const HARD_REFRESH_MARKER_KEY = 'ops.hardRefresh.pendingAt';
  const POST_LOGIN_BOOT_MARKER_KEY = 'ops.postLogin.pendingAt';
  const LOGIN_SPLASH_MARKER_KEY = 'ops.loginSplash.pendingAt';
  const HARD_REFRESH_BYPASS_MS = 90 * 1000;
  const POST_LOGIN_BOOT_BYPASS_MS = 90 * 1000;
  const LOGIN_SPLASH_BYPASS_MS = 90 * 1000;
  const _nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  const _apiCacheInflight = new Map();

  function cachePart(value) {
    return encodeURIComponent(String(value ?? '').trim() || '-');
  }

  function getApiCacheStorageKey(name, urlObj) {
    return `${APP_API_CACHE_PREFIX}${name}:${cachePart(urlObj.pathname + urlObj.search)}`;
  }

  function clearAppApiCache() {
    try {
      const toDelete = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (!key) continue;
        if (key.startsWith(APP_API_CACHE_PREFIX) || key.startsWith(APP_API_PRIME_PREFIX)) {
          toDelete.push(key);
        }
      }
      toDelete.forEach((key) => {
        try { sessionStorage.removeItem(key); } catch {}
      });
    } catch {}
  }

  function clearKnownClientDataCaches() {
    try { clearAppApiCache(); } catch {}

    const sessionPrefixes = [
      'cache:',
      APP_API_CACHE_PREFIX,
      APP_API_PRIME_PREFIX,
    ];
    const sessionExact = [
      'allowedPages',
      'ops.orders.allowedPages',
      'ops.permissions.cache',
    ];

    try {
      const toDelete = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (!key) continue;
        if (sessionExact.includes(key) || sessionPrefixes.some((prefix) => key.startsWith(prefix))) {
          toDelete.push(key);
        }
      }
      toDelete.forEach((key) => {
        try { sessionStorage.removeItem(key); } catch {}
      });
    } catch {}

    // Keep UI chrome data (username/sidebar shape) so the header/sidebar do not jump
    // while the fresh account request is loading after a hard refresh.
  }

  let __opsAuthRedirectScheduled = false;

  function shouldIgnoreAuthRedirect(urlObj) {
    try {
      const path = String(urlObj?.pathname || '');
      return path === '/api/login' || path === '/api/logout' || path === '/api/session-diagnostics';
    } catch {
      return false;
    }
  }

  function scheduleLoginRedirect(reason) {
    if (__opsAuthRedirectScheduled) return;
    __opsAuthRedirectScheduled = true;
    try { clearKnownClientDataCaches(); } catch {}
    try { sessionStorage.clear(); } catch {}
    try { localStorage.removeItem('username'); } catch {}
    try { localStorage.removeItem(CHROME_CACHE_KEY); } catch {}

    const next = '/login';
    window.setTimeout(() => {
      try { window.location.replace(next); } catch { window.location.href = next; }
    }, reason === 'immediate' ? 0 : 25);
  }

  async function handleApiAuthResponse(response, urlObj) {
    try {
      if (!response || response.status !== 401) return response;
      if (!urlObj || urlObj.origin !== window.location.origin) return response;
      if (!String(urlObj.pathname || '').startsWith('/api/')) return response;
      if (shouldIgnoreAuthRedirect(urlObj)) return response;
      if (String(window.location.pathname || '') === '/login') return response;

      let payload = null;
      try { payload = await response.clone().json(); } catch {}
      const code = String(payload?.code || '').toUpperCase();
      const redirect = String(payload?.redirect || '').trim();
      if (redirect || code === 'AUTH_REQUIRED' || code === 'AUTH_REVOKED' || payload?.authenticated === false) {
        scheduleLoginRedirect('immediate');
      }
    } catch {}
    return response;
  }

  function requestForcesNetwork(input, init) {
    try {
      const req = input instanceof Request ? input : null;
      const mode = String(init?.cache || req?.cache || '').toLowerCase();
      return mode === 'no-store' || mode === 'no-cache' || mode === 'reload';
    } catch {
      return false;
    }
  }

  function readAppApiCache(storageKey) {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const expiresAt = Number(parsed?.expiresAt || 0);
      if (!expiresAt || Date.now() > expiresAt) {
        try { sessionStorage.removeItem(storageKey); } catch {}
        return null;
      }
      if (typeof parsed?.bodyText !== 'string' || !parsed.bodyText) return null;
      return parsed;
    } catch {
      try { sessionStorage.removeItem(storageKey); } catch {}
      return null;
    }
  }

  function writeAppApiCache(storageKey, bodyText, ttlMs, status = 200) {
    try {
      if (typeof bodyText !== 'string' || !bodyText) return;
      if (bodyText.length > APP_API_MAX_ENTRY_CHARS) return;
      const payload = {
        status: Number(status || 200),
        bodyText,
        expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || 1000),
      };
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (e) {
      const name = String(e?.name || '');
      if (/quota/i.test(name)) {
        clearAppApiCache();
      }
    }
  }

  function buildCachedJsonResponse(entry) {
    return new Response(entry.bodyText, {
      status: Number(entry?.status || 200),
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Ops-Client-Cache': 'HIT',
      },
    });
  }

  function hasRecentHardRefreshMarker() {
    try {
      const ts = Number(sessionStorage.getItem(HARD_REFRESH_MARKER_KEY) || 0);
      if (!ts || !Number.isFinite(ts)) return false;
      const age = Date.now() - ts;
      if (age >= 0 && age <= HARD_REFRESH_BYPASS_MS) return true;
      sessionStorage.removeItem(HARD_REFRESH_MARKER_KEY);
    } catch {}
    return false;
  }

  function hasRecentPostLoginBootMarker() {
    try {
      const ts = Number(sessionStorage.getItem(POST_LOGIN_BOOT_MARKER_KEY) || 0);
      if (!ts || !Number.isFinite(ts)) return false;
      const age = Date.now() - ts;
      if (age >= 0 && age <= POST_LOGIN_BOOT_BYPASS_MS) return true;
      sessionStorage.removeItem(POST_LOGIN_BOOT_MARKER_KEY);
    } catch {}
    return false;
  }

  function hasRecentLoginSplashMarker() {
    try {
      const ts = Number(sessionStorage.getItem(LOGIN_SPLASH_MARKER_KEY) || 0);
      if (!ts || !Number.isFinite(ts)) return false;
      const age = Date.now() - ts;
      if (age >= 0 && age <= LOGIN_SPLASH_BYPASS_MS) return true;
      sessionStorage.removeItem(LOGIN_SPLASH_MARKER_KEY);
    } catch {}
    return false;
  }

  function markPostLoginBootPending() {
    try { sessionStorage.setItem(POST_LOGIN_BOOT_MARKER_KEY, String(Date.now())); } catch {}
  }

  function markLoginSplashPending() {
    try { sessionStorage.setItem(LOGIN_SPLASH_MARKER_KEY, String(Date.now())); } catch {}
  }

  function clearPostLoginBootPending() {
    try { sessionStorage.removeItem(POST_LOGIN_BOOT_MARKER_KEY); } catch {}
  }

  function clearLoginSplashPending() {
    try { sessionStorage.removeItem(LOGIN_SPLASH_MARKER_KEY); } catch {}
  }

  function pageNeedsChromeBootOverlay() {
    return currentPageHasHardRefreshParams() || hasRecentHardRefreshMarker() || hasRecentPostLoginBootMarker() || hasRecentLoginSplashMarker();
  }

  function markHardRefreshPending() {
    try { sessionStorage.setItem(HARD_REFRESH_MARKER_KEY, String(Date.now())); } catch {}
  }

  function clearHardRefreshPending() {
    try { sessionStorage.removeItem(HARD_REFRESH_MARKER_KEY); } catch {}
  }

  function pageForcesFreshApiRequests() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return params.get('_fresh') === '1' || params.has('_refresh') || hasRecentHardRefreshMarker();
    } catch {
      return hasRecentHardRefreshMarker();
    }
  }

  function clearTransientRefreshParams() {
    try {
      const url = new URL(window.location.href);
      const hadFresh = url.searchParams.get('_fresh') === '1' || url.searchParams.has('_refresh');
      if (!hadFresh) return;
      url.searchParams.delete('_fresh');
      url.searchParams.delete('_refresh');
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, document.title, next || url.pathname || '/');
    } catch {}
  }

  const APP_API_CACHE_RULES = [
    { name: 'account', test: (url) => url.pathname === '/api/account', ttlMs: 5 * 60 * 1000 },
    { name: 'notifications', test: (url) => url.pathname === '/api/notifications', ttlMs: 2 * 1000 },
    { name: 'b2b-schools', test: (url) => url.pathname === '/api/b2b/schools', ttlMs: 10 * 60 * 1000 },
    { name: 'b2b-school', test: (url) => /^\/api\/b2b\/schools\/[^/]+$/.test(url.pathname), ttlMs: 5 * 60 * 1000 },
    { name: 'b2b-school-stock', test: (url) => /^\/api\/b2b\/schools\/[^/]+\/stock$/.test(url.pathname), ttlMs: 2 * 60 * 1000 },
    { name: 'order-types', test: (url) => url.pathname === '/api/order-types', ttlMs: 20 * 60 * 1000 },
    { name: 'components', test: (url) => url.pathname === '/api/components', ttlMs: 20 * 60 * 1000 },
    { name: 'products', test: (url) => url.pathname === '/api/products', ttlMs: 2 * 60 * 1000 },
    { name: 'product-proposals', test: (url) => url.pathname === '/api/products/proposals', ttlMs: 2 * 60 * 1000 },
    { name: 'product-kits', test: (url) => url.pathname === '/api/products/kits', ttlMs: 2 * 60 * 1000 },
    { name: 'orders-current', test: (url) => url.pathname === '/api/orders', ttlMs: 2 * 60 * 1000 },
    { name: 'orders-requested', test: (url) => url.pathname === '/api/orders/requested', ttlMs: 2 * 60 * 1000 },
    { name: 'task-detail', test: (url) => /^\/api\/tasks\/[^/]+$/.test(url.pathname), ttlMs: 90 * 1000 },
    { name: 'stock', test: (url) => url.pathname === '/api/stock', ttlMs: 2 * 60 * 1000 },
    { name: 'expenses-main', test: (url) => url.pathname === '/api/expenses', ttlMs: 2 * 60 * 1000 },
    { name: 'expenses-types', test: (url) => url.pathname === '/api/expenses/types', ttlMs: 20 * 60 * 1000 },
    { name: 'expenses-cash-in-from', test: (url) => url.pathname === '/api/expenses/cash-in-from/options', ttlMs: 20 * 60 * 1000 },
    { name: 'expenses-users', test: (url) => url.pathname === '/api/expenses/users', ttlMs: 2 * 60 * 1000 },
    { name: 'user-access-members', test: (url) => url.pathname === '/api/user-access/team-members', ttlMs: 2 * 60 * 1000 },
    { name: 'expenses-user', test: (url) => /^\/api\/expenses\/user\/[^/]+$/.test(url.pathname), ttlMs: 2 * 60 * 1000 },
  ];

  function getApiCacheRule(urlObj, method) {
    const verb = String(method || 'GET').toUpperCase();
    if (verb !== 'GET') return null;
    if (urlObj.origin !== window.location.origin) return null;
    return APP_API_CACHE_RULES.find((rule) => {
      try { return !!rule.test(urlObj); } catch { return false; }
    }) || null;
  }

  // =====================================================
  // Page access runtime: View / Edit / Admin
  // =====================================================
  const OPS_ADMIN_BYPASS_TOKEN = '__OPS_PAGE_ADMIN_BYPASS__';
  let __opsCurrentPageAccess = { level: 'edit', pages: [] };
  let __opsViewOnlyLastNoticeAt = 0;
  let __opsPageAccessGuardsInstalled = false;
  let __opsAdminBypassObserver = null;

  function normalizeOpsAccessLevel(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'admin') return 'admin';
    if (raw === 'view') return 'view';
    // Legacy "user" access acts like Edit.
    return 'edit';
  }

  function opsAccessToken(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function opsRouteMatchesPage(pathname, row) {
    const path = String(pathname || '/').replace(/\/+$/, '') || '/';
    const route = String(row?.routePath || row?.route_path || '').replace(/\/+$/, '') || '';
    if (route && (path === route || path.startsWith(`${route}/`))) return true;
    const routeKey = opsAccessToken(path);
    const candidates = [row?.pageName, row?.page_name, row?.pageKey, row?.page_key, ...(Array.isArray(row?.aliases) ? row.aliases : [])]
      .map(opsAccessToken)
      .filter(Boolean);
    const known = {
      orders: ['currentorders'],
      ordersrequested: ['operationsorders', 'requestedorders'],
      ordersmaintenanceorders: ['maintenanceorders'],
      orderssvorders: ['ordersreview'],
      ordersnew: ['createneworder', 'shoppingcart'],
      expensesusers: ['expensesusers'],
      useraccess: ['userscenter', 'useraccessdata'],
      messages: ['mail'],
      // Events is a legacy broad entitlement. Child pages must never match
      // each other here, otherwise a user with one child could inherit the
      // runtime View/Edit/Admin level of another child.
      events: [],
      eventscalendar: ['events'],
      eventrequests: ['events'],
      eventcomponents: ['events'],
      // Creation/edit workspaces inherit the same access level as their
      // owning child page, so View access remains read-only there as well.
      eventsnew: ['eventrequests', 'events'],
      eventscomponentsnew: ['eventcomponents', 'events'],
      // Task Management parent is legacy-broad only. Child pages must remain
      // independent so View/Edit/Admin levels never leak between the two views.
      taskmanagement: [],
      taskmanagementalltasks: ['alltasks', 'taskmanagement'],
      taskmanagementmytasks: ['mytasks', 'taskmanagement'],
      taskmanagementdelegatedtasks: ['delegatedtasks', 'taskmanagement'],
      b2c: [],
      b2cdatabase: ['customerdatabase', 'b2c'],
      b2cform: ['customerform', 'b2c'],
    };
    const wants = new Set([routeKey, ...(known[routeKey] || [])]);
    return candidates.some((candidate) => wants.has(candidate));
  }

  function resolveCurrentPageAccessLevel(pages) {
    const path = String(window.location?.pathname || '/');
    const matches = (Array.isArray(pages) ? pages : []).filter((row) => row && row.isEnabled !== false && row.is_enabled !== false && opsRouteMatchesPage(path, row));
    const rank = { view: 1, edit: 2, admin: 3 };
    let result = 'edit';
    let highest = 0;
    matches.forEach((row) => {
      const level = normalizeOpsAccessLevel(row?.accessLevel || row?.access_level);
      if (rank[level] > highest) { highest = rank[level]; result = level; }
    });
    return matches.length ? result : 'edit';
  }

  function showViewOnlyNotice() {
    const now = Date.now();
    if (now - __opsViewOnlyLastNoticeAt < 900) return;
    __opsViewOnlyLastNoticeAt = now;
    try {
      if (window.UI && typeof window.UI.toast === 'function') {
        window.UI.toast('info', 'View access only', 'You are not authorized to make changes on this page.');
        return;
      }
    } catch {}
    try { window.alert('View access only: you are not authorized to make changes on this page.'); } catch {}
  }

  function isViewOnlyPage() {
    return String(__opsCurrentPageAccess?.level || '').toLowerCase() === 'view';
  }

  function isPageAdmin() {
    return String(__opsCurrentPageAccess?.level || '').toLowerCase() === 'admin';
  }

  function isChromeOrNavigationControl(node) {
    if (!node || typeof node.closest !== 'function') return false;
    return !!node.closest('.sidebar, .main-header, .dashboard-header, .top-header, .mobile-dock, .mobile-bottom-nav, .profile-menu, .notification-panel, .notifications-panel, .global-search, [data-ops-view-allow]');
  }

  function isEditableContentControl(node) {
    if (!node || typeof node.matches !== 'function') return false;
    return node.matches('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"], [role="combobox"]');
  }

  function installViewOnlyInteractionGuards() {
    if (__opsPageAccessGuardsInstalled) return;
    __opsPageAccessGuardsInstalled = true;

    document.addEventListener('click', (event) => {
      if (!isViewOnlyPage()) return;
      const control = event.target?.closest?.('button, input[type="submit"], input[type="button"], [role="button"], [data-modern-select-button], [data-proposal-action], [data-kit-action]');
      if (!control || isChromeOrNavigationControl(control)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showViewOnlyNotice();
    }, true);

    document.addEventListener('pointerdown', (event) => {
      if (!isViewOnlyPage()) return;
      const control = event.target?.closest?.('input, textarea, select, [contenteditable="true"], [role="combobox"]');
      if (!control || isChromeOrNavigationControl(control) || !isEditableContentControl(control)) return;
      event.preventDefault();
      showViewOnlyNotice();
    }, true);

    document.addEventListener('keydown', (event) => {
      if (!isViewOnlyPage()) return;
      const active = document.activeElement;
      if (!active || isChromeOrNavigationControl(active) || !isEditableContentControl(active)) return;
      event.preventDefault();
      showViewOnlyNotice();
    }, true);

    document.addEventListener('submit', (event) => {
      if (!isViewOnlyPage()) return;
      const form = event.target;
      if (isChromeOrNavigationControl(form)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showViewOnlyNotice();
    }, true);
  }

  function activeAdminPasswordDialogs() {
    return Array.from(document.querySelectorAll('input[type="password"]')).filter((input) => {
      const marker = `${input.name || ''} ${input.placeholder || ''} ${input.closest('form, [role="dialog"], .modal, .products-modal, .b2b-admin-password-modal, .expense-user-action-card')?.textContent || ''}`.toLowerCase();
      const visible = !!(input.offsetWidth || input.offsetHeight || input.getClientRects().length);
      return visible && /admin\s*password|adminpassword/.test(marker);
    });
  }

  function applyAdminBypassToOpenDialogs() {
    if (!isPageAdmin()) return;
    const inputs = activeAdminPasswordDialogs();
    inputs.forEach((input) => {
      if (input.value !== OPS_ADMIN_BYPASS_TOKEN) {
        input.value = OPS_ADMIN_BYPASS_TOKEN;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      input.setAttribute('data-ops-admin-bypass', 'true');
    });

    // Fully automatic only when the dialog contains a password field and no
    // other user-entered data. Dialogs with date/options remain open so the
    // user can choose those values while the password is already bypassed.
    const roots = Array.from(new Set(inputs.map((input) => input.closest('form, [role="dialog"], .b2b-admin-password-modal, .expense-user-action-card, .co-submodal, .sv-admin-modal')).filter(Boolean)));
    roots.forEach((root) => {
      if (root.dataset.opsAdminAutoSubmitted === 'true') return;
      const editable = Array.from(root.querySelectorAll('input:not([type="hidden"]), select, textarea')).filter((field) => field.type !== 'password' && !field.disabled);
      if (editable.length) return;
      const action = root.querySelector('[data-admin-submit], [data-admin-confirm], [data-edit-password-confirm], [data-password-confirm], #coEditPwdConfirm, #reqEditPwdConfirm, #reqArchivePwdConfirm, #svAdminPwdConfirm, #uaAdminPasswordConfirm, button[type="submit"]');
      if (!action || action.disabled) return;
      root.dataset.opsAdminAutoSubmitted = 'true';
      window.setTimeout(() => {
        try { action.click(); } catch {}
        window.setTimeout(() => { try { delete root.dataset.opsAdminAutoSubmitted; } catch {} }, 1200);
      }, 45);
    });
  }

  function installAdminBypassHelper() {
    if (!window.__opsAdminPromptBypassInstalled) {
      try {
        const nativePrompt = typeof window.prompt === 'function' ? window.prompt.bind(window) : null;
        window.prompt = function opsPageAccessPrompt(message, defaultValue) {
          if (isPageAdmin() && /admin\s*password/i.test(String(message || ''))) return OPS_ADMIN_BYPASS_TOKEN;
          return nativePrompt ? nativePrompt(message, defaultValue) : null;
        };
        window.__opsAdminPromptBypassInstalled = true;
      } catch {}
    }
    if (__opsAdminBypassObserver || typeof MutationObserver === 'undefined') return;
    __opsAdminBypassObserver = new MutationObserver(() => {
      window.setTimeout(applyAdminBypassToOpenDialogs, 0);
    });
    try { __opsAdminBypassObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-hidden'] }); } catch {}
    document.addEventListener('click', () => window.setTimeout(applyAdminBypassToOpenDialogs, 0), true);
  }

  function applyPageAccessRuntime(payload = {}) {
    const pages = Array.isArray(payload?.pageAccess?.pages)
      ? payload.pageAccess.pages
      : Array.isArray(payload?.pageAccess)
        ? payload.pageAccess
        : [];
    const level = resolveCurrentPageAccessLevel(pages);
    __opsCurrentPageAccess = { level, pages };
    try { sessionStorage.setItem('ops.currentPageAccess', JSON.stringify({ pages, level, savedAt: Date.now() })); } catch {}
    try {
      document.body.dataset.pageAccessLevel = level;
      document.body.classList.toggle('ops-view-only', level === 'view');
      document.body.classList.toggle('ops-page-admin', level === 'admin');
    } catch {}
    try {
      window.OpsPageAccess = {
        level,
        pages,
        isViewOnly: () => isViewOnlyPage(),
        isEdit: () => String(__opsCurrentPageAccess?.level) === 'edit',
        isAdmin: () => isPageAdmin(),
        adminBypassToken: OPS_ADMIN_BYPASS_TOKEN,
        showViewOnlyNotice,
      };
    } catch {}
    installViewOnlyInteractionGuards();
    installAdminBypassHelper();
    window.setTimeout(applyAdminBypassToOpenDialogs, 0);
  }

  function normalizeAllowedToken(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9/]+/g, '');
  }

  function hasAllowedPage(allowedPages, aliases) {
    const set = new Set((allowedPages || []).map((item) => normalizeAllowedToken(item)));
    return (aliases || []).some((alias) => set.has(normalizeAllowedToken(alias)));
  }

  function buildPrefetchUrls(allowedPages) {
    const urls = ['/api/account'];

    if (hasAllowedPage(allowedPages, ['B2B', '/b2b'])) {
      urls.push('/api/b2b/schools');
    }
    if (hasAllowedPage(allowedPages, ['Create New Order', '/orders/new'])) {
      urls.push('/api/order-types', '/api/components');
    }
    if (hasAllowedPage(allowedPages, ['Current Orders', '/orders'])) {
      urls.push('/api/orders');
    }
    if (hasAllowedPage(allowedPages, ['Requested Orders', 'Schools Requested Orders', '/orders/requested'])) {
      urls.push('/api/orders/requested');
    }
    if (hasAllowedPage(allowedPages, ['Maintenance Orders', '/orders/maintenance-orders'])) {
      urls.push('/api/orders/requested');
    }
    if (hasAllowedPage(allowedPages, ['Events', 'Event Calendar', 'Event Requests', '/events', '/events/calendar', '/events/requests'])) {
      urls.push('/api/events');
    }
    if (hasAllowedPage(allowedPages, ['Events', 'Event Requests', 'Event Components', '/events', '/events/requests', '/events/components'])) {
      urls.push('/api/events/components?activeOnly=1');
    }
    if (hasAllowedPage(allowedPages, ['Task Management', 'All Tasks', 'My Tasks', 'Delegated Tasks', '/task-management', '/task-management/all-tasks', '/task-management/my-tasks', '/task-management/delegated-tasks'])) {
      const taskManagementView = hasAllowedPage(allowedPages, ['All Tasks', '/task-management/all-tasks'])
        ? 'all'
        : (hasAllowedPage(allowedPages, ['My Tasks', '/task-management/my-tasks']) ? 'my' : 'delegated');
      urls.push(`/api/task-management?view=${taskManagementView}`, `/api/task-management/meta?view=${taskManagementView}`);
    }
    if (hasAllowedPage(allowedPages, ['KPIs', 'KPI', '/kpis'])) {
      urls.push('/api/kpis/meta', '/api/kpis/reviews');
    }
    if (hasAllowedPage(allowedPages, ['Stocktaking', '/stocktaking'])) {
      urls.push('/api/stock');
    }
    if (hasAllowedPage(allowedPages, ['Products', 'Product', 'Components', '/products'])) {
      urls.push('/api/products');
    }
    if (hasAllowedPage(allowedPages, ['Proposals', '/proposals', 'Products', '/products'])) {
      urls.push('/api/products/proposals', '/api/products/kits');
    } else if (hasAllowedPage(allowedPages, ['Kits', '/kits'])) {
      urls.push('/api/products/kits');
    }
    if (hasAllowedPage(allowedPages, ['Expenses', '/expenses'])) {
      urls.push('/api/expenses', '/api/expenses/types', '/api/expenses/cash-in-from/options');
    }
    if (hasAllowedPage(allowedPages, ['Expenses Users', '/expenses/users'])) {
      urls.push('/api/expenses/users');
    }
    if (hasAllowedPage(allowedPages, ['Users Center', 'User Access & Data', 'User Access and Data', 'User Access', 'Team Members', '/user-access'])) {
      urls.push('/api/user-access/team-members');
    }
    if (hasAllowedPage(allowedPages, ['Backup', 'Back up', 'Database', 'System Database', 'System Backup', '/backup'])) {
      urls.push('/api/backup/tables');
    }

    return Array.from(new Set(urls));
  }

  async function prefetchApiUrls(urls, concurrency = 2) {
    const queue = Array.from(urls || []).filter(Boolean);
    if (!queue.length) return;

    let index = 0;
    const workers = new Array(Math.min(Math.max(1, concurrency), queue.length)).fill(0).map(async () => {
      while (index < queue.length) {
        const current = queue[index++];
        try {
          await window.fetch(current, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'X-Ops-Prefetch': '1' },
          });
        } catch {}
      }
    });

    await Promise.all(workers);
  }

  function schedulePrefetchForAllowedPages(allowedPages) {
    try {
      const userKey = cachePart(localStorage.getItem('username') || 'user');
      const permsKey = cachePart((allowedPages || []).join('|') || 'none');
      const marker = `${APP_API_PRIME_PREFIX}${userKey}:${permsKey}`;
      if (sessionStorage.getItem(marker) === '1') return;
      sessionStorage.setItem(marker, '1');

      const urls = buildPrefetchUrls(allowedPages);
      if (!urls.length) return;

      const run = () => {
        prefetchApiUrls(urls, 2).catch(() => {
          try { sessionStorage.removeItem(marker); } catch {}
        });
      };

      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 1500 });
      } else {
        window.setTimeout(run, 350);
      }
    } catch {}
  }

  function patchApiFetchCaching() {
    if (!_nativeFetch || window.__opsApiCachePatched) return;
    window.__opsApiCachePatched = true;

    window.fetch = async function patchedFetch(input, init) {
      const req = input instanceof Request ? input : null;
      const urlObj = new URL(typeof input === 'string' ? input : (req ? req.url : String(input || '')), window.location.origin);
      const method = String(init?.method || req?.method || 'GET').toUpperCase();
      const isApi = urlObj.origin === window.location.origin && urlObj.pathname.startsWith('/api/');

      if (isApi && method !== 'GET' && method !== 'HEAD') {
        const response = await _nativeFetch(input, init);
        if (response && response.ok) {
          clearAppApiCache();
        }
        return await handleApiAuthResponse(response, urlObj);
      }

      const rule = getApiCacheRule(urlObj, method);
      const bypass =
        String(urlObj.searchParams.get('_fresh') || '') === '1' ||
        pageForcesFreshApiRequests() ||
        requestForcesNetwork(input, init) ||
        urlObj.pathname === '/api/account';

      // During Hard Refresh, force every GET API request to bypass BOTH layers:
      // 1) this browser/sessionStorage cache, and
      // 2) server/Upstash cache for routes that support the X-Ops-Hard-Refresh header.
      if (isApi && (method === 'GET' || method === 'HEAD') && bypass) {
        const freshUrl = new URL(urlObj.href);
        freshUrl.searchParams.set('_fresh', '1');
        freshUrl.searchParams.set('_refresh', String(Date.now()));

        const nextInit = Object.assign({}, init || {});
        const nextHeaders = new Headers(init?.headers || (req ? req.headers : undefined) || {});
        nextHeaders.set('Accept', nextHeaders.get('Accept') || 'application/json');
        nextHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        nextHeaders.set('Pragma', 'no-cache');
        nextHeaders.set('X-Ops-Hard-Refresh', '1');
        nextInit.headers = nextHeaders;
        nextInit.cache = 'no-store';
        nextInit.credentials = nextInit.credentials || 'same-origin';

        const response = await _nativeFetch(freshUrl.toString(), nextInit);
        return await handleApiAuthResponse(response, freshUrl);
      }

      if (!rule) {
        const response = await _nativeFetch(input, init);
        return await handleApiAuthResponse(response, urlObj);
      }

      const storageKey = getApiCacheStorageKey(rule.name, urlObj);
      const cached = readAppApiCache(storageKey);
      if (cached) {
        return buildCachedJsonResponse(cached);
      }

      if (_apiCacheInflight.has(storageKey)) {
        try { await _apiCacheInflight.get(storageKey); } catch {}
        const warm = readAppApiCache(storageKey);
        if (warm) return buildCachedJsonResponse(warm);
      }

      const pending = (async () => {
        const response = await _nativeFetch(input, init);
        await handleApiAuthResponse(response, urlObj);
        if (response && response.ok) {
          const ctype = String(response.headers.get('content-type') || '').toLowerCase();
          if (ctype.includes('json')) {
            try {
              const bodyText = await response.clone().text();
              if (bodyText) {
                JSON.parse(bodyText);
                writeAppApiCache(storageKey, bodyText, rule.ttlMs, response.status);
              }
            } catch {}
          }
        }
        return response;
      })();

      _apiCacheInflight.set(storageKey, pending.then(() => undefined).catch(() => undefined));
      try {
        return await pending;
      } finally {
        _apiCacheInflight.delete(storageKey);
      }
    };

    window.OpsAppCache = {
      clear: clearAppApiCache,
      clearAll: clearKnownClientDataCaches,
      markHardRefreshPending,
      markPostLoginBootPending,
      markLoginSplashPending,
      prefetch: prefetchApiUrls,
      schedule: schedulePrefetchForAllowedPages,
    };
  }

  patchApiFetchCaching();

  // =====================================================
  // Hard Refresh UX + cache clearing
  // =====================================================
  let __opsHardRefreshRunning = false;
  let __opsHardRefreshOverlay = null;

  function ensureHardRefreshOverlay() {
    let overlay = document.getElementById('opsHardRefreshOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'opsHardRefreshOverlay';
    overlay.className = 'ops-hard-refresh-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = `
      <div class="ops-hard-refresh-card">
        <div class="ops-hard-refresh-card__icon" aria-hidden="true">
          <span class="ops-hard-refresh-spinner"></span>
        </div>
        <div class="ops-hard-refresh-card__copy">
          <div class="ops-hard-refresh-card__title">Hard Refresh</div>
          <div class="ops-hard-refresh-card__message" data-hard-refresh-message>Preparing fresh data…</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showHardRefreshOverlay(message, title) {
    try {
      __opsHardRefreshOverlay = ensureHardRefreshOverlay();
      const msg = __opsHardRefreshOverlay.querySelector('[data-hard-refresh-message]');
      const heading = __opsHardRefreshOverlay.querySelector('.ops-hard-refresh-card__title');
      if (heading && title) heading.textContent = title;
      if (msg) msg.textContent = message || 'Refreshing…';
      __opsHardRefreshOverlay.hidden = false;
      document.body.classList.add('ops-hard-refresh-active');
    } catch {}
  }

  function updateHardRefreshOverlay(message) {
    try {
      const overlay = __opsHardRefreshOverlay || ensureHardRefreshOverlay();
      const msg = overlay.querySelector('[data-hard-refresh-message]');
      if (msg && message) msg.textContent = message;
    } catch {}
  }

  function hideHardRefreshOverlay() {
    try {
      const overlay = __opsHardRefreshOverlay || document.getElementById('opsHardRefreshOverlay');
      if (overlay) overlay.hidden = true;
      document.body.classList.remove('ops-hard-refresh-active');
    } catch {}
  }

  let __opsLoginSplashOverlay = null;

  function buildLoginLogoPiecesMarkup() {
    const grid = 4;
    const pieces = [];
    for (let row = 0; row < grid; row += 1) {
      for (let col = 0; col < grid; col += 1) {
        const index = (row * grid) + col;
        const cx = col - ((grid - 1) / 2);
        const cy = row - ((grid - 1) / 2);
        const spread = 44 + ((Math.abs(cx) + Math.abs(cy)) * 18);
        const jitterX = ((index % 3) - 1) * 10;
        const jitterY = (((index + 1) % 3) - 1) * 9;
        const tx = Math.round((cx * spread) + jitterX);
        const ty = Math.round((cy * spread) + jitterY);
        const mx = Math.round(tx * 0.38);
        const my = Math.round(ty * 0.38);
        const rot = Math.round((cx * 18) - (cy * 16) + ((index % 2 ? 1 : -1) * 13));
        const mrot = Math.round(rot * -0.35);
        const delay = (0.03 + ((row + col) * 0.018)).toFixed(3);
        const bgX = grid === 1 ? 0 : (col / (grid - 1)) * 100;
        const bgY = grid === 1 ? 0 : (row / (grid - 1)) * 100;
        pieces.push(
          `<span class="login-success-splash__piece" style="--tx:${tx}px;--ty:${ty}px;--mx:${mx}px;--my:${my}px;--rot:${rot}deg;--mrot:${mrot}deg;--d:${delay}s;background-position:${bgX}% ${bgY}%;"></span>`
        );
      }
    }
    return pieces.join('');
  }

  function ensureLoginSplashOverlay() {
    let overlay = document.getElementById('opsLoginSplashOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'opsLoginSplashOverlay';
    overlay.className = 'login-success-splash ops-login-splash';
    overlay.hidden = true;
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = `
      <div class="login-success-splash__ambient" aria-hidden="true"></div>
      <div class="login-success-splash__stage" aria-hidden="true">
        <span class="login-success-splash__halo"></span>
        <span class="login-success-splash__logo-grid">
          ${buildLoginLogoPiecesMarkup()}
        </span>
        <img src="/images/logo.png" alt="" class="login-success-splash__solid-logo" />
      </div>
      <span class="sr-only">Opening dashboard</span>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showLoginSplashOverlay() {
    try {
      __opsLoginSplashOverlay = ensureLoginSplashOverlay();
      __opsLoginSplashOverlay.hidden = false;
      __opsLoginSplashOverlay.classList.add('is-active');
      document.body.classList.add('login-success-active', 'ops-login-splash-active');
    } catch {}
  }

  function hideLoginSplashOverlay() {
    try {
      const overlay = __opsLoginSplashOverlay || document.getElementById('opsLoginSplashOverlay');
      if (overlay) overlay.hidden = true;
      document.body.classList.remove('login-success-active', 'ops-login-splash-active');
    } catch {}
  }

  function hideFreshBootOverlay() {
    hideHardRefreshOverlay();
    hideLoginSplashOverlay();
  }

  function currentPageHasHardRefreshParams() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return params.get('_fresh') === '1' || params.has('_refresh');
    } catch {
      return false;
    }
  }

  const __opsFreshLoadOverlayState = {
    active: false,
    mode: '',
    accountReady: false,
    chromeReady: false,
    shellExpected: false,
    shellReady: true,
    hideScheduled: false,
    forceTimer: 0,
  };

  function maybeHideFreshLoadOverlay() {
    try {
      const state = __opsFreshLoadOverlayState;
      if (!state.active || state.hideScheduled) return;
      if (!state.accountReady) return;
      if (!state.chromeReady) return;
      if (state.shellExpected && !state.shellReady) return;

      state.hideScheduled = true;
      window.setTimeout(() => {
        const finish = () => {
          // Re-check at the exact closing moment because shellExpected may be
          // discovered after accountReady scheduled the first hide attempt.
          if (!state.active || !state.accountReady || !state.chromeReady || (state.shellExpected && !state.shellReady)) {
            state.hideScheduled = false;
            maybeHideFreshLoadOverlay();
            return;
          }
          try { clearTransientRefreshParams(); } catch {}
          try { clearHardRefreshPending(); } catch {}
          try { clearPostLoginBootPending(); } catch {}
          try { clearLoginSplashPending(); } catch {}
          try { document.body.classList.remove('ops-chrome-booting'); } catch {}
          hideFreshBootOverlay();
          state.active = false;
          state.hideScheduled = false;
          if (state.forceTimer) {
            try { window.clearTimeout(state.forceTimer); } catch {}
            state.forceTimer = 0;
          }
          try { window.dispatchEvent(new CustomEvent('ops:hard-refresh-ready')); } catch {}
        };

        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
        } else {
          window.setTimeout(finish, 32);
        }
      }, 450);
    } catch {}
  }

  function beginFreshLoadOverlayIfNeeded() {
    try {
      if (!pageNeedsChromeBootOverlay()) return false;
      const state = __opsFreshLoadOverlayState;
      const hasHardRefreshBoot = currentPageHasHardRefreshParams() || hasRecentHardRefreshMarker();
      const isLoginSplash = !hasHardRefreshBoot && hasRecentLoginSplashMarker();
      const isPostLogin = !hasHardRefreshBoot && !isLoginSplash && hasRecentPostLoginBootMarker();
      state.active = true;
      state.mode = isLoginSplash ? 'login-splash' : (isPostLogin ? 'login' : 'hard-refresh');
      state.accountReady = false;
      state.chromeReady = false;
      state.shellExpected = false;
      state.shellReady = true;
      state.hideScheduled = false;
      try { document.body.classList.add('ops-chrome-booting'); } catch {}
      if (isLoginSplash) {
        showLoginSplashOverlay();
      } else {
        showHardRefreshOverlay(isPostLogin ? 'Loading dashboard…' : 'Loading fresh data…', isPostLogin ? 'Loading' : 'Hard Refresh');
      }

      // Safety fallback: do not trap the user forever if an unexpected page script
      // fails before it can report that the normal chrome is ready.
      state.forceTimer = window.setTimeout(() => {
        try {
          state.accountReady = true;
          state.chromeReady = true;
          state.shellReady = true;
          maybeHideFreshLoadOverlay();
        } catch {}
      }, 15000);
      return true;
    } catch {
      return false;
    }
  }

  function markFreshLoadAccountReady() {
    try {
      __opsFreshLoadOverlayState.accountReady = true;
      maybeHideFreshLoadOverlay();
    } catch {}
  }

  function markFreshLoadChromeReady() {
    try {
      const state = __opsFreshLoadOverlayState;
      if (!state.active) return;
      // Wait for two frames so the header/sidebar transforms, icon hydration,
      // and permission display changes have actually painted before we remove
      // the boot overlay.
      const finish = () => {
        state.chromeReady = true;
        maybeHideFreshLoadOverlay();
      };
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
      } else {
        window.setTimeout(finish, 40);
      }
    } catch {}
  }

  function setFreshLoadShellExpected(expected) {
    try {
      const state = __opsFreshLoadOverlayState;
      if (!state.active) return;
      state.shellExpected = !!expected;
      state.shellReady = !expected;
      maybeHideFreshLoadOverlay();
    } catch {}
  }

  function markFreshLoadShellReady() {
    try {
      const state = __opsFreshLoadOverlayState;
      if (!state.active) return;
      state.shellReady = true;
      maybeHideFreshLoadOverlay();
    } catch {}
  }

  try {
    window.__opsFreshLoadOverlayState = __opsFreshLoadOverlayState;
    window.__opsFreshLoadOverlaySetShellExpected = setFreshLoadShellExpected;
    window.__opsFreshLoadOverlayMarkShellReady = markFreshLoadShellReady;
    window.__opsFreshLoadOverlayMarkChromeReady = markFreshLoadChromeReady;
  } catch {}

  function getTopSameOriginLocation() {
    try {
      if (window.top && window.top !== window && window.top.location && window.top.location.origin === window.location.origin) {
        return window.top.location;
      }
    } catch {}
    return window.location;
  }

  function reloadFreshAfterHardRefresh() {
    const loc = getTopSameOriginLocation();
    const url = new URL(loc.href);
    url.searchParams.set('_fresh', '1');
    url.searchParams.set('_refresh', String(Date.now()));
    loc.replace(url.toString());
  }

  function readHardRefreshChromeSnapshot() {
    const snapshot = { username: '', allowedPages: null, chromeCache: null };
    try { snapshot.username = String(localStorage.getItem('username') || '').trim(); } catch {}
    try {
      const allowed = JSON.parse(sessionStorage.getItem(CACHE_ALLOWED) || 'null');
      if (Array.isArray(allowed)) snapshot.allowedPages = allowed;
    } catch {}
    try {
      const chrome = JSON.parse(localStorage.getItem(CHROME_CACHE_KEY) || 'null');
      if (chrome && typeof chrome === 'object') {
        snapshot.chromeCache = chrome;
        if (!snapshot.username && chrome.name) snapshot.username = String(chrome.name || '').trim();
        if (!snapshot.allowedPages && Array.isArray(chrome.allowedPages)) snapshot.allowedPages = chrome.allowedPages;
      }
    } catch {}
    return snapshot;
  }

  function restoreHardRefreshChromeSnapshot(snapshot) {
    const safe = snapshot && typeof snapshot === 'object' ? snapshot : {};
    try {
      if (safe.username) localStorage.setItem('username', safe.username);
    } catch {}
    try {
      if (Array.isArray(safe.allowedPages)) sessionStorage.setItem(CACHE_ALLOWED, JSON.stringify(safe.allowedPages));
    } catch {}
    try {
      if (safe.chromeCache && typeof safe.chromeCache === 'object') {
        localStorage.setItem(CHROME_CACHE_KEY, JSON.stringify({ ...safe.chromeCache, savedAt: Date.now() }));
      } else if (safe.username || Array.isArray(safe.allowedPages)) {
        localStorage.setItem(CHROME_CACHE_KEY, JSON.stringify({
          name: safe.username || '',
          allowedPages: Array.isArray(safe.allowedPages) ? safe.allowedPages : [],
          savedAt: Date.now()
        }));
      }
    } catch {}
  }

  async function clearBrowserStorageForHardRefresh() {
    const chromeSnapshot = readHardRefreshChromeSnapshot();

    try {
      if (window.OpsAppCache && typeof window.OpsAppCache.clearAll === 'function') {
        window.OpsAppCache.clearAll();
      } else if (window.OpsAppCache && typeof window.OpsAppCache.clear === 'function') {
        window.OpsAppCache.clear();
      }
    } catch {}

    try { clearKnownClientDataCaches(); } catch {}
    try { sessionStorage.clear(); } catch {}
    markHardRefreshPending();
    restoreHardRefreshChromeSnapshot(chromeSnapshot);

    try {
      if (window.caches && typeof caches.keys === 'function') {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
      }
    } catch {}

    try {
      if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(async (reg) => {
          try { await reg.update(); } catch {}
          try { await reg.unregister(); } catch {}
        }));
      }
    } catch {}
  }

  async function fetchHardRefreshEndpoint() {
    const refreshUrl = `/api/hard-refresh?_fresh=1&_refresh=${encodeURIComponent(String(Date.now()))}`;
    const response = await _nativeFetch(refreshUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'X-Ops-Hard-Refresh': '1',
      },
      cache: 'no-store',
    });

    if (!response || !response.ok) {
      const err = await response?.json?.().catch(() => ({}));
      throw new Error(err?.error || 'Failed to clear server cache.');
    }

    return response.json().catch(() => ({ success: true }));
  }

  async function runOpsHardRefresh(triggerButton) {
    if (__opsHardRefreshRunning) return;
    __opsHardRefreshRunning = true;

    try {
      if (triggerButton) {
        triggerButton.disabled = true;
        triggerButton.classList.add('is-loading');
        const label = triggerButton.querySelector('.umi-label');
        if (label) label.textContent = 'Refreshing…';
      }
    } catch {}

    try { window.__opsCloseUserMenu && window.__opsCloseUserMenu(); } catch {}

    try {
      // Do not show a separate full-screen loader while clearing browser/Upstash
      // cache. The only visible Hard Refresh loader should be the post-reload
      // dashboard loader, where the sidebar/header shell is already present.
      await clearBrowserStorageForHardRefresh();
      await fetchHardRefreshEndpoint();
      reloadFreshAfterHardRefresh();
    } catch (error) {
      console.error('Hard refresh failed:', error);
      __opsHardRefreshRunning = false;
      hideHardRefreshOverlay();
      try {
        if (triggerButton) {
          triggerButton.disabled = false;
          triggerButton.classList.remove('is-loading');
          const label = triggerButton.querySelector('.umi-label');
          if (label) label.textContent = 'Hard Refresh';
        }
      } catch {}
      try {
        if (window.UI && typeof window.UI.toast === 'function') {
          window.UI.toast({
            type: 'error',
            title: 'Refresh failed',
            message: error?.message || 'Could not clear the server cache.',
          });
        } else {
          alert(error?.message || 'Could not clear the server cache.');
        }
      } catch { alert(error?.message || 'Could not clear the server cache.'); }
    }
  }

  window.OpsHardRefresh = {
    run: runOpsHardRefresh,
    show: showHardRefreshOverlay,
    hide: hideHardRefreshOverlay,
  };

  // Capture-phase fallback: guarantees Hard Refresh works even if the user-menu
  // panel was created before this script re-bound its internal delegated handler.
  if (!window.__opsHardRefreshClickBound) {
    window.__opsHardRefreshClickBound = true;
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-user-menu-action="hard-refresh"]') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      runOpsHardRefresh(btn);
    }, true);
  }

  const __opsFreshApiLoad = pageForcesFreshApiRequests();
  const __opsPostLoginBootLoad = hasRecentPostLoginBootMarker();
  const __opsLoginSplashLoad = hasRecentLoginSplashMarker();

  if (__opsFreshApiLoad || __opsPostLoginBootLoad || __opsLoginSplashLoad) {
    // During the first page load after Hard Refresh OR after Login, keep the
    // overlay visible until the stable header/sidebar and persistent shell are
    // ready. This prevents the user from seeing the temporary legacy Dashboard
    // chrome while the app is still booting.
    beginFreshLoadOverlayIfNeeded();

    window.setTimeout(() => {
      if (__opsFreshApiLoad) {
        clearTransientRefreshParams();
        clearHardRefreshPending();
      }
      if (__opsPostLoginBootLoad) clearPostLoginBootPending();
      if (__opsLoginSplashLoad) clearLoginSplashPending();
    }, 60000);
  }

  // =====================================================
  // UI Redesign helpers
  // - Sidebar tooltips when labels are hidden
  // - Ensure every page has a main header
  // - Convert the existing header to the "Dashboard" topbar style
  //   (title + search + bell + user)
  // =====================================================

  function ensureNavTooltips(){
    document.querySelectorAll('.sidebar .nav-link').forEach((a) => {
      try {
        const lbl = a.querySelector('.nav-label');
        const text = (lbl && lbl.textContent) ? String(lbl.textContent).trim() : '';
        if (text && !a.getAttribute('title')) a.setAttribute('title', text);
      } catch {}
    });
  }

  function ensureMainHeaderExists(){
    // Some pages (e.g. tasks.html) intentionally shipped without a main header.
    // The redesign requires a consistent header on all pages.
    if (document.querySelector('.main-header')) return;

    const main = document.querySelector('.main-content');
    if (!main) return;

    const header = document.createElement('header');
    header.className = 'main-header';

    const row1 = document.createElement('div');
    row1.className = 'header-row1';

    const left = document.createElement('div');
    left.className = 'left';

    const right = document.createElement('div');
    right.className = 'right topbar-right';

    // Account shortcut (will be restyled as avatar in the green header)
    const acc = document.createElement('a');
    acc.className = 'account-mini';
    acc.href = '/account';
    acc.title = 'My account';
    acc.setAttribute('aria-label', 'My account');
    acc.innerHTML = `
      <span class="ico-circle"><img src="/images/logo.png" alt="Logo" /></span>
      <span class="label">My account</span>
    `;

    right.appendChild(acc);
    row1.appendChild(left);
    row1.appendChild(right);

    const row2 = document.createElement('div');
    row2.className = 'header-row2';
    const h1 = document.createElement('h1');
    h1.className = 'page-title';
    h1.textContent = (document.title || 'Dashboard').trim();
    row2.appendChild(h1);

    header.appendChild(row1);
    header.appendChild(row2);

    // Insert at the top of main content
    main.insertBefore(header, main.firstChild);
  }


  function ensureMainBarTitleLabelStyle(){
    if (document.getElementById('ops-mainbar-title-label-style')) return;
    const style = document.createElement('style');
    style.id = 'ops-mainbar-title-label-style';
    style.textContent = `
      .main-header .dash-title{
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: auto !important;
        min-width: 0 !important;
        max-width: min(46vw, 420px) !important;
        min-height: 42px !important;
        padding: 0 18px !important;
        border-radius: 999px !important;
        background: #FFFFFF !important;
        border: 1px solid rgba(226,232,240,0.94) !important;
        color: #0F172A !important;
        box-shadow: 0 10px 24px rgba(15,23,42,0.08) !important;
        flex: 0 1 auto !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      .main-header .dash-title:empty{ display: none !important; }
      @media (max-width: 768px){
        .main-header .dash-title{
          max-width: min(52vw, 280px) !important;
          min-height: 40px !important;
          padding: 0 14px !important;
          font-size: clamp(15px, 4.2vw, 18px) !important;
        }
      }
      @media (max-width: 420px){
        .main-header .dash-title{
          max-width: 42vw !important;
          min-height: 38px !important;
          padding: 0 12px !important;
          font-size: 15px !important;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureDashboardHeaderLayout(){
    const header = document.querySelector('.main-header');
    if (!header) return;

    ensureMainBarTitleLabelStyle();
    header.classList.add('dash-header');

    const row1 = header.querySelector('.header-row1');
    if (!row1) return;

    const left = row1.querySelector('.left') || row1;
    const right = row1.querySelector('.right') || row1;

    // Remove old injected green header nodes if they exist (from older builds)
    try { left.querySelectorAll('.gh-lead-btn').forEach(n => n.remove()); } catch {}
    try { header.querySelectorAll('.gh-wave').forEach(n => n.remove()); } catch {}

    // Page title text: prefer existing page-title
    const pageTitleEl = header.querySelector('.header-row2 .page-title') || header.querySelector('.page-title');
    const pageTitleText = (pageTitleEl && pageTitleEl.textContent) ? String(pageTitleEl.textContent).trim() : (document.title || 'Dashboard').trim();

    // Ensure left title exists
    // ✅ Requirement: "ال logo icon ... تكون شمال العنوان مش يمين"
    // We want the header logo button (#menu-toggle) to appear BEFORE the title.
    let dashTitle = left.querySelector('.dash-title');
    const menuBtn = left.querySelector('#menu-toggle');

    if (!dashTitle) {
      dashTitle = document.createElement('div');
      dashTitle.className = 'dash-title';

      // If the logo toggle exists, insert the title after it.
      if (menuBtn && menuBtn.parentElement === left) {
        left.insertBefore(dashTitle, menuBtn.nextSibling);
      } else {
        left.insertBefore(dashTitle, left.firstChild);
      }
    }

    // Enforce final order: [menu-toggle] [title] [search]
    if (menuBtn && menuBtn.parentElement === left && dashTitle && dashTitle.parentElement === left) {
      if (menuBtn.nextSibling !== dashTitle) {
        left.insertBefore(menuBtn, dashTitle);
      }
    }

    dashTitle.textContent = pageTitleText || 'Dashboard';

    // Hide the old greeting pill (kept in DOM for old pages, but not part of the new header)
    const greeting = left.querySelector('.greeting-pill');
    if (greeting) greeting.style.display = 'none';

    // Ensure searchbar exists; move it into the left group
    const existingSearch = header.querySelector('.searchbar');
    if (existingSearch && existingSearch.parentElement !== left) {
      left.appendChild(existingSearch);
    }

    if (!left.querySelector('.searchbar')) {
      const sb = document.createElement('div');
      sb.className = 'searchbar';
      sb.setAttribute('role', 'search');
      sb.innerHTML = `
        <i data-feather="search"></i>
        <input type="search" placeholder="Search" aria-label="Search" />
      `;
      left.appendChild(sb);
    }

    // Move notif + user to the right group if they exist already
    const notifWrap = header.querySelector('.notif-wrap');
    if (notifWrap && notifWrap.parentElement !== right) {
      right.insertBefore(notifWrap, right.firstChild);
    }

    const user = header.querySelector('.header-user') || header.querySelector('a.account-mini');
    if (user && user.parentElement !== right) {
      right.appendChild(user);
    }

    // Hide row2 completely (page title is now in the top row)
    header.classList.add('dash-hide-row2');

    if (window.feather) {
      try { window.feather.replace(); } catch {}
    }
  }

  // ====== Sidebar Branding + Profile + Settings ======
  function setupLmsWorkspaceTransition(){
    if (window.__LMS_WORKSPACE_TRANSITION__) return;
    window.__LMS_WORKSPACE_TRANSITION__ = true;

    const isLmsPage = document.body?.classList?.contains('page-lms') || window.location.pathname.replace(/\/+$/, '').startsWith('/lms');

    // Run the entrance motion after the initial layout is ready.
    document.body.classList.add('workspace-switch-enter');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => document.body.classList.add('workspace-switch-enter-active'));
    });
    window.setTimeout(() => {
      document.body.classList.remove('workspace-switch-enter', 'workspace-switch-enter-active');
    }, 620);

    const transitionTo = (href, direction) => {
      if (document.body.classList.contains('workspace-switch-leaving')) return;
      document.body.classList.add('workspace-switch-leaving', direction === 'lms' ? 'workspace-switch-to-lms' : 'workspace-switch-to-main');
      window.setTimeout(() => window.location.assign(href), 330);
    };

    document.addEventListener('click', (event) => {
      const anchor = event.target.closest('a[href]');
      if (!anchor) return;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (anchor.hasAttribute('download')) return;
      const target = String(anchor.getAttribute('target') || '').toLowerCase();
      if (target && target !== '_self') return;

      const path = sidebarPath(anchor.getAttribute('href') || anchor.href || '');
      const isMainToLms = !isLmsPage && path === '/lms';
      const isLmsToMain = isLmsPage && anchor.classList.contains('lms-sidebar-back');
      if (!isMainToLms && !isLmsToMain) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      transitionTo(isMainToLms ? '/lms' : '/home', isMainToLms ? 'lms' : 'main');
    }, true);
  }

  function ensureSidebarBranding(){
    const header = document.querySelector('.sidebar .sidebar-header');
    if (!header) return;

    const isLmsWorkspace = document.body?.classList?.contains('page-lms') || window.location.pathname.replace(/\/+$/, '').startsWith('/lms');
    if (isLmsWorkspace) {
      const h2 = header.querySelector('h2');
      if (h2) h2.style.display = 'none';
      header.querySelectorAll('#sidebar-logo-toggle, img.sidebar-brand-logo').forEach((el) => el.remove());
      let back = header.querySelector('.lms-sidebar-back');
      if (!back) {
        back = document.createElement('a');
        back.className = 'lms-sidebar-back';
        back.href = '/home';
        back.setAttribute('aria-label', 'Back to main workspace');
        back.setAttribute('title', 'Back to main workspace');
        back.innerHTML = '<i data-feather="arrow-left"></i>';
        header.insertBefore(back, header.firstChild);
      }
      return;
    }

    // Visually separate the two workspace switches (Home + LMS) from ERP pages.
    const lmsLink = document.querySelector('.sidebar a[href="/lms"]');
    const lmsItem = lmsLink?.closest('li');
    if (lmsItem) lmsItem.classList.add('sidebar-workspace-boundary');

    // Replace the "Dashboard" title with the company orange logo.
    // (Do not rely on editing every HTML page.)
    const h2 = header.querySelector('h2');
    if (h2) {
      // Keep for accessibility, but do not show the text.
      h2.setAttribute('aria-label', (h2.textContent || 'Dashboard').trim());
      h2.textContent = '';
      h2.style.display = 'none';
    }
    // Remove legacy single-logo implementation (older builds)
    const legacyLogo = header.querySelector('img.sidebar-brand-logo');
    if (legacyLogo) {
      try { legacyLogo.remove(); } catch {}
    }

    // Insert a brand toggle that can animate between:
    // - Full horizontal logo (sidebar open)
    // - Icon logo (sidebar mini)
    let brandToggle = header.querySelector('#sidebar-logo-toggle');
    if (!brandToggle) {
      brandToggle = document.createElement('div');
      brandToggle.className = 'sidebar-brand-toggle';
      brandToggle.id = 'sidebar-logo-toggle';
      brandToggle.innerHTML = `
        <img class="brand-logo-full" src="/images/Logo%20horizontal.png" alt="Company logo" />
        <img class="brand-logo-icon" src="/images/logo.png" alt="" aria-hidden="true" />
      `;
      header.insertBefore(brandToggle, header.firstChild);
    }

    // Make brand toggle act as the sidebar toggle (replaces the arrow button)
    brandToggle.setAttribute('role', 'button');
    brandToggle.setAttribute('tabindex', '0');
    brandToggle.setAttribute('aria-label', 'Toggle dashboard');

    if (!brandToggle.dataset.boundToggle) {
      brandToggle.dataset.boundToggle = '1';
      brandToggle.addEventListener('click', (e) => toggleSidebar(e));
      brandToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleSidebar(e);
        }
      });
    }
  }

  function ensureSidebarProfile(){
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return null;

    // ✅ New requirement:
    // "عاوز اشيل الصورة اللي في ال sidebar خالص"
    // We intentionally do NOT inject the sidebar profile/avatar anymore.
    // If an older build injected it before, remove it.
    try {
      const existing = sidebar.querySelector('.sidebar-profile');
      if (existing) existing.remove();
    } catch {}
    return null;
  }

  function initialsFromName(name){
    const n = String(name || '').trim();
    if (!n) return '';
    const parts = n.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || '';
    const last  = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
    return (first + last).toUpperCase();
  }

  function renderSidebarProfile({ name = '', position = '', department = '', photoUrl = '' } = {}){
    const profile = ensureSidebarProfile();
    if (!profile) return;

    const elName = profile.querySelector('[data-sidebar-name]');
    const elRole = profile.querySelector('[data-sidebar-role]');
    const img    = profile.querySelector('.sidebar-profile__img');
    const fb     = profile.querySelector('.sidebar-profile__fallback');

    const safeName = String(name || '').trim() || getCachedName() || 'User';
    const safeRole = String(position || '').trim() || String(department || '').trim();

    if (elName) elName.textContent = safeName;
    if (elRole) elRole.textContent = safeRole;

    const initials = initialsFromName(safeName);

    // Show image if we have a URL, otherwise show initials fallback.
    if (img) {
      if (photoUrl) {
        img.src = photoUrl;
        img.style.display = 'block';
        img.setAttribute('alt', safeName + ' photo');
        if (fb) fb.style.display = 'none';
      } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        if (fb) {
          fb.textContent = initials || '';
          fb.style.display = 'grid';
        }
      }
    }
  }

  function shortDisplayName(name){
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'User';
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1] || '';
    const lastInitial = last ? String(last[0]).toUpperCase() : '';
    return `${parts[0]} ${lastInitial}`.trim();
  }

  function renderHeaderUser({ name = '', photoUrl = '' } = {}){
    const header = document.querySelector('.main-header');
    if (!header) return;

    const right = header.querySelector('.header-row1 .right') || header.querySelector('.header-row1') || header;
    if (!right) return;

    const safeName = String(name || '').trim() || getCachedName() || 'User';

    // Prefer an existing link (account-mini) so we don't duplicate
    let link = header.querySelector('a.header-user') || header.querySelector('a.account-mini');

    if (!link) {
      link = document.createElement('a');
      link.href = '/account';
      link.setAttribute('aria-label', 'Account');
      right.appendChild(link);
    }

    link.classList.remove('account-mini');
    link.classList.add('header-user');
    link.removeAttribute('href');
    link.setAttribute('role', 'button');
    link.setAttribute('tabindex', '0');
    link.dataset.userMenuTrigger = '1';
    link.title = safeName;

    const initials = initialsFromName(safeName) || '';
    const avatarHtml = photoUrl
      ? `<img class="header-user__img" src="${escapeAttr(photoUrl)}" alt="${escapeAttr(safeName)}" />`
      : `<div class="header-user__fallback" aria-hidden="true">${escapeHtml(initials)}</div>`;

    // Requested: top-right profile trigger should be icon only (no name next to it)
    link.innerHTML = `
      <span class="header-user__avatar">${avatarHtml}</span>
    `;
  }

  function ensureSettingsLink(){
    // Add a settings action above logout → opens account info
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    const footer = sidebar.querySelector('.sidebar-footer');
    if (!footer) return;

    const logout = footer.querySelector('#logoutBtn');
    let settings = footer.querySelector('#sidebarSettings');
    if (!settings) {
      settings = document.createElement('a');
      settings.id = 'sidebarSettings';
      settings.className = 'logout-btn settings-btn';
      settings.href = '/account';
      settings.innerHTML = `<i data-feather="settings"></i> Settings`;
      if (logout) footer.insertBefore(settings, logout);
      else footer.appendChild(settings);
    }

    // On mobile, close sidebar when navigating
    settings.addEventListener('click', () => {
      if (!isMobile()) return;
      document.body.classList.add('sidebar-collapsed');
      setAria();
    });
  }

  // Remove Settings/Logout from the left sidebar footer (we use the top user menu instead)
  function stripSidebarFooterActions(){
    const footer = document.querySelector('.sidebar .sidebar-footer');
    if (!footer) return;
    try {
      footer.querySelectorAll('#sidebarSettings, #logoutBtn').forEach(el => el.remove());
    } catch {}
    try {
      footer.querySelectorAll('a.settings-btn, button.settings-btn, a.logout-btn, button.logout-btn').forEach(el => el.remove());
    } catch {}
    // If footer is now empty, hide it to avoid blank space
    try {
      if (!footer.querySelector('a,button')) footer.style.display = 'none';
    } catch {}
  }

// ====== Mobile Sidebar UX (hamburger button + backdrop) ======
// Goal:
// - On mobile: sidebar is collapsed by default.
// - Provide a top-left button to open it.
// - Clicking anywhere outside (backdrop) closes it.
function ensureSidebarBackdrop(){
  let backdrop = document.querySelector('.sidebar-backdrop');
  if (!backdrop){
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.id = 'sidebar-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);
  }

  // Close when tapping outside the sidebar (mobile only)
  // Note: CSS already shows/hides backdrop via body.sidebar-collapsed
  backdrop.addEventListener('click', () => {
    if (!isMobile()) return;
    if (document.body.classList.contains('sidebar-collapsed')) return;
    document.body.classList.add('sidebar-collapsed');
    setAria();
  });

  return backdrop;
}

function ensureMenuToggle(){
  let btn = document.getElementById('menu-toggle');
  if (btn) {
    // If it already exists from an older build, normalize it to the logo button
    btn.setAttribute('aria-label', 'Toggle dashboard');
    if (!btn.querySelector('img.menu-toggle-logo')) {
      btn.innerHTML = '<img class="menu-toggle-logo" src="/images/logo.png" alt="" />';
    }
    return btn;
  }

  // Put the button at the top-left inside the header (if header exists)
  const target =
    document.querySelector('.main-header .header-row1 .left') ||
    document.querySelector('.main-header .header-row1') ||
    document.querySelector('.main-header');

  if (!target) return null;

  btn = document.createElement('button');
  btn.id = 'menu-toggle';
  btn.type = 'button';
  btn.className = 'menu-toggle';
  btn.setAttribute('aria-label', 'Toggle dashboard');
  btn.innerHTML = '<img class="menu-toggle-logo" src="/images/logo.png" alt="" />';

  target.insertBefore(btn, target.firstChild);
  return btn;
}


function relocateAccountLink(){
  // Move the "My account" button from the top header into the sidebar footer,
  // and render it as a Settings action (above Logout).
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const footer = sidebar.querySelector('.sidebar-footer');
  if (!footer) return;

  const accountLink =
    document.querySelector('.account-mini[href="/account"]') ||
    document.querySelector('.account-mini[href="/account/"]') ||
    document.querySelector('a.account-mini');

  if (!accountLink) return;

  // Convert to a settings-style link (icon + label)
  const styleAsSettings = () => {
    accountLink.id = 'sidebarSettings';
    accountLink.href = '/account';
    accountLink.setAttribute('aria-label', 'Account settings');
    accountLink.classList.remove('account-mini', 'account-in-sidebar');
    accountLink.classList.add('logout-btn', 'settings-btn');
    accountLink.innerHTML = `<i data-feather="settings"></i> Settings`;
  };

  // If it's already in the footer, just ensure order (above Logout)
  const logout = footer.querySelector('#logoutBtn');
  if (footer.contains(accountLink)) {
    if (logout && logout.parentNode === footer) {
      footer.insertBefore(accountLink, logout);
    }
    styleAsSettings();
    return;
  }

  // Detach from header and place in footer above logout
  if (logout && logout.parentNode === footer) footer.insertBefore(accountLink, logout);
  else footer.appendChild(accountLink);

  styleAsSettings();
}

// Inject only on pages that have the sidebar layout
if (document.querySelector('.sidebar')) {
  ensureSidebarBackdrop();
  menuToggle = ensureMenuToggle();
  ensureSidebarBranding();
  setupLmsWorkspaceTransition();

  // Remove the old arrow toggle button (we toggle via the company logo instead)
  if (sidebarToggle) {
    try { sidebarToggle.remove(); } catch {}
    sidebarToggle = null;
  }
  ensureSidebarProfile();
  // Removed: Settings/Logout in sidebar footer (use top-right user menu)
  stripSidebarFooterActions();
  if (window.feather) feather.replace();
}


  // ====== Access control (show/hide links) ======
  // مفاتيح lowercase للمقارنة الثابتة
  const PAGE_SELECTORS = {
    // ===== Orders =====
    'current orders': 'a[href="/orders"]',
    'create new order': 'a[href="/orders/new"]',
    'shopping cart': 'a[href="/orders/new"]',
    'cart': 'a[href="/orders/new"]',
    'stocktaking': 'a[href="/stocktaking"]',
    'products': 'a[href="/products"]',
    'product': 'a[href="/products"]',
    'components': 'a[href="/products"]',
    'lms': 'a[href="/lms"]',
    'learning management system': 'a[href="/lms"]',
    'proposals': 'a[href="/proposals"]',
    'proposal': 'a[href="/proposals"]',
    'kits': 'a[href="/kits"]',
    'product kits': 'a[href="/kits"]',
    'saved kits': 'a[href="/kits"]',
    'saved quotations': 'a[href="/proposals"]',
    'task management': 'a[href="/task-management"]',
    'task-management': 'a[href="/task-management"]',
    'taskmanagement': 'a[href="/task-management"]',
    'department tickets': 'a[href="/task-management"]',
    'department-tickets': 'a[href="/task-management"]',
    'departmenttickets': 'a[href="/task-management"]',
    'all tasks': 'a[href="/task-management"]',
    'all task': 'a[href="/task-management"]',
    'my tasks': 'a[href="/task-management"]',
    'my task': 'a[href="/task-management"]',
    'delegated tasks': 'a[href="/task-management"]',
    'delegated task': 'a[href="/task-management"]',
    'kpis': 'a[href="/kpis"]',
    'kpi': 'a[href="/kpis"]',
    'key performance indicators': 'a[href="/kpis"]',
    'history': 'a[href="/history"]',
    'system history': 'a[href="/history"]',
    'backup': 'a[href="/backup"]',
    'back up': 'a[href="/backup"]',
    'database': 'a[href="/backup"]',
    'system database': 'a[href="/backup"]',
    'system backup': 'a[href="/backup"]',

    'requested orders': 'a[href="/orders/requested"]',
    'schools requested orders': 'a[href="/orders/requested"]',
    'maintenance orders': 'a[href="/orders/maintenance-orders"]',

    // ===== Events parent + independently authorized child pages =====
    'events': 'a[href="/events"]',
    'event calendar': 'a[href="/events/calendar"]',
    'events calendar': 'a[href="/events/calendar"]',
    'event requests': 'a[href="/events/requests"]',
    'event components': 'a[href="/events/components"]',

    // Orders Review (formerly: "S.V schools orders")
    'orders review': 'a[href="/orders/sv-orders"]',
    's.v schools orders': 'a[href="/orders/sv-orders"]',

    // ===== B2B =====
    'b2b': 'a[href="/b2b"]',

    // ===== B2C parent + independently authorized child pages =====
    'b2c': 'a[href="/b2c"]',
    'customer database': 'a[href="/b2c/database"]',
    'b2c customer database': 'a[href="/b2c/database"]',
    'customer form': 'a[href="/b2c/form"]',
    'b2c customer form': 'a[href="/b2c/form"]',

    // ===== Expenses =====
    'my expenses': 'a[href="/expenses"]',
    'expenses': 'a[href="/expenses"]',

    'expenses users': 'a[href^="/expenses/users"]',
    'expenses by user': 'a[href^="/expenses/users"]',

    // ===== Users Center =====
    'users center': 'a[href="/user-access"]',
    'user center': 'a[href="/user-access"]',
    'users centre': 'a[href="/user-access"]',
    'user centre': 'a[href="/user-access"]',
    'user access & data': 'a[href="/user-access"]',
    'user access': 'a[href="/user-access"]',
    'user access and data': 'a[href="/user-access"]',
    'users access': 'a[href="/user-access"]',
    'team members': 'a[href="/user-access"]',
    'teams members': 'a[href="/user-access"]'
  };

  const toKey = (s) => String(s || '').trim().toLowerCase();
  const normPath = (s) => toKey(s).replace(/\/+$/, ''); // يشيل / في الآخر لو موجود

  // Page access is the source of truth. The legacy allowed-pages list can be
  // stale after a newly added app_pages record is enabled for a user, so merge
  // every enabled page-access row before filtering the sidebar.
  function enabledPageAccessRows(pageAccess) {
    const rows = Array.isArray(pageAccess?.pages)
      ? pageAccess.pages
      : (Array.isArray(pageAccess) ? pageAccess : []);

    return rows.filter((row) => {
      if (!row) return false;
      return row.isEnabled !== false && row.is_enabled !== false && row.enabled !== false;
    });
  }

  function addAllowedPageValue(target, value) {
    const clean = String(value || '').trim();
    if (!clean) return;
    const exists = target.some((item) => normPath(item) === normPath(clean) || toKey(item) === toKey(clean));
    if (!exists) target.push(clean);
  }

  function mergePageAccessIntoAllowedPages(allowed, pageAccess) {
    const merged = Array.isArray(allowed) ? allowed.slice() : [];

    enabledPageAccessRows(pageAccess).forEach((row) => {
      // Add all identifiers because older app_pages views sometimes return only
      // one of page_name, page_key, or route_path for an enabled page.
      [
        row.pageName, row.page_name,
        row.pageKey, row.page_key,
        row.routePath, row.route_path,
        ...(Array.isArray(row.aliases) ? row.aliases : []),
      ].forEach((value) => addAllowedPageValue(merged, value));

      // Task Management and Events sub-pages are intentionally independent.
      // Only their legacy broad parent pages expand into all child entries.
      const tokens = [row.pageName, row.page_name, row.pageKey, row.page_key, row.routePath, row.route_path]
        .map((value) => String(value || '').toLowerCase().replace(/[^a-z0-9/]+/g, ''))
        .filter(Boolean);
      if (tokens.some((value) => ['taskmanagement', 'departmenttickets', '/taskmanagement', '/departmenttickets'].includes(value))) {
        ['Task Management', 'All Tasks', 'My Tasks', 'Delegated Tasks', '/task-management', '/task-management/all-tasks', '/task-management/my-tasks', '/task-management/delegated-tasks'].forEach((value) => addAllowedPageValue(merged, value));
      } else if (tokens.some((value) => ['alltasks', 'taskmanagementalltasks', '/taskmanagement/alltasks'].includes(value))) {
        ['All Tasks', '/task-management/all-tasks'].forEach((value) => addAllowedPageValue(merged, value));
      } else if (tokens.some((value) => ['mytasks', 'taskmanagementmytasks', '/taskmanagement/mytasks'].includes(value))) {
        ['My Tasks', '/task-management/my-tasks'].forEach((value) => addAllowedPageValue(merged, value));
      } else if (tokens.some((value) => ['delegatedtasks', 'taskmanagementdelegatedtasks', '/taskmanagement/delegatedtasks'].includes(value))) {
        ['Delegated Tasks', '/task-management/delegated-tasks'].forEach((value) => addAllowedPageValue(merged, value));
      } else if (tokens.some((value) => ['events', '/events'].includes(value))) {
        ['Events', 'Event Calendar', 'Event Requests', 'Event Components', '/events', '/events/calendar', '/events/requests', '/events/components'].forEach((value) => addAllowedPageValue(merged, value));
      } else if (tokens.some((value) => ['eventcalendar', 'eventscalendar', '/events/calendar'].includes(value))) {
        ['Event Calendar', '/events/calendar'].forEach((value) => addAllowedPageValue(merged, value));
      } else if (tokens.some((value) => ['eventrequests', '/events/requests'].includes(value))) {
        ['Event Requests', '/events/requests'].forEach((value) => addAllowedPageValue(merged, value));
      } else if (tokens.some((value) => ['eventcomponents', '/events/components'].includes(value))) {
        ['Event Components', '/events/components'].forEach((value) => addAllowedPageValue(merged, value));
            } else if (tokens.some((value) => ['b2c', '/b2c', 'businesstocustomer'].includes(value))) {
        ['B2C', 'Customer Database', 'Customer Form', '/b2c', '/b2c/database', '/b2c/form'].forEach((value) => addAllowedPageValue(merged, value));
      } else if (tokens.some((value) => ['customerdatabase', 'b2ccustomerdatabase', '/b2c/database'].includes(value))) {
        ['Customer Database', '/b2c/database'].forEach((value) => addAllowedPageValue(merged, value));
      } else if (tokens.some((value) => ['customerform', 'b2ccustomerform', '/b2c/form'].includes(value))) {
        ['Customer Form', '/b2c/form'].forEach((value) => addAllowedPageValue(merged, value));
      }
    });

    return merged;
  }

  // IMPORTANT:
  // Our sidebar layout CSS uses `display: flex !important` on `<li>` items.
  // Normal inline `style.display = 'none'` will NOT override it.
  // So we must set display with the `important` priority.
  function hideEl(el){
    if (!el) return;
    try { el.style.setProperty('display', 'none', 'important'); } catch { el.style.display = 'none'; }
    el.setAttribute('aria-hidden','true');
  }
  function showEl(el){
    if (!el) return;
    try { el.style.removeProperty('display'); } catch { el.style.display = ''; }
    el.removeAttribute('aria-hidden');
  }

  function syncUserMenuPageAccess(allowed){
    const hasHistoryAccess = hasAllowedPage(allowed || [], ['History', 'System History', '/history']);
    const hasBackupAccess = hasAllowedPage(allowed || [], ['Backup', 'Back up', 'Database', 'System Database', 'System Backup', '/backup']);
    try {
      document.querySelectorAll('[data-user-menu-action="history"]').forEach((item) => {
        if (hasHistoryAccess) showEl(item);
        else hideEl(item);
      });
      document.querySelectorAll('[data-user-menu-action="backup"]').forEach((item) => {
        if (hasBackupAccess) showEl(item);
        else hideEl(item);
      });
    } catch {}
  }

  const EVENTS_SUBPAGE_CONFIG = Object.freeze([
    { key: 'calendar', name: 'Event Calendar', route: '/events/calendar', label: 'Calendar', icon: 'calendar' },
    { key: 'requests', name: 'Event Requests', route: '/events/requests', label: 'Event Requests', icon: 'clipboard' },
    { key: 'components', name: 'Event Components', route: '/events/components', label: 'Event Components', icon: 'layers' },
  ]);

  function eventSubpagesAllowed(allowed = []) {
    const set = new Set((allowed || []).flatMap((value) => {
      const raw = String(value || '').trim();
      const normalized = normPath(raw);
      return [toKey(raw), normalized, normalized.startsWith('/') ? normalized.slice(1) : `/${normalized}`];
    }));
    const legacyBroad = set.has('events') || set.has('/events');
    return EVENTS_SUBPAGE_CONFIG.filter((page) => legacyBroad || set.has(toKey(page.name)) || set.has(normPath(page.route)));
  }

  function ensureEventsSubpageFlyout() {
    let panel = document.getElementById('events-subpage-flyout');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'events-subpage-flyout';
    panel.className = 'events-subpage-flyout';
    panel.hidden = true;
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', 'Events pages');
    document.body.appendChild(panel);
    return panel;
  }

  function closeEventsSubpageFlyout() {
    const panel = document.getElementById('events-subpage-flyout');
    if (!panel) return;
    panel.hidden = true;
    panel.classList.remove('is-open');
    try { document.querySelector('a.nav-link[href="/events"]')?.setAttribute('aria-expanded', 'false'); } catch {}
  }

  function renderEventsSubpageFlyout(pages = [], trigger) {
    const panel = ensureEventsSubpageFlyout();
    if (!pages.length || !trigger) return closeEventsSubpageFlyout();
    const current = sidebarPath(window.location.pathname);
    panel.innerHTML = `
      <div class="events-subpage-flyout__list">
        ${pages.map((page) => `
          <a class="events-subpage-flyout__link${current === page.route || current.startsWith(`${page.route}/`) ? ' is-active' : ''}" href="${page.route}" role="menuitem">
            <i data-feather="${page.icon}"></i><span>${page.label}</span>
          </a>
        `).join('')}
      </div>
    `;
    const rect = trigger.getBoundingClientRect();
    // Dock the child-page window immediately to the right of the Events icon.
    // This gives the same nested-sidebar feeling in both expanded and compact
    // sidebar layouts without covering the parent item.
    const left = Math.min(window.innerWidth - 236, Math.max(12, rect.right + 10));
    const top = Math.min(window.innerHeight - 210, Math.max(12, rect.top - 10));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.hidden = false;
    panel.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    if (window.feather) feather.replace({ width: 17, height: 17 });
  }

  function syncEventsSubpageNavigation(allowed = []) {
    const pages = eventSubpagesAllowed(allowed);
    const parent = document.querySelector('a.nav-link[href="/events"]');
    const parentLi = parent?.closest('li');
    const allowedRoutes = new Set(pages.map((page) => page.route));

    // The single parent icon appears whenever the user has one or more child pages.
    if (parent) {
      if (pages.length) showEl(parentLi || parent);
      else hideEl(parentLi || parent);
      parent.dataset.eventsSubpageCount = String(pages.length);
      // Keep the canonical parent href stable. This is important because the
      // permission filter and sidebar order both identify the parent by /events.
      parent.href = '/events';
      parent.setAttribute('aria-haspopup', pages.length > 1 ? 'menu' : 'false');
      parent.setAttribute('aria-expanded', 'false');
      parent.title = pages.length === 1 ? `Events · ${pages[0].label}` : 'Events';
      parent.setAttribute('aria-label', parent.title);
      if (!parent.dataset.eventsSubpageBound) {
        parent.dataset.eventsSubpageBound = '1';
        parent.addEventListener('click', (event) => {
          const currentPages = eventSubpagesAllowed(getCachedAllowedPages() || []);
          if (!currentPages.length) return;
          event.preventDefault();
          event.stopPropagation();
          if (currentPages.length === 1) {
            window.location.assign(currentPages[0].route);
            return;
          }
          const flyout = document.getElementById('events-subpage-flyout');
          if (flyout?.classList.contains('is-open')) closeEventsSubpageFlyout();
          else renderEventsSubpageFlyout(currentPages, parent);
        });
      }
    }

    // Keep any optional Event-page action links aligned with the matching child-page access.
    document.querySelectorAll('a[href="/events/new"], a[href="/events/requests"][data-events-optional], a[href="/events/components"][data-events-optional]').forEach((link) => {
      const route = sidebarPath(link.getAttribute('href') || '');
      const pageRoute = route === '/events/new' ? '/events/requests' : route;
      const allowedForLink = allowedRoutes.has(pageRoute);
      const holder = link.closest('.events-subnav__link') || link;
      if (allowedForLink) showEl(holder);
      else hideEl(holder);
    });

    // Calendar-only users may view the schedule but cannot create or open the
    // request workspace. Keep this control out of their view.
    document.querySelectorAll('#eventsCalendarAddNew, a[href="/events/requests"][data-events-calendar-open-requests]').forEach((el) => {
      if (allowedRoutes.has('/events/requests')) showEl(el);
      else hideEl(el);
    });

    const currentRoute = sidebarPath(window.location.pathname);
    if (currentRoute.startsWith('/events/') && !allowedRoutes.has(currentRoute) && currentRoute !== '/events/new' && currentRoute !== '/events/components/new') {
      // Route protection on the server remains authoritative; this only prevents
      // a stale cached client UI from presenting inaccessible child tabs.
      closeEventsSubpageFlyout();
    }
  }

  const TASK_MANAGEMENT_SUBPAGE_CONFIG = Object.freeze([
    { key: 'all-tasks', name: 'All Tasks', route: '/task-management/all-tasks', label: 'All Tasks', icon: 'layers' },
    { key: 'my-tasks', name: 'My Tasks', route: '/task-management/my-tasks', label: 'My Tasks', icon: 'check-square' },
    { key: 'delegated-tasks', name: 'Delegated Tasks', route: '/task-management/delegated-tasks', label: 'Delegated Tasks', icon: 'send' },
  ]);

  function taskManagementSubpagesAllowed(allowed = []) {
    const set = new Set((allowed || []).flatMap((value) => {
      const raw = String(value || '').trim();
      const normalized = normPath(raw);
      return [toKey(raw), normalized, normalized.startsWith('/') ? normalized.slice(1) : `/${normalized}`];
    }));
    const legacyBroad = set.has('task management') || set.has('taskmanagement') || set.has('/task-management');
    return TASK_MANAGEMENT_SUBPAGE_CONFIG.filter((page) => legacyBroad || set.has(toKey(page.name)) || set.has(normPath(page.route)));
  }

  function ensureTaskManagementSubpageFlyout() {
    let panel = document.getElementById('task-management-subpage-flyout');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'task-management-subpage-flyout';
    panel.className = 'task-management-subpage-flyout';
    panel.hidden = true;
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', 'Task Management pages');
    document.body.appendChild(panel);
    return panel;
  }

  function closeTaskManagementSubpageFlyout() {
    const panel = document.getElementById('task-management-subpage-flyout');
    if (!panel) return;
    panel.hidden = true;
    panel.classList.remove('is-open');
    try { document.querySelector('a.nav-link[href="/task-management"]')?.setAttribute('aria-expanded', 'false'); } catch {}
  }

  function renderTaskManagementSubpageFlyout(pages = [], trigger) {
    const panel = ensureTaskManagementSubpageFlyout();
    if (!pages.length || !trigger) return closeTaskManagementSubpageFlyout();
    const current = sidebarPath(window.location.pathname);
    panel.innerHTML = `
      <div class="task-management-subpage-flyout__list">
        ${pages.map((page) => `
          <a class="task-management-subpage-flyout__link${current === page.route || current.startsWith(`${page.route}/`) ? ' is-active' : ''}" href="${page.route}" role="menuitem">
            <i data-feather="${page.icon}"></i><span>${page.label}</span>
          </a>
        `).join('')}
      </div>
    `;
    const rect = trigger.getBoundingClientRect();
    const left = Math.min(window.innerWidth - 236, Math.max(12, rect.right + 10));
    const top = Math.min(window.innerHeight - 170, Math.max(12, rect.top - 10));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.hidden = false;
    panel.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    if (window.feather) feather.replace({ width: 17, height: 17 });
  }

  function syncTaskManagementSubpageNavigation(allowed = []) {
    const pages = taskManagementSubpagesAllowed(allowed);
    const parent = document.querySelector('a.nav-link[href="/task-management"]');
    const parentLi = parent?.closest('li');
    const currentRoute = sidebarPath(window.location.pathname);
    if (!parent) return;

    if (pages.length) showEl(parentLi || parent);
    else hideEl(parentLi || parent);

    parent.dataset.taskManagementSubpageCount = String(pages.length);
    parent.href = '/task-management';
    parent.setAttribute('aria-haspopup', pages.length > 1 ? 'menu' : 'false');
    parent.setAttribute('aria-expanded', 'false');
    parent.title = pages.length === 1 ? `Task Management · ${pages[0].label}` : 'Task Management';
    parent.setAttribute('aria-label', parent.title);
    parent.classList.toggle('active', pages.some((page) => currentRoute === page.route || currentRoute.startsWith(`${page.route}/`)));

    if (!parent.dataset.taskManagementSubpageBound) {
      parent.dataset.taskManagementSubpageBound = '1';
      parent.addEventListener('click', (event) => {
        const currentPages = taskManagementSubpagesAllowed(getCachedAllowedPages() || []);
        if (!currentPages.length) return;
        event.preventDefault();
        event.stopPropagation();
        if (currentPages.length === 1) {
          window.location.assign(currentPages[0].route);
          return;
        }
        const flyout = document.getElementById('task-management-subpage-flyout');
        if (flyout?.classList.contains('is-open')) closeTaskManagementSubpageFlyout();
        else renderTaskManagementSubpageFlyout(currentPages, parent);
      });
    }
  }


  const B2C_SUBPAGE_CONFIG = Object.freeze([
    {
      key: 'database',
      name: 'Customer Database',
      route: '/b2c/database',
      label: 'Database',
      icon: 'database',
      aliases: ['customer database', 'b2c customer database', 'b2ccustomerdatabase', 'customer-database', '/b2c/database'],
    },
    {
      key: 'form',
      name: 'Customer Form',
      route: '/b2c/form',
      label: 'Forms',
      icon: 'clipboard',
      aliases: ['customer form', 'b2c customer form', 'b2ccustomerform', 'customer-form', '/b2c/form'],
    },
  ]);

  // B2C is a parent sidebar shell. Resolve it from both the allowed-pages list
  // and direct Page Access rows. This protects the sidebar from an older
  // browser/session cache that may not yet contain a newly enabled B2C child.
  function b2cPermissionValues(allowed = []) {
    const values = Array.isArray(allowed) ? allowed.slice() : [];
    const accessSources = [
      window.__opsUserInfo?.pageAccess,
      readChromeCache?.()?.pageAccess,
      (() => {
        try {
          const cached = JSON.parse(sessionStorage.getItem('ops.currentPageAccess') || 'null');
          return cached?.pages || null;
        } catch {
          return null;
        }
      })(),
    ];

    accessSources.forEach((source) => {
      enabledPageAccessRows(source).forEach((row) => {
        [
          row.pageName, row.page_name,
          row.pageKey, row.page_key,
          row.routePath, row.route_path,
          ...(Array.isArray(row.aliases) ? row.aliases : []),
        ].forEach((value) => {
          const clean = String(value || '').trim();
          if (clean) values.push(clean);
        });
      });
    });

    return values;
  }

  function b2cPermissionSet(allowed = []) {
    const set = new Set();
    b2cPermissionValues(allowed).forEach((value) => {
      const raw = String(value || '').trim();
      const normalized = normPath(raw);
      const token = normalizeAllowedToken(raw);
      if (raw) set.add(toKey(raw));
      if (normalized) {
        set.add(normalized);
        set.add(normalized.startsWith('/') ? normalized.slice(1) : `/${normalized}`);
      }
      if (token) set.add(token);
    });
    return set;
  }

  function b2cSubpagesAllowed(allowed = []) {
    const set = b2cPermissionSet(allowed);
    const legacyBroad = set.has('b2c') || set.has('/b2c') || set.has('businesstocustomer');

    return B2C_SUBPAGE_CONFIG.filter((page) => {
      if (legacyBroad) return true;
      const values = [page.name, page.route, ...(page.aliases || [])];
      return values.some((value) => {
        const raw = String(value || '').trim();
        return set.has(toKey(raw)) || set.has(normPath(raw)) || set.has(normalizeAllowedToken(raw));
      });
    });
  }

  function ensureB2CParentSidebarLink() {
    let parent = document.querySelector('.sidebar a.nav-link[href="/b2c"]');
    if (parent) return parent;

    // On some mobile layouts the normal generic ensureLink() target can point
    // at a stale/hidden list. Add the B2C parent directly to the active sidebar
    // page list, then the standard sidebar reorder pass positions it after B2B.
    const list = (typeof getSidebarPagesList === 'function' ? getSidebarPagesList() : null)
      || document.querySelector('.sidebar .nav-list, .sidebar nav ul, .sidebar ul');
    if (!list) return null;

    const li = document.createElement('li');
    parent = document.createElement('a');
    parent.className = 'nav-link';
    parent.href = '/b2c';
    parent.title = 'B2C';
    parent.setAttribute('aria-label', 'B2C');
    parent.innerHTML = '<i data-feather="user-plus"></i><span class="nav-label">B2C</span>';
    li.appendChild(parent);
    list.appendChild(li);
    hydratePendingFeatherIcons(list);
    return parent;
  }

  function ensureB2CSubpageFlyout() {
    let panel = document.getElementById('b2c-subpage-flyout');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'b2c-subpage-flyout';
    panel.className = 'b2c-subpage-flyout';
    panel.hidden = true;
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', 'B2C pages');
    document.body.appendChild(panel);
    return panel;
  }

  function closeB2CSubpageFlyout() {
    const panel = document.getElementById('b2c-subpage-flyout');
    if (!panel) return;
    panel.hidden = true;
    panel.classList.remove('is-open');
    try { document.querySelector('a.nav-link[href="/b2c"]')?.setAttribute('aria-expanded', 'false'); } catch {}
  }

  function renderB2CSubpageFlyout(pages = [], trigger) {
    const panel = ensureB2CSubpageFlyout();
    if (!pages.length || !trigger) return closeB2CSubpageFlyout();
    const current = sidebarPath(window.location.pathname);
    panel.innerHTML = `
      <div class="b2c-subpage-flyout__list">
        ${pages.map((page) => `
          <a class="b2c-subpage-flyout__link${current === page.route || current.startsWith(`${page.route}/`) ? ' is-active' : ''}" href="${page.route}" role="menuitem">
            <i data-feather="${page.icon}"></i><span>${page.label}</span>
          </a>
        `).join('')}
      </div>
    `;
    const rect = trigger.getBoundingClientRect();
    const left = Math.min(window.innerWidth - 248, Math.max(12, rect.right + 10));
    const top = Math.min(window.innerHeight - 170, Math.max(12, rect.top - 10));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.hidden = false;
    panel.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    if (window.feather) feather.replace({ width: 17, height: 17 });
  }

  function syncB2CSubpageNavigation(allowed = []) {
    const pages = b2cSubpagesAllowed(allowed);
    const parent = ensureB2CParentSidebarLink();
    const parentLi = parent?.closest('li');
    const currentRoute = sidebarPath(window.location.pathname);
    if (!parent) return;

    if (pages.length) showEl(parentLi || parent);
    else hideEl(parentLi || parent);

    parent.dataset.b2cSubpageCount = String(pages.length);
    parent.href = '/b2c';
    parent.setAttribute('aria-haspopup', pages.length > 1 ? 'menu' : 'false');
    parent.setAttribute('aria-expanded', 'false');
    parent.title = pages.length === 1 ? `B2C · ${pages[0].label}` : 'B2C';
    parent.setAttribute('aria-label', parent.title);
    parent.classList.toggle('active', pages.some((page) => currentRoute === page.route || currentRoute.startsWith(`${page.route}/`)));

    if (!parent.dataset.b2cSubpageBound) {
      parent.dataset.b2cSubpageBound = '1';
      parent.addEventListener('click', (event) => {
        const currentPages = b2cSubpagesAllowed(getCachedAllowedPages() || []);
        if (!currentPages.length) return;
        event.preventDefault();
        event.stopPropagation();
        if (currentPages.length === 1) {
          window.location.assign(currentPages[0].route);
          return;
        }
        const flyout = document.getElementById('b2c-subpage-flyout');
        if (flyout?.classList.contains('is-open')) closeB2CSubpageFlyout();
        else renderB2CSubpageFlyout(currentPages, parent);
      });
    }
  }

  document.addEventListener('click', (event) => {
    const panel = document.getElementById('b2c-subpage-flyout');
    const parent = document.querySelector('a.nav-link[href="/b2c"]');
    if (!panel?.classList.contains('is-open')) return;
    if (panel.contains(event.target)) {
      if (event.target.closest?.('.b2c-subpage-flyout__link')) closeB2CSubpageFlyout();
      return;
    }
    if (parent?.contains(event.target)) return;
    closeB2CSubpageFlyout();
  });
  window.addEventListener('resize', () => closeB2CSubpageFlyout());
  window.addEventListener('pagehide', () => closeB2CSubpageFlyout());
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeB2CSubpageFlyout(); });

  document.addEventListener('click', (event) => {
    const panel = document.getElementById('task-management-subpage-flyout');
    const parent = document.querySelector('a.nav-link[href="/task-management"]');
    if (!panel?.classList.contains('is-open')) return;
    if (panel.contains(event.target)) {
      if (event.target.closest?.('.task-management-subpage-flyout__link')) closeTaskManagementSubpageFlyout();
      return;
    }
    if (parent?.contains(event.target)) return;
    closeTaskManagementSubpageFlyout();
  });
  window.addEventListener('resize', () => closeTaskManagementSubpageFlyout());
  window.addEventListener('pagehide', () => closeTaskManagementSubpageFlyout());
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeTaskManagementSubpageFlyout(); });

  document.addEventListener('click', (event) => {
    const panel = document.getElementById('events-subpage-flyout');
    const parent = document.querySelector('a.nav-link[href="/events"]');
    if (!panel?.classList.contains('is-open')) return;

    // Close immediately when a child page is selected. This also clears the
    // flyout before navigation is cached by the browser/PWA back-forward cache.
    if (panel.contains(event.target)) {
      if (event.target.closest?.('.events-subpage-flyout__link')) closeEventsSubpageFlyout();
      return;
    }
    if (parent?.contains(event.target)) return;
    closeEventsSubpageFlyout();
  });
  window.addEventListener('resize', () => closeEventsSubpageFlyout());
  window.addEventListener('pagehide', () => closeEventsSubpageFlyout());
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeEventsSubpageFlyout(); });

  // أظهر المسموح وأخفِ غير المسموح (حتمي)
  function applyAllowedPages(allowed){
    if (!Array.isArray(allowed)) return;

    // LMS has its own page catalogue and access table. ERP page-access must not
    // hide the dedicated LMS navigation. Route-level LMS permissions remain
    // enforced by the server.
    if (document.body?.classList?.contains('page-lms') || sidebarPath(window.location.pathname).startsWith('/lms')) {
      try {
        const nav = document.querySelector('.lms-sidebar .nav-list')
          || document.querySelector('.sidebar-nav .nav-list');
        if (nav?.children) {
          Array.from(nav.children).forEach((child) => {
            if (child && String(child.tagName).toUpperCase() === 'LI') showEl(child);
          });
        }
        document.querySelectorAll('.lms-sidebar .nav-link').forEach((link) => {
          showEl(link.closest('li') || link);
        });
      } catch {}
      try {
        document.body.classList.remove('permissions-loading');
        document.body.classList.add('permissions-ready');
      } catch {}
      return;
    }

    // Add all known links before applying the hide/show pass. Previously the
    // Events link could be injected after this pass and inherit an incorrect
    // display state inside the mobile dock.
    try { ensureOrderedSidebarLinks(); } catch {}

    allowed = mergePageAccessIntoAllowedPages(
      allowed,
      window.__opsUserInfo?.pageAccess || readChromeCache()?.pageAccess || null
    );

    // Default-deny for the sidebar: hide every first-level nav item.
    // (Some CSS rules use `display: flex !important`, so we use hideEl() which
    // sets `display: none !important`.)
    try {
      const nav = document.querySelector('.sidebar-nav .nav-list')
        || document.querySelector('.sidebar .nav-list, .sidebar nav ul, .sidebar ul');
      if (nav && nav.children) {
        Array.from(nav.children).forEach((child) => {
          if (child && String(child.tagName).toUpperCase() === 'LI') hideEl(child);
        });
      }
    } catch {}

    // allowedPages ممكن تيجي:
    // 1) أسماء صفحات: "Expenses Users"
    // 2) مسارات: "/expenses/users" أو "expenses/users"
    const allowedSet = new Set();
    allowed.forEach(v => {
      const k = toKey(v);
      const p = normPath(v);
      allowedSet.add(k);
      allowedSet.add(p);
      if (p && !p.startsWith('/')) allowedSet.add('/' + p);
      if (p && p.startsWith('/')) allowedSet.add(p.slice(1));
    });

    // 🔒 Default deny: اخفي كل اللينكات الأول
    Object.values(PAGE_SELECTORS).forEach(selector => {
      const link = document.querySelector(selector);
      if (!link) return;
      hideEl(link.closest('li') || link);
    });

    // ✅ أظهر المسموح فقط
    Object.entries(PAGE_SELECTORS).forEach(([key, selector]) => {
      const link = document.querySelector(selector);
      if (!link) return;

      const li = link.closest('li') || link;
      const href = link.getAttribute('href') || '';
      const hrefKey = normPath(href); // "/expenses/users"

      // matching على:
      // - اسم الصفحة (key)
      // - أو href path (مع normalize)
      if (allowedSet.has(key) || allowedSet.has(hrefKey)) {
        showEl(li);
      }
    });

    // Events and Task Management are parent shells: show them when one or
    // more independently permitted child pages are available.
    try { syncEventsSubpageNavigation(allowed); } catch {}
    try { syncTaskManagementSubpageNavigation(allowed); } catch {}
    try { syncB2CSubpageNavigation(allowed); } catch {}

    // Home is available for every authenticated user (not tied to Allowed Pages)
    try {
      const home = document.querySelector('a[href="/home"]');
      if (home) showEl(home.closest('li') || home);
    } catch {}

    // LMS is a top-level workspace switch and is available to every authenticated user.
    try {
      const lms = document.querySelector('a[href="/lms"]');
      if (lms) showEl(lms.closest('li') || lms);
    } catch {}

    // Proposals and Kits are standalone pages, but existing product users should still see both workspaces.
    try {
      const proposals = document.querySelector('a[href="/proposals"]');
      if (proposals && (allowedSet.has('products') || allowedSet.has('/products') || allowedSet.has('proposals') || allowedSet.has('/proposals'))) {
        showEl(proposals.closest('li') || proposals);
      }
      const kits = document.querySelector('a[href="/kits"]');
      if (kits && (allowedSet.has('products') || allowedSet.has('/products') || allowedSet.has('kits') || allowedSet.has('/kits'))) {
        showEl(kits.closest('li') || kits);
      }
    } catch {}

    // History and Database are exposed from the user profile menu only, not from the sidebar.
    try { removeSidebarSystemLinks(); } catch {}

    // Keep the page sidebar in the same requested order on every page after
    // permission filtering changes visibility.
    try { ensureOrderedSidebarLinks(); reorderSidebarNav(); } catch {}
    try { scheduleSidebarScrollRestore(); } catch {}

    // User-menu items must follow the same Allowed Pages logic.
    syncUserMenuPageAccess(allowed);

  }

  function cacheAllowedPages(arr){
    try {
      const merged = mergePageAccessIntoAllowedPages(
        Array.isArray(arr) ? arr : [],
        window.__opsUserInfo?.pageAccess || readChromeCache()?.pageAccess || null
      );
      sessionStorage.setItem(CACHE_ALLOWED, JSON.stringify(merged));
    } catch {}
  }
  function getCachedAllowedPages(){
    try {
      const r = sessionStorage.getItem(CACHE_ALLOWED);
      const a = JSON.parse(r);
      return Array.isArray(a) ? a : null;
    } catch { return null; }
  }

  // ====== Greeting ======
  const getCachedName = () => (localStorage.getItem('username') || '').trim();
  const renderGreeting = (name) => {
    const n = (name || '').trim();
    document.querySelectorAll('[data-username]').forEach(el => el.textContent = n || 'User');
  };

  function readChromeCache(){
    try {
      const data = JSON.parse(localStorage.getItem(CHROME_CACHE_KEY) || 'null');
      return data && typeof data === 'object' ? data : null;
    } catch { return null; }
  }

  function writeChromeCache(data = {}){
    try {
      const safe = data && typeof data === 'object' ? data : {};
      const payload = {
        name: String(safe.name || safe.username || localStorage.getItem('username') || '').trim(),
        position: String(safe.position || '').trim(),
        department: String(safe.department || '').trim(),
        email: String(safe.email || '').trim(),
        photoUrl: String(safe.photoUrl || '').trim(),
        coverPhotoUrl: String(safe.coverPhotoUrl || safe.coverPhoto || '').trim(),
        allowedPages: mergePageAccessIntoAllowedPages(
          Array.isArray(safe.allowedPages) ? safe.allowedPages : (getCachedAllowedPages() || []),
          safe.pageAccess || null
        ),
        pageAccess: safe.pageAccess || null,
        savedAt: Date.now(),
      };
      localStorage.setItem(CHROME_CACHE_KEY, JSON.stringify(payload));
    } catch {}
  }

  function normalizeSystemCoverUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.origin);
      if (!['http:', 'https:', 'blob:'].includes(String(url.protocol || '').toLowerCase())) return '';
      if (url.origin === window.location.origin) return `${url.pathname}${url.search}${url.hash}`;
      return url.href;
    } catch {
      return '';
    }
  }

  function applyUserSystemCover(coverPhotoUrl = '') {
    const cleanUrl = normalizeSystemCoverUrl(coverPhotoUrl);
    const root = document.documentElement;
    if (cleanUrl) {
      try { root.style.setProperty('--ops-system-cover-image', `url(${JSON.stringify(cleanUrl)})`); } catch {}
      try { document.body.classList.add('ops-has-system-cover'); } catch {}
      try {
        document.querySelectorAll('.main-content').forEach((el) => {
          el.classList.add('ops-system-cover-target');
        });
      } catch {}
    } else {
      try { root.style.removeProperty('--ops-system-cover-image'); } catch {}
      try { document.body.classList.remove('ops-has-system-cover'); } catch {}
      try {
        document.querySelectorAll('.main-content').forEach((el) => {
          el.classList.remove('ops-system-cover-target');
        });
      } catch {}
    }
  }

  try {
    window.OpsSystemCover = Object.assign({}, window.OpsSystemCover || {}, {
      apply: applyUserSystemCover,
      normalize: normalizeSystemCoverUrl,
    });
  } catch {}

  function primeChromeFromCache(){
    const cachedChrome = readChromeCache();
    const cachedCoverPhotoUrl = String(cachedChrome?.coverPhotoUrl || cachedChrome?.coverPhoto || '').trim();
    applyUserSystemCover(cachedCoverPhotoUrl);
    const cachedName = String(cachedChrome?.name || getCachedName() || '').trim();
    if (cachedName) {
      try { localStorage.setItem('username', cachedName); } catch {}
      renderGreeting(cachedName);
      renderHeaderUser({ name: cachedName, photoUrl: cachedChrome?.photoUrl || '' });
      try {
        window.__opsUserInfo = Object.assign({}, window.__opsUserInfo || {}, {
          name: cachedName,
          position: cachedChrome?.position || '',
          department: cachedChrome?.department || '',
          email: cachedChrome?.email || '',
          photoUrl: cachedChrome?.photoUrl || '',
          coverPhotoUrl: cachedCoverPhotoUrl,
        });
      } catch {}
    }

    const cachedAllowed = mergePageAccessIntoAllowedPages(
      Array.isArray(cachedChrome?.allowedPages)
        ? cachedChrome.allowedPages
        : (getCachedAllowedPages() || []),
      cachedChrome?.pageAccess || null
    );

    if (cachedAllowed.length) {
      try { cacheAllowedPages(cachedAllowed); } catch {}
      try { applyAllowedPages(cachedAllowed); } catch {}
      try { window.__opsApplyMailAccess?.(cachedAllowed, window.__opsUserInfo || null); } catch {}
      document.body.classList.remove('permissions-loading');
      document.body.classList.add('permissions-ready');
      return true;
    }
    return false;
  }

  // ★ Inject links once so they exist for show/hide (لو مش موجودين في الـ HTML)
    function ensureLink({ href, label, icon, prepend = false, beforeHref = '' }) {
      const nav = document.querySelector('.sidebar .nav-list, .sidebar nav ul, .sidebar ul');
      if (!nav) return;
      if (nav.querySelector(`a[href="${href}"]`)) return;

      const li = document.createElement('li');
      const a  = document.createElement('a');
      a.className = 'nav-link';
      a.href = href;
      a.innerHTML = `<i data-feather="${icon}"></i><span class="nav-label">${label}</span>`;
      li.appendChild(a);

      // Insert position controls
      const before = beforeHref ? nav.querySelector(`a[href="${beforeHref}"]`)?.closest('li') : null;
      if (before) {
        nav.insertBefore(li, before);
      } else if (prepend && nav.firstChild) {
        nav.insertBefore(li, nav.firstChild);
      } else {
        nav.appendChild(li);
      }

      hydratePendingFeatherIcons();
    }



  function normalizeKitsSidebarIcon(){
    try {
      document.querySelectorAll('a[href="/kits"] i[data-feather="box"]').forEach((icon) => {
        icon.setAttribute('data-feather', 'briefcase');
      });
      hydratePendingFeatherIcons();
    } catch {}
  }

  function removeSidebarMailLinks(){
    try {
      document.querySelectorAll('.sidebar a[data-retired-mail-link]').forEach((link) => {
        const li = link.closest('li');
        if (li) li.remove();
        else link.remove();
      });
    } catch {}
  }

  function removeSidebarSystemLinks(){
    try {
      document.querySelectorAll('.sidebar a[href="/history"], .sidebar a[href="/backup"], body:not(.page-lms) .sidebar a[href="/b2b"]').forEach((link) => {
        const li = link.closest('li');
        if (li) li.remove();
        else link.remove();
      });
    } catch {}
  }

  const OPS_SIDEBAR_SCROLL_KEY = 'ops.sidebar.selectedScroll.v1';
  const OPS_SIDEBAR_ORDER = [
    { href: '/home', label: 'Home', icon: 'home' },
    { href: '/lms', label: 'LMS', icon: 'book-open' },
    { href: '/orders', label: 'Current Orders', icon: 'list' },
    { href: '/orders/sv-orders', label: 'Orders Review', icon: 'award' },
    { href: '/orders/requested', label: 'Operations Orders', icon: 'users' },
    { href: '/orders/maintenance-orders', label: 'Maintenance Orders', icon: 'tool' },
    { href: '/events', label: 'Events', icon: 'calendar' },
    { href: '/orders/new', label: 'Shopping Cart', icon: 'shopping-cart' },
    { href: '/stocktaking', label: 'Stocktaking', icon: 'archive' },
    { href: '/b2c', label: 'B2C', icon: 'user-plus' },
    { href: '/products', label: 'Products', icon: 'package' },
    { href: '/kits', label: 'Kits', icon: 'briefcase' },
    { href: '/proposals', label: 'Proposals', icon: 'file-text' },
    { href: '/expenses', label: 'Expenses', icon: 'dollar-sign' },
    { href: '/expenses/users', label: 'Expenses by Users', icon: 'credit-card' },
    { href: '/task-management', label: 'Task Management', icon: 'git-branch' },
    { href: '/kpis', label: 'KPIs', icon: 'bar-chart-2' },
    { href: '/user-access', label: 'Users Center', icon: 'shield' },
  ];

  function sidebarPath(value){
    try {
      const url = new URL(String(value || ''), window.location.origin);
      return (url.pathname || '/').replace(/\/+$/, '') || '/';
    } catch {
      return String(value || '').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
    }
  }

  function getSidebarNavRoot(){
    return document.querySelector('.sidebar .sidebar-nav');
  }

  function getSidebarPagesList(){
    const nav = getSidebarNavRoot();
    if (!nav) return null;
    return nav.querySelector(':scope > .mobile-dock-pages-clip > .nav-list')
      || nav.querySelector(':scope > .nav-list')
      || nav.querySelector('.nav-list');
  }

  function getSidebarScrollContainer(){
    const nav = getSidebarNavRoot();
    if (!nav) return null;
    return nav.querySelector(':scope > .mobile-dock-pages-clip') || nav;
  }

  function normalizeSidebarLink(link, item){
    if (!link || !item) return;
    try {
      link.setAttribute('href', item.href);
      link.setAttribute('title', item.label);
      link.setAttribute('aria-label', item.label);

      let label = link.querySelector('.nav-label');
      if (!label) {
        label = document.createElement('span');
        label.className = 'nav-label';
        link.appendChild(label);
      }
      label.textContent = item.label;

      const existingIcon = link.querySelector('[data-feather], svg, i');
      const currentIcon = existingIcon?.getAttribute?.('data-feather')
        || (existingIcon?.classList ? Array.from(existingIcon.classList).find((cls) => cls && cls.startsWith('feather-'))?.replace(/^feather-/, '') : '');

      if (!existingIcon || (item.icon && currentIcon && currentIcon !== item.icon)) {
        const icon = document.createElement('i');
        icon.setAttribute('data-feather', item.icon);
        if (existingIcon) existingIcon.replaceWith(icon);
        else link.insertBefore(icon, label);
      }
    } catch {}
  }

  function enforceLmsSidebarNavigation(){
    const currentPath = sidebarPath(window.location.pathname || '');
    const isLmsWorkspace = document.body?.classList?.contains('page-lms') || currentPath.startsWith('/lms');
    if (!isLmsWorkspace) return;

    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    sidebar.classList.add('lms-sidebar');

    const nav = sidebar.querySelector('.sidebar-nav');
    const list = nav?.querySelector('.nav-list');
    if (!nav || !list) return;

    // LMS owns a completely separate navigation catalogue. Any ERP links that
    // may be injected by the shared chrome must be removed immediately.
    Array.from(list.children).forEach((item) => {
      const link = item.querySelector?.('a.nav-link[href]');
      const path = sidebarPath(link?.getAttribute('href') || '');
      if (!path.startsWith('/lms')) item.remove();
    });

    let usersLink = Array.from(list.querySelectorAll('a.nav-link[href]'))
      .find((link) => sidebarPath(link.getAttribute('href') || '') === '/lms/user-access');
    if (!usersLink) {
      const item = document.createElement('li');
      item.innerHTML = '<a class="nav-link" href="/lms/user-access"><i data-feather="users"></i><span class="nav-label">Users Center</span></a>';
      list.appendChild(item);
      usersLink = item.querySelector('a.nav-link');
    }

    let b2bLink = Array.from(list.querySelectorAll('a.nav-link[href]'))
      .find((link) => sidebarPath(link.getAttribute('href') || '') === '/lms/b2b');
    if (!b2bLink) {
      const item = document.createElement('li');
      item.innerHTML = '<a class="nav-link" href="/lms/b2b"><i data-feather="folder"></i><span class="nav-label">B2B</span></a>';
      list.appendChild(item);
      b2bLink = item.querySelector('a.nav-link');
    }

    list.querySelectorAll('a.nav-link[href]').forEach((link) => {
      const path = sidebarPath(link.getAttribute('href') || '');
      const active = path === currentPath;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
      showEl(link.closest('li') || link);
    });

    nav.style.setProperty('display', 'block', 'important');
    document.body.classList.remove('permissions-loading');
    document.body.classList.add('permissions-ready');
    hydratePendingFeatherIcons(sidebar);
  }

  function watchLmsSidebarNavigation(){
    const isLmsWorkspace = document.body?.classList?.contains('page-lms')
      || sidebarPath(window.location.pathname || '').startsWith('/lms');
    if (!isLmsWorkspace || window.__LMS_SIDEBAR_GUARD__) return;
    window.__LMS_SIDEBAR_GUARD__ = true;
    enforceLmsSidebarNavigation();

    const list = document.querySelector('.lms-sidebar .sidebar-nav .nav-list')
      || document.querySelector('.sidebar .sidebar-nav .nav-list');
    if (!list || typeof MutationObserver !== 'function') return;
    const observer = new MutationObserver(() => enforceLmsSidebarNavigation());
    observer.observe(list, { childList: true, subtree: true });
  }

  function ensureOrderedSidebarLinks(){
    if (document.body?.classList?.contains('page-lms')) return;
    try {
      OPS_SIDEBAR_ORDER.forEach((item) => {
        ensureLink({ href: item.href, label: item.label, icon: item.icon });
      });
    } catch {}
  }

  function reorderSidebarNav(){
    if (document.body?.classList?.contains('page-lms')) return;
    try {
      const nav = getSidebarNavRoot();
      const list = getSidebarPagesList();
      if (!nav || !list) return;

      const homeRail = nav.querySelector(':scope > .mobile-dock-home-rail');
      const allLinks = Array.from(nav.querySelectorAll('a.nav-link[href]'));
      const liByPath = new Map();

      allLinks.forEach((link) => {
        const li = link.closest('li');
        if (!li) return;
        const path = sidebarPath(link.getAttribute('href') || '');
        if (!liByPath.has(path)) liByPath.set(path, li);
      });

      const used = new Set();
      OPS_SIDEBAR_ORDER.forEach((item) => {
        const path = sidebarPath(item.href);
        const li = liByPath.get(path);
        if (!li) return;
        const a = li.querySelector('a.nav-link[href]');
        normalizeSidebarLink(a, item);
        used.add(li);

        if (path === '/home' && homeRail) {
          homeRail.appendChild(li);
        } else {
          list.appendChild(li);
        }
      });

      // Keep any future/permission-specific links visible after the known pages, without
      // letting them jump above the requested order. System/mail links are removed elsewhere.
      allLinks.forEach((link) => {
        const li = link.closest('li');
        if (li && !used.has(li) && !link.matches('a[href="/history"], a[href="/backup"]')) {
          list.appendChild(li);
          used.add(li);
        }
      });

      syncSidebarActiveState();
      hydratePendingFeatherIcons(nav);
    } catch {}
  }

  function syncSidebarActiveState(path = window.location.pathname){
    try {
      const current = sidebarPath(path);
      const links = Array.from(document.querySelectorAll('.sidebar a.nav-link[href]'));
      if (!links.length) return;

      links.forEach((link) => link.classList.remove('active'));

      let best = null;
      let bestLen = -1;
      links.forEach((link) => {
        const linkPath = sidebarPath(link.getAttribute('href') || '');
        const match = current === linkPath || (linkPath !== '/' && current.startsWith(`${linkPath}/`));
        if (match && linkPath.length > bestLen) {
          best = link;
          bestLen = linkPath.length;
        }
      });

      if (!best && current.startsWith('/events/')) best = links.find((link) => sidebarPath(link.getAttribute('href') || '') === '/events') || null;
      if (!best && current.startsWith('/b2c/')) best = links.find((link) => sidebarPath(link.getAttribute('href') || '') === '/b2c') || null;
      if (!best) best = links.find((link) => sidebarPath(link.getAttribute('href') || '') === '/home') || links[0];
      if (best) best.classList.add('active');
    } catch {}
  }

  function readSidebarScrollState(){
    try {
      const raw = sessionStorage.getItem(OPS_SIDEBAR_SCROLL_KEY);
      const data = JSON.parse(raw || 'null');
      return data && typeof data === 'object' ? data : null;
    } catch {
      return null;
    }
  }

  function writeSidebarScrollState(link){
    try {
      const container = getSidebarScrollContainer();
      const href = link?.getAttribute?.('href') || window.location.pathname;
      sessionStorage.setItem(OPS_SIDEBAR_SCROLL_KEY, JSON.stringify({
        href: sidebarPath(href),
        scrollTop: Number(container?.scrollTop || 0),
        scrollLeft: Number(container?.scrollLeft || 0),
        at: Date.now(),
      }));
    } catch {}
  }

  function restoreSidebarScrollPosition(){
    try {
      const container = getSidebarScrollContainer();
      if (!container) return;

      const current = sidebarPath(window.location.pathname);
      const saved = readSidebarScrollState();
      const fresh = saved && Number.isFinite(Number(saved.at)) && (Date.now() - Number(saved.at) < 10 * 60 * 1000);
      const savedHref = sidebarPath(saved?.href || '');
      const matchesSavedPage = fresh && (current === savedHref || (savedHref !== '/' && current.startsWith(`${savedHref}/`)));

      if (matchesSavedPage) {
        container.scrollTop = Math.max(0, Number(saved.scrollTop || 0));
        container.scrollLeft = Math.max(0, Number(saved.scrollLeft || 0));
        return;
      }

      const active = document.querySelector('.sidebar a.nav-link.active');
      if (!active || !container.contains(active)) return;

      const cRect = container.getBoundingClientRect();
      const aRect = active.getBoundingClientRect();
      const horizontal = container.scrollWidth > container.clientWidth + 4;

      if (horizontal) {
        const delta = (aRect.left + aRect.width / 2) - (cRect.left + cRect.width / 2);
        container.scrollLeft = Math.max(0, container.scrollLeft + delta);
      } else {
        const delta = (aRect.top + aRect.height / 2) - (cRect.top + cRect.height / 2);
        container.scrollTop = Math.max(0, container.scrollTop + delta);
      }
    } catch {}
  }

  function scheduleSidebarScrollRestore(){
    const run = () => restoreSidebarScrollPosition();
    try {
      requestAnimationFrame(() => requestAnimationFrame(run));
    } catch {
      setTimeout(run, 0);
    }
    setTimeout(run, 120);
    setTimeout(run, 420);
  }

  function bindSidebarScrollPersistence(){
    if (window.__opsSidebarScrollPersistenceBound) return;
    window.__opsSidebarScrollPersistenceBound = true;

    const saveFromEvent = (event) => {
      try {
        const link = event.target?.closest?.('.sidebar a.nav-link[href]');
        if (!link) return;
        writeSidebarScrollState(link);
      } catch {}
    };

    document.addEventListener('pointerdown', saveFromEvent, true);
    document.addEventListener('click', saveFromEvent, true);
  }

  try {
    window.OpsSidebarNav = Object.assign({}, window.OpsSidebarNav || {}, {
      reorder: reorderSidebarNav,
      restore: scheduleSidebarScrollRestore,
      syncActive: syncSidebarActiveState,
      saveScroll: writeSidebarScrollState,
    });
  } catch {}

  function syncMobileDockStructure(){
    const sidebar = document.querySelector('.sidebar');
    const nav = sidebar?.querySelector('.sidebar-nav');
    if (!sidebar || !nav) return;

    const isStructured = nav.classList.contains('mobile-dock-structured');
    const list = nav.querySelector(':scope > .mobile-dock-pages-clip > .nav-list')
      || nav.querySelector(':scope > .nav-list');

    if (!list) {
      sidebar.classList.remove('mobile-dock-structured-host');
      nav.classList.remove('mobile-dock-structured');
      return;
    }

    if (isMobile()) {
      if (isStructured) {
        sidebar.classList.add('mobile-dock-structured-host');
        return;
      }

      const homeLi = list.querySelector(':scope > li:first-child');
      if (!homeLi) return;

      const homeRail = document.createElement('div');
      homeRail.className = 'mobile-dock-home-rail';

      const pagesClip = document.createElement('div');
      pagesClip.className = 'mobile-dock-pages-clip';

      nav.insertBefore(homeRail, list);
      nav.insertBefore(pagesClip, list);
      homeRail.appendChild(homeLi);
      pagesClip.appendChild(list);

      list.classList.add('mobile-dock-pages-list');
      nav.classList.add('mobile-dock-structured');
      sidebar.classList.add('mobile-dock-structured-host');
      return;
    }

    if (!isStructured) {
      sidebar.classList.remove('mobile-dock-structured-host');
      return;
    }

    const homeRail = nav.querySelector(':scope > .mobile-dock-home-rail');
    const pagesClip = nav.querySelector(':scope > .mobile-dock-pages-clip');
    const pagesList = pagesClip?.querySelector(':scope > .nav-list') || list;
    const homeLi = homeRail?.querySelector(':scope > li');

    if (pagesClip && pagesList && pagesClip.parentNode === nav) {
      nav.insertBefore(pagesList, homeRail || pagesClip);
    }
    if (homeLi && pagesList) {
      pagesList.insertBefore(homeLi, pagesList.firstChild);
    }

    try { homeRail?.remove(); } catch {}
    try { pagesClip?.remove(); } catch {}

    pagesList.classList.remove('mobile-dock-pages-list');
    nav.classList.remove('mobile-dock-structured');
    sidebar.classList.remove('mobile-dock-structured-host');
  }

  // Rename sidebar labels (display-only) without changing routes
  function renameSidebarLabels(){
    try { removeSidebarMailLinks(); } catch {}
    try { removeSidebarSystemLinks(); } catch {}

    // Operations Orders (was: Operations Requested Orders)
    document
      .querySelectorAll('a.nav-item[href^="/orders/requested"], a.nav-link[href^="/orders/requested"]')
      .forEach((a) => {
        const lbl = a.querySelector('.nav-label');
        if (lbl) lbl.textContent = 'Operations Orders';
      });
  }

  async function ensureGreetingAndPages(){
    const cachedChrome = readChromeCache();
    const cachedCoverPhotoUrl = String(cachedChrome?.coverPhotoUrl || cachedChrome?.coverPhoto || '').trim();
    applyUserSystemCover(cachedCoverPhotoUrl);
    const cached = getCachedName() || String(cachedChrome?.name || '').trim();
    if (cached) {
      renderGreeting(cached);
      // also prefill sidebar profile quickly from cache (then refresh from API)
      renderSidebarProfile({ name: cached });
      // also prefill header user (then refresh from API)
      renderHeaderUser({ name: cached, photoUrl: cachedChrome?.photoUrl || '' });

      // Expose basic user info for other widgets (e.g., the profile dropdown header)
      try {
        window.__opsUserInfo = Object.assign({}, window.__opsUserInfo || {}, {
          name: cached,
          position: cachedChrome?.position || window.__opsUserInfo?.position || '',
          department: cachedChrome?.department || window.__opsUserInfo?.department || '',
          email: cachedChrome?.email || window.__opsUserInfo?.email || '',
          photoUrl: cachedChrome?.photoUrl || window.__opsUserInfo?.photoUrl || '',
          coverPhotoUrl: cachedCoverPhotoUrl || window.__opsUserInfo?.coverPhotoUrl || '',
          pageAccess: cachedChrome?.pageAccess || window.__opsUserInfo?.pageAccess || { pages: [] },
        });
        applyPageAccessRuntime({ pageAccess: cachedChrome?.pageAccess || window.__opsUserInfo?.pageAccess || { pages: [] } });
      } catch {}
    }

    try {
      const res = await fetch('/api/account', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) scheduleLoginRedirect('immediate');
        return;
      }
      const data = await res.json();

      const name = (data && (data.name || data.username)) ? String(data.name || data.username) : '';
      const coverPhotoUrl = String(data?.coverPhotoUrl || data?.coverPhoto || '').trim();
      applyUserSystemCover(coverPhotoUrl);
      if (name) {
        if (name !== cached) localStorage.setItem('username', name);
        renderGreeting(name);
      } else if (!cached) {
        renderGreeting('User');
      }

      // Sidebar profile (photo + name + position)
      renderSidebarProfile({
        name: name || cached || '',
        position: data.position || '',
        department: data.department || '',
        photoUrl: data.photoUrl || ''
      });

      // Header user (avatar + short name)
      renderHeaderUser({
        name: name || cached || '',
        photoUrl: data.photoUrl || ''
      });

      // Keep a global snapshot of the user (used by the profile dropdown header)
      try {
        window.__opsUserInfo = {
          name: name || cached || 'User',
          position: data.position || '',
          department: data.department || '',
          photoUrl: data.photoUrl || '',
          coverPhotoUrl,
          email: data.email || '',
          pageAccess: data.pageAccess || { pages: [] }
        };
        applyPageAccessRuntime(data || {});

        // Notify other widgets that user info changed
        try {
          window.dispatchEvent(new CustomEvent('ops:userinfo', { detail: window.__opsUserInfo }));
        } catch {}
      } catch {}

      writeChromeCache({
        name: name || cached || 'User',
        position: data.position || '',
        department: data.department || '',
        photoUrl: data.photoUrl || '',
        coverPhotoUrl,
        email: data.email || '',
        allowedPages: Array.isArray(data.allowedPages) ? data.allowedPages : (getCachedAllowedPages() || []),
        pageAccess: data.pageAccess || { pages: [] },
      });

      if (Array.isArray(data.allowedPages)) {
        const resolvedAllowedPages = mergePageAccessIntoAllowedPages(
          data.allowedPages,
          data.pageAccess || { pages: [] }
        );
        data.allowedPages = resolvedAllowedPages;
        cacheAllowedPages(resolvedAllowedPages);
        writeChromeCache({ ...(window.__opsUserInfo || {}), allowedPages: resolvedAllowedPages, pageAccess: data.pageAccess || { pages: [] } });

        // 🔒 اخفي الكل ثم أظهر المسموح
        applyAllowedPages([]);
        applyAllowedPages(resolvedAllowedPages);

        // Prime the app data in the background once per session/tab so page transitions
        // feel instant after the first load.
        schedulePrefetchForAllowedPages(resolvedAllowedPages);

        try { window.__opsApplyMailAccess?.(resolvedAllowedPages, data); } catch {}

        // ✅ بعد ما طبقنا الصلاحيات، نكشف اللي مسموح بس (بدون فلاش)
        document.body.classList.remove('permissions-loading');
        document.body.classList.add('permissions-ready');
      }
    } catch {} finally {
      try {
        ensureDashboardHeaderLayout();
        ensureSidebarBranding();
        ensureOrderedSidebarLinks();
        // The Events link is injected at runtime. Apply the current permissions
        // again after injection so it is not left hidden by an earlier cached
        // permission pass on existing pages.
        const latestAllowed = mergePageAccessIntoAllowedPages(
          getCachedAllowedPages() || [],
          window.__opsUserInfo?.pageAccess || null
        );
        if (latestAllowed.length) applyAllowedPages(latestAllowed);
        reorderSidebarNav();
        syncMobileDockStructure();
        reorderSidebarNav();
        renameSidebarLabels();
        ensureNavTooltips();
        enforceLmsSidebarNavigation();
        scheduleSidebarScrollRestore();
        if (window.feather) feather.replace();
      } catch {}
      markFreshLoadAccountReady();
      markFreshLoadChromeReady();
    }
  }

  // ====== Sidebar toggle ======
  function setAria(){
    const expanded = !document.body.classList.contains('sidebar-collapsed');
    const sidebarLogoToggle = document.getElementById('sidebar-logo-toggle');
    const profileToggle = document.querySelector('.sidebar-profile__toggle');
    [menuToggle, sidebarLogoToggle, profileToggle]
      .forEach(btn => btn && btn.setAttribute('aria-expanded', String(!!expanded)));
  }

  function applyInitial(){
    // We no longer rely on "sidebar-mini" for the dashboard toggle.
    // The user wants open/close (drawer) behavior.
    document.body.classList.remove('sidebar-mini');

    if (isMobile()) {
      // Mobile: closed by default (overlay drawer)
      document.body.classList.add('sidebar-collapsed');
    } else {
      // Desktop: read persisted preference (optional)
      let pref = '0';
      try { pref = String(localStorage.getItem(KEY_COLLAPSED) || '0'); } catch {}
      if (pref === '1') document.body.classList.add('sidebar-collapsed');
      else document.body.classList.remove('sidebar-collapsed');
    }
    setAria();
  }

  function hydratePendingFeatherIcons(root = document){
    try {
      if (!window.feather || !root || typeof root.querySelector !== 'function') return;
      if (!root.querySelector('[data-feather]')) return;
      feather.replace();
    } catch {}
  }

  function scrollPageToTop(){
    // User request: when the dashboard opens, jump to the start of the page content.
    const prefersInstant = document.body && document.body.dataset && document.body.dataset.sidebarOpenScroll === 'instant';
    const scrollBehavior = prefersInstant ? 'auto' : 'smooth';

    try {
      // Prefer window scroll (the page itself scrolls)
      if (typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, left: 0, behavior: scrollBehavior });
      } else {
        window.scrollTo(0, 0);
      }
    } catch {
      try { window.scrollTo(0, 0); } catch {}
    }

    // Also reset inner scroll containers if any page uses them.
    try {
      const main = document.querySelector('.main-content');
      if (main && typeof main.scrollTo === 'function') {
        main.scrollTo({ top: 0, left: 0, behavior: scrollBehavior });
      }
    } catch {}
  }

  function toggleSidebar(e){
    if (e){ e.preventDefault(); e.stopPropagation(); }
    const wasCollapsed = document.body.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('sidebar-collapsed');
    const isCollapsed = document.body.classList.contains('sidebar-collapsed');

    // Persist on desktop only (mobile always starts collapsed)
    if (!isMobile()) {
      try { localStorage.setItem(KEY_COLLAPSED, isCollapsed ? '1' : '0'); } catch {}
    }

    // Cleanup legacy state
    document.body.classList.remove('sidebar-mini');
    try { localStorage.removeItem(KEY_MINI); } catch {}

    setAria();
    hydratePendingFeatherIcons();

    // When opening: move user to top
    if (wasCollapsed && !isCollapsed) {
      scrollPageToTop();
    }
  }

  // Some pages (e.g. tasks.html) ship without a static header.
  // The header is injected later by ensureMainHeaderExists(), so ensureMenuToggle()
  // may return null during the first pass.
  // We bind the click handler defensively (once) whenever the button exists.
  function wireMenuToggleOnce(){
    const btn = document.getElementById('menu-toggle');
    if (!btn) return;
    if (btn.dataset && btn.dataset.boundSidebarToggle === '1') {
      menuToggle = btn;
      return;
    }
    try {
      if (btn.dataset) btn.dataset.boundSidebarToggle = '1';
    } catch {}
    btn.addEventListener('click', toggleSidebar);
    menuToggle = btn;
    setAria();
  }

  // Initial attempt (works on pages that already have a header in HTML)
  wireMenuToggleOnce();

  // ✅ Requested: close the dashboard when clicking outside it
  // - Mobile: closes the overlay sidebar
  // - Desktop: closes the drawer
  document.addEventListener('click', (event) => {
    const insideSidebar = event.target.closest('.sidebar');
    const onToggles = event.target.closest('#menu-toggle') || event.target.closest('#sidebar-logo-toggle');
    if (insideSidebar || onToggles) return;

    if (isMobile()) {
      // Close only if open
      if (document.body.classList.contains('sidebar-collapsed')) return;
      document.body.classList.add('sidebar-collapsed');
      setAria();
      return;
    }

    // Desktop: close only if currently open
    if (document.body.classList.contains('sidebar-collapsed')) return;
    document.body.classList.add('sidebar-collapsed');
    try { localStorage.setItem(KEY_COLLAPSED, '1'); } catch {}
    // Cleanup legacy key
    try { localStorage.removeItem(KEY_MINI); } catch {}
    setAria();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.body.classList.contains('sidebar-collapsed')) {
      document.body.classList.add('sidebar-collapsed');
      if (!isMobile()) {
        try { localStorage.setItem(KEY_COLLAPSED, '1'); } catch {}
        try { localStorage.removeItem(KEY_MINI); } catch {}
      }
      setAria();
    }
  });

  if (EMBEDDED_SHELL_CONTENT) {
    try { document.body.classList.remove('permissions-loading'); } catch {}
    try { if (window.feather) feather.replace(); } catch {}
    return;
  }

  // ====== Logout ======
  logoutBtn && logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch(e) {}
    try { sessionStorage.clear(); } catch {}
    try {
      localStorage.removeItem(KEY_MINI);
      localStorage.removeItem(KEY_COLLAPSED);
      localStorage.removeItem('username');
      localStorage.removeItem(CHROME_CACHE_KEY);
    } catch {}
    window.location.href = '/login';
  });

  // Init
  applyInitial();

  // UI Redesign: ensure header exists + convert it to the Dashboard topbar style
  ensureMainHeaderExists();
  // Some pages (like tasks.html) inject the header at runtime.
  // Ensure the logo toggle exists AFTER the header is created.
  // (ensureMenuToggle() is safe to call multiple times.)
  menuToggle = ensureMenuToggle() || menuToggle;
  wireMenuToggleOnce();
  ensureDashboardHeaderLayout();
  initMobileHeaderAutoHide();

  // لو عندك لينكات بتتعمل inject في صفحات معينة:
  // Home should appear for everyone (not tied to permissions), and all pages
  // should keep one stable order on every route.
  bindSidebarScrollPersistence();
  watchLmsSidebarNavigation();
  ensureOrderedSidebarLinks();
  normalizeKitsSidebarIcon();
  removeSidebarMailLinks();
  removeSidebarSystemLinks();
  reorderSidebarNav();

  // Apply cached chrome immediately so Hard Refresh does not show a different
  // header/sidebar while /api/account is still loading. The server response below
  // still refreshes the permissions, so added/removed pages continue to take effect.
  primeChromeFromCache();

  syncMobileDockStructure();
  reorderSidebarNav();
  scheduleSidebarScrollRestore();

  // UI Redesign: sidebar tooltips (labels are hidden in the new style)
  ensureNavTooltips();

  ensureGreetingAndPages();
  enforceLmsSidebarNavigation();

  window.addEventListener('user:updated', () => {
    // Refresh name + sidebar profile + permissions from the server
    ensureGreetingAndPages();
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      applyInitial();
      reorderSidebarNav();
      syncMobileDockStructure();
      reorderSidebarNav();
      scheduleSidebarScrollRestore();
    }, 150);
  });

  if (window.feather) feather.replace();

  window.setTimeout(() => {
    try {
      let shellExpected = false;
      try {
        shellExpected =
          typeof shouldSkipOpsPersistentShellHostOnMobile === 'function' &&
          typeof shouldSkipOpsPersistentShellHostForCurrentPage === 'function' &&
          !shouldSkipOpsPersistentShellHostOnMobile() &&
          !shouldSkipOpsPersistentShellHostForCurrentPage();
      } catch {}

      try { window.__opsFreshLoadOverlaySetShellExpected?.(shellExpected); } catch {}
      initOpsPersistentShellHost();

      // If the shell did not initialize, the normal page chrome is the final chrome.
      if (!window.__opsShellHostInitialized) {
        try { window.__opsFreshLoadOverlaySetShellExpected?.(false); } catch {}
      }
    } catch (e) {
      try { window.__opsFreshLoadOverlaySetShellExpected?.(false); } catch {}
      console.warn('[ops-shell] init failed', e);
    }
  }, 0);
});


function initMobileHeaderAutoHide() {
  const mainContent = document.querySelector('.main-content');
  const header = mainContent?.querySelector('.main-header');
  const scroller = mainContent?.querySelector(':scope > main') || mainContent?.querySelector('main');
  if (!mainContent || !header || !scroller) return;

  const media = window.matchMedia('(max-width: 768px)');
  let lastTop = 0;
  let hidden = false;
  let ticking = false;

  function syncHeaderHeight() {
    const wasHidden = mainContent.classList.contains('mobile-header-hidden');
    if (wasHidden) mainContent.classList.remove('mobile-header-hidden');

    const applyHeight = () => {
      const height = Math.ceil(header.scrollHeight || header.offsetHeight || 0);
      if (height > 0) {
        mainContent.style.setProperty('--mobile-header-height', `${height}px`);
      }
      if (wasHidden && hidden && media.matches) {
        mainContent.classList.add('mobile-header-hidden');
      }
    };

    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(applyHeight);
    } else {
      window.setTimeout(applyHeight, 0);
    }
  }

  function showHeader(force = false) {
    hidden = false;
    mainContent.classList.remove('mobile-header-hidden');
    if (force) lastTop = Number(scroller.scrollTop || 0);
  }

  function hideHeader() {
    if (hidden) return;
    hidden = true;
    mainContent.classList.add('mobile-header-hidden');
  }

  function handleScroll() {
    if (!media.matches) {
      showHeader(true);
      return;
    }

    const currentTop = Math.max(0, Number(scroller.scrollTop || 0));
    const delta = currentTop - lastTop;

    if (currentTop <= 8) {
      showHeader(true);
      return;
    }

    if (Math.abs(delta) < 6) return;

    if (delta > 0 && currentTop > 72) {
      hideHeader();
    } else if (delta < 0) {
      showHeader();
    }

    lastTop = currentTop;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    const flush = () => {
      ticking = false;
      handleScroll();
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(flush);
    } else {
      window.setTimeout(flush, 16);
    }
  }

  function onViewportChange() {
    syncHeaderHeight();
    if (!media.matches) {
      showHeader(true);
      return;
    }
    if ((scroller.scrollTop || 0) <= 8) {
      showHeader(true);
    }
  }

  scroller.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onViewportChange);
  } else if (typeof media.addListener === 'function') {
    media.addListener(onViewportChange);
  }

  syncHeaderHeight();
  showHeader(true);
}


// UI Toast — modern notifications
(() => {
  const ROOT_ID = 'toast-root';

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.setAttribute('aria-live', 'polite');
      root.setAttribute('aria-atomic', 'true');
      document.body.appendChild(root);
    }
    return root;
  }

  function iconNameByType(type) {
    switch (type) {
      case 'success': return 'check-circle';
      case 'error':   return 'x-circle';
      case 'warning': return 'alert-triangle';
      default:        return 'info';
    }
  }

  function toast({ title = '', message = '', type = 'success', duration = 4000 } = {}) {
    const root = ensureRoot();
    const safeTitle = window.OpsSafeMessage?.sanitize ? window.OpsSafeMessage.sanitize(title) : String(title || '');
    const safeMessage = window.OpsSafeMessage?.sanitize ? window.OpsSafeMessage.sanitize(message) : String(message || '');
    const escapeToastHtml = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const el = document.createElement('div');
    el.className = `toast toast--${type}`;

    el.innerHTML = `
      <div class="toast__icon"><i data-feather="${iconNameByType(type)}"></i></div>
      <div class="toast__body">
        ${safeTitle ? `<div class="toast__title">${escapeToastHtml(safeTitle)}</div>` : ''}
        <div class="toast__msg">${escapeToastHtml(safeMessage)}</div>
      </div>
      <button class="toast__close" aria-label="Close">&times;</button>
      <div class="toast__progress"></div>
    `;

    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    if (window.feather) feather.replace({ 'stroke-width': 2 });

    const close = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
    };
    el.querySelector('.toast__close').addEventListener('click', close);

    let start = Date.now();
    const prog = el.querySelector('.toast__progress');
    const tick = () => {
      const pct = Math.min(100, ((Date.now() - start) / duration) * 100);
      prog.style.width = `${100 - pct}%`;
      if (pct < 100 && document.body.contains(el)) requestAnimationFrame(tick);
      else close();
    };
    requestAnimationFrame(tick);
  }

  window.UI = window.UI || {};
  window.UI.toast = toast;
})();

// ============================================================================
// Global protection against double-submits (auto busy state)
// - Adds a loading spinner animation on the last clicked button while a
//   mutating fetch (POST/PATCH/PUT/DELETE) is in-flight.
// - Disables the button to prevent multiple clicks.
// Works across all pages without needing to manually update every handler.
// ============================================================================
(function () {
  if (window.__opsAutoBusyWrapped) return;
  window.__opsAutoBusyWrapped = true;

  // Track the last clicked actionable element (more reliable than activeElement
  // when the code disables the button before starting the fetch).
  let lastActionEl = null;
  let lastActionAt = 0;

  const ACTION_SELECTOR = "button, .btn, .ro-action-btn";

  document.addEventListener(
    "pointerdown",
    (e) => {
      const el = e.target && e.target.closest ? e.target.closest(ACTION_SELECTOR) : null;
      if (!el) return;
      lastActionEl = el;
      lastActionAt = Date.now();
    },
    true,
  );

  function getRequestMethod(input, init) {
    try {
      if (init && init.method) return String(init.method).toUpperCase();
      if (input && typeof input === "object" && input.method) return String(input.method).toUpperCase();
    } catch {}
    return "GET";
  }

  function getBusyTarget() {
    // Prefer currently focused element
    const active = document.activeElement;
    const a = active && active.closest ? active.closest(ACTION_SELECTOR) : null;
    if (a) return a;

    // Fallback to the last clicked element (within a short window)
    if (lastActionEl && Date.now() - lastActionAt < 2500) return lastActionEl;
    return null;
  }

  function setAutoBusy(el, busy) {
    if (!el) return;
    const key = "autoBusyCount";
    const count = Number(el.dataset[key] || 0);

    if (busy) {
      const next = count + 1;
      el.dataset[key] = String(next);
      if (next === 1) {
        el.classList.add("is-auto-busy");

        // aria-busy is used for accessibility + can be used by CSS if needed
        const hadAriaBusy = el.getAttribute("aria-busy") === "true";
        el.dataset.autoBusyHadAria = hadAriaBusy ? "1" : "0";
        el.setAttribute("aria-busy", "true");

        // Disable only if it is a real <button> and it was not disabled already
        if (String(el.tagName).toUpperCase() === "BUTTON") {
          const wasDisabled = !!el.disabled;
          el.dataset.autoBusyWeDisabled = wasDisabled ? "0" : "1";
          if (!wasDisabled) el.disabled = true;
        }
      }
      return;
    }

    const next = Math.max(0, count - 1);
    el.dataset[key] = String(next);
    if (next === 0) {
      el.classList.remove("is-auto-busy");

      if (el.dataset.autoBusyHadAria === "0") {
        el.removeAttribute("aria-busy");
      }

      if (String(el.tagName).toUpperCase() === "BUTTON" && el.dataset.autoBusyWeDisabled === "1") {
        el.disabled = false;
      }

      delete el.dataset[key];
      delete el.dataset.autoBusyHadAria;
      delete el.dataset.autoBusyWeDisabled;
    }
  }

  // Wrap fetch
  if (!window.fetch) return;
  const origFetch = window.fetch.bind(window);
  const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

  window.fetch = function (input, init) {
    const method = getRequestMethod(input, init);

    let target = null;
    if (MUTATING.has(method)) {
      target = getBusyTarget();
      if (target && target.getAttribute && target.getAttribute("data-no-auto-busy") !== null) {
        target = null;
      }
      if (target) setAutoBusy(target, true);
    }

    const p = origFetch(input, init);
    if (!target) return p;

    // Ensure cleanup on both success and failure
    if (p && typeof p.finally === "function") {
      return p.finally(() => setAutoBusy(target, false));
    }

    return p.then(
      (r) => {
        setAutoBusy(target, false);
        return r;
      },
      (e) => {
        setAutoBusy(target, false);
        throw e;
      },
    );
  };
})();


// --------------------------------------------
// Notifications UI + Push subscription (PWA)
// --------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (isOpsShellEmbeddedMode()) return;

  try {
    initNotificationsWidget();
  } catch (e) {
    console.warn("[notifications] init failed", e);
  }

  try {
    initFloatingSearchWidget();
  } catch (e) {
    console.warn("[search] init failed", e);
  }


  try {
    initUserMenuWidget();
  } catch (e) {
    console.warn("[user-menu] init failed", e);
  }
});

function initNotificationsWidget() {
  // Avoid duplicates
  if (document.getElementById("notifBellBtn")) return;

  const mount =
    document.querySelector(".main-header .header-row1 .right") ||
    document.querySelector(".main-header .header-row1") ||
    document.querySelector(".tasks-v2-actions") ||
    null;

  if (!mount) return;

  const wrap = document.createElement("div");
  wrap.className = "notif-wrap";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "notifBellBtn";
  btn.className = "notif-bell-btn";
  btn.setAttribute("aria-label", "Notifications");
  btn.innerHTML = `
    <i data-feather="bell"></i>
    <span class="notif-badge" id="notifBadge" hidden>0</span>
  `;

  const panel = document.createElement("div");
  panel.id = "notifPanel";
  // NOTE: we mount the panel as a portal (on <body>) so it doesn't
  // affect the header layout and doesn't get clipped by containers.
  panel.className = "notif-panel notif-panel--portal";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Notifications");
  panel.hidden = true;

  // Force overlay positioning (even if legacy CSS changes)
  panel.style.position = 'fixed';
  panel.style.zIndex = '999999';

  panel.innerHTML = `
    <div class="notif-center-shell">
      <div class="notif-center-card">
        <div class="notif-center-head">
          <div class="notif-center-title">Notification</div>
          <button type="button" class="notif-center-markall" id="notifMarkAllReadBtn">Mark all as read</button>
        </div>

        <div class="notif-center-tabs" role="tablist" aria-label="Notification filters">
          <button type="button" class="notif-tab is-active" role="tab" aria-selected="true" data-scope="today">Today</button>
          <button type="button" class="notif-tab" role="tab" aria-selected="false" data-scope="week">This Week</button>
          <button type="button" class="notif-tab" role="tab" aria-selected="false" data-scope="earlier">Earlier</button>
        </div>

        <div class="notif-panel__list" id="notifList">
          <div class="notif-empty">Loading…</div>
        </div>

        <div class="notif-center-footer">
          <button type="button" class="notif-center-seeall" id="notifSeeAllBtn">See All</button>
        </div>
      </div>
    </div>
  `;

  wrap.appendChild(btn);

  // Insert before user avatar if available
  const user = mount.querySelector('.header-user') || mount.querySelector('a.account-mini');
  if (user) mount.insertBefore(wrap, user);
  else mount.appendChild(wrap);

  // Portal mount (dropdown should NOT live inside the header)
  document.body.appendChild(panel);

  // Positioning helpers
  function positionNotifPanel() {
    if (panel.hidden) return;
    try {
      const rect = btn.getBoundingClientRect();
      const gap = 12;

      // Prefer anchoring to the bell button (right aligned)
      const top = rect.bottom + gap;
      const right = Math.max(14, Math.round(window.innerWidth - rect.right));

      panel.style.top = `${Math.round(top)}px`;
      panel.style.right = `${right}px`;
      panel.style.left = 'auto';

      // Keep inside viewport
      const pRect = panel.getBoundingClientRect();
      if (pRect.left < 14) {
        panel.style.left = '14px';
        panel.style.right = 'auto';
      }

      // Prevent the panel from going beyond the bottom of the viewport
      const maxH = Math.max(240, Math.round(window.innerHeight - top - 16));
      panel.style.maxHeight = `${maxH}px`;
    } catch {}
  }

  let _notifPosRaf = 0;
  function requestNotifPanelPosition() {
    if (panel.hidden) return;
    if (_notifPosRaf) cancelAnimationFrame(_notifPosRaf);
    _notifPosRaf = requestAnimationFrame(positionNotifPanel);
  }

  // Keep it aligned on resize/scroll
  window.addEventListener('resize', requestNotifPanelPosition);
  window.addEventListener('scroll', requestNotifPanelPosition, true);

  if (window.feather) {
    try { window.feather.replace(); } catch {}
  }

  function closeNotifPanel() {
    if (panel.hidden) return;
    btn.setAttribute("aria-expanded", "false");
    panel.classList.remove("is-open");

    const finish = () => {
      panel.hidden = true;
      panel.removeEventListener("transitionend", finish);
    };

    panel.addEventListener("transitionend", finish);
    setTimeout(finish, 240);
  }

  async function openNotifPanel() {
    if (!panel.hidden) return;
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");

    // Make sure we are positioned before rendering
    requestNotifPanelPosition();
    requestAnimationFrame(() => {
      requestNotifPanelPosition();
      panel.classList.add("is-open");
    });

    // Reset view each time we open
    const st = getNotifState();
    st.showAll = false;
    st.activeTab = st.activeTab || 'today';
    syncNotifTabs();
    syncNotifSeeAll();
    await refreshNotifications(true);

    // Re-position after content renders (height may change)
    requestNotifPanelPosition();
  }

  window.__opsCloseNotifications = closeNotifPanel;

  // Handlers
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // If another top-right panel is open, close it first (matches the reference behavior).
    try { window.__opsCloseUserMenu && window.__opsCloseUserMenu(); } catch {}
    try { window.__opsCloseFloatingSearch && window.__opsCloseFloatingSearch(); } catch {}

    if (panel.hidden) {
      try { ensureOpsPushNotificationsEnabled({ ask: true, quiet: true }); } catch {}
      await openNotifPanel();
    } else closeNotifPanel();
  });

  document.addEventListener("click", (e) => {
    if (panel.hidden) return;
    const target = e.target;
    if (!target) return;
    if (btn.contains(target) || panel.contains(target)) return;
    closeNotifPanel();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      closeNotifPanel();
    }
  });

  document.getElementById("notifSeeAllBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const st = getNotifState();
    st.showAll = !st.showAll;
    const listEl = document.getElementById('notifList');
    if (listEl) renderNotificationsList(listEl, Array.isArray(st.items) ? st.items : []);
  });

  document.getElementById("notifMarkAllReadBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.currentTarget;
    if (btn) btn.disabled = true;
    await markAllRead();
    try {
      const st = getNotifState();
      st.items = (Array.isArray(st.items) ? st.items : []).map((item) => item ? { ...item, read: true } : item);
      const listEl = document.getElementById('notifList');
      if (listEl) renderNotificationsList(listEl, st.items);
    } catch {}
    try { await refreshNotifications(false); } catch {}
  });

  // Tabs
  panel.querySelectorAll('.notif-tab')?.forEach((t) => {
    t.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const scope = t.getAttribute('data-scope') || 'today';
      const st = getNotifState();
      st.activeTab = scope;
      syncNotifTabs();
      const listEl = document.getElementById('notifList');
      if (listEl) renderNotificationsList(listEl, Array.isArray(st.items) ? st.items : []);
    });
  });

  // Initial badge load + faster live polling. Use a single global timer so pages
  // loaded inside the desktop shell/iframe do not start competing notification loops.
  const pollMs = Math.max(6000, Math.min(30000, Number(window.OPS_NOTIFICATIONS_POLL_MS || 8000)));
  refreshNotifications(false);
  try { ensureOpsPushNotificationsEnabled({ ask: false, quiet: true }); } catch {}
  if (!window.__opsNotifPollTimer) {
    window.__opsNotifPollTimer = setInterval(() => refreshNotifications(false), pollMs);
  }
  if (!window.__opsNotifFocusRefreshBound) {
    window.__opsNotifFocusRefreshBound = true;
    window.addEventListener('focus', () => refreshNotifications(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshNotifications(false);
    });
  }
}


// --------------------------------------------
// Floating Search (icon next to bell)
// --------------------------------------------
function initFloatingSearchWidget() {
  // Avoid duplicates
  let btn =
    document.getElementById("searchIconBtn") ||
    document.getElementById("headerSearchBtn") ||
    document.querySelector(".search-icon-btn");

  const mount =
    document.querySelector(".main-header .header-row1 .right") ||
    document.querySelector(".main-header .topbar-right") ||
    document.querySelector(".main-header .header-row1") ||
    document.querySelector(".tasks-v2-actions") ||
    null;

  if (!mount) return;

  const notifWrap = mount.querySelector(".notif-wrap") || null;
  const userEl =
    mount.querySelector("a.header-user") ||
    mount.querySelector("a.account-mini") ||
    null;

  // Create button if needed
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "searchIconBtn";
  }

  // Ensure the button is mounted in the right place on every page
  if (btn.parentElement !== mount) {
    if (notifWrap) mount.insertBefore(btn, notifWrap);
    else if (userEl) mount.insertBefore(btn, userEl);
    else mount.insertBefore(btn, mount.firstChild);
  } else {
    // Keep the order: Search → Bell → User
    if (notifWrap && btn.nextSibling !== notifWrap) {
      mount.insertBefore(btn, notifWrap);
    } else if (!notifWrap && userEl && btn.nextSibling !== userEl) {
      mount.insertBefore(btn, userEl);
    }
  }

  btn.className = "search-icon-btn";
  btn.setAttribute("aria-label", "Search");
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("title", "Search");

  // Some pages/themes might set button/icon colors globally.
  // Force the icon color so it never renders "invisible".
  try {
    btn.style.setProperty("color", "#0F172A", "important");
  } catch {
    btn.style.color = "#0F172A";
  }

  btn.innerHTML = `
    <svg class="search-icon-svg" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" role="img">
      <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2.5" fill="none" />
      <line x1="16.65" y1="16.65" x2="21" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
    </svg>
  `;
  document.body.classList.add("has-floating-search");

  let panel = document.getElementById("floatingSearchPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "floatingSearchPanel";
    panel.className = "floating-search-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="floating-search-inner">
        <svg class="search-icon-svg" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" role="img">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2.5" fill="none" />
          <line x1="16.65" y1="16.65" x2="21" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
        </svg>
        <input id="floatingSearchInput" type="search" placeholder="Search" aria-label="Search" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" />
      </div>
    `;
    document.body.appendChild(panel);
  }

  const input = panel.querySelector("#floatingSearchInput");

  function normalizeSearchText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function uniqueElements(list) {
    return Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean)));
  }

  function getSearchDocs() {
    return uniqueElements([getOpsPersistentShellFrameDocument(), document].filter(Boolean));
  }

  function getLinkedSearchInputs() {
    const selector = [
      ".main-header .searchbar input[type='search']",
      ".main-header .searchbar input:not([type])",
      ".tasks-v2-toolbar input[type='search']",
      ".tasks-v2-topbar input[type='search']",
      "#homeSearch",
      "#orderSearch",
      "#requestedSearch",
      "#svSearch",
      "#b2bSearch",
      "#stockSearch",
      "#schoolStockSearch",
      "#notifSearch",
      "#msgSearchInput"
    ].join(",");

    return uniqueElements(getSearchDocs().flatMap((doc) => Array.from(doc.querySelectorAll(selector)))).filter((el) => {
      if (!el || el === input || panel.contains(el)) return false;
      return !el.closest('[data-ops-shell-legacy="1"]');
    });
  }

  function getGenericSearchItems() {
    const selector = [
      ".co-card",
      ".order-card",
      ".tv2-card",
      ".task-card",
      ".stock-card",
      ".stock-item",
      ".school-folder-card",
      ".folder-card",
      ".notif-row",
      ".product-card",
      ".msg-chat-row",
      ".msg-person-card"
    ].join(",");

    return uniqueElements(getSearchDocs().flatMap((doc) => Array.from(doc.querySelectorAll(selector)))).filter((el) => !el.closest('[data-ops-shell-legacy="1"]'));
  }

  function applyGenericSearchFallback(query) {
    const items = getGenericSearchItems();
    if (!items.length) return;

    const q = normalizeSearchText(query);
    items.forEach((el) => {
      const hay = normalizeSearchText(el.getAttribute("data-search") || el.textContent || "");
      const shouldShow = !q || hay.includes(q);
      el.style.display = shouldShow ? "" : "none";
    });
  }

  function syncFloatingInputFromPage() {
    const linked = getLinkedSearchInputs();
    const primary = linked[0] || null;
    if (!primary || !input) return;

    try {
      input.value = primary.value || "";
    } catch {}

    const placeholder = String(primary.getAttribute("placeholder") || "").trim();
    if (placeholder) {
      input.setAttribute("placeholder", placeholder);
      input.setAttribute("aria-label", placeholder);
    } else {
      input.setAttribute("placeholder", "Search");
      input.setAttribute("aria-label", "Search");
    }
  }

  function pushFloatingQueryToPage(nextValue) {
    const linked = getLinkedSearchInputs();
    if (!linked.length) {
      applyGenericSearchFallback(nextValue);
      return;
    }

    linked.forEach((el) => {
      if (!el) return;
      try {
        el.dataset.opsFloatingSearchSync = "1";
      } catch {}
      try {
        el.value = nextValue;
      } catch {}
      const ViewEvent = el.ownerDocument?.defaultView?.Event || Event;
      try {
        el.dispatchEvent(new ViewEvent("input", { bubbles: true }));
      } catch {}
      try {
        el.dispatchEvent(new ViewEvent("change", { bubbles: true }));
      } catch {}
      setTimeout(() => {
        try { delete el.dataset.opsFloatingSearchSync; } catch {}
      }, 0);
    });
  }

  function positionPanel() {
    const r = btn.getBoundingClientRect();
    const top = Math.max(12, r.bottom + 10);
    const right = Math.max(12, window.innerWidth - r.right);
    panel.style.position = "fixed";
    panel.style.top = `${top}px`;
    panel.style.right = `${right}px`;
    panel.style.left = "auto";
    panel.style.zIndex = "999999";

    const maxWidth = Math.min(520, Math.max(280, window.innerWidth - 28));
    panel.style.width = `${maxWidth}px`;

    const rect = panel.getBoundingClientRect();
    if (rect.left < 14) {
      panel.style.left = "14px";
      panel.style.right = "14px";
      panel.style.width = "auto";
    }
  }

  function openPanel() {
    syncFloatingInputFromPage();
    positionPanel();

    panel.classList.remove("is-open");
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");

    requestAnimationFrame(() => {
      positionPanel();
      panel.classList.add("is-open");
    });

    setTimeout(() => {
      try {
        input && input.focus();
        input && input.select();
      } catch {}
    }, 0);
  }

  function closePanel() {
    if (panel.hidden) return;
    btn.setAttribute("aria-expanded", "false");
    panel.classList.remove("is-open");

    const finish = () => {
      panel.hidden = true;
      panel.removeEventListener("transitionend", finish);
    };

    panel.addEventListener("transitionend", finish);
    setTimeout(finish, 240);
  }

  window.__opsCloseFloatingSearch = closePanel;

  if (input && input.dataset.floatingSearchInputBound !== "1") {
    input.dataset.floatingSearchInputBound = "1";

    input.addEventListener("input", () => {
      pushFloatingQueryToPage(input.value || "");
    });

    input.addEventListener("search", () => {
      pushFloatingQueryToPage(input.value || "");
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (input.value) {
          input.value = "";
          pushFloatingQueryToPage("");
        }
        closePanel();
      }
    });
  }

  // Bind only once per page lifecycle
  if (btn.dataset.floatingSearchBound !== "1") {
    btn.dataset.floatingSearchBound = "1";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      try { window.__opsCloseUserMenu && window.__opsCloseUserMenu(); } catch {}
      try { window.__opsCloseNotifications && window.__opsCloseNotifications(); } catch {}

      if (panel.hidden) openPanel();
      else closePanel();
    });

    document.addEventListener("click", (e) => {
      if (panel.hidden) return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      closePanel();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });

    window.addEventListener("resize", () => {
      if (!panel.hidden) positionPanel();
    });

    window.addEventListener("scroll", () => {
      if (!panel.hidden) positionPanel();
    }, true);
  }
}


// --------------------------------------------
// User Menu (avatar → drop window)
// --------------------------------------------

function initUserMenuWidget() {
  const mount =
    document.querySelector(".main-header .header-row1 .right") ||
    document.querySelector(".main-header .header-row1") ||
    document.querySelector(".tasks-v2-actions") ||
    null;

  if (!mount) return;

  // The trigger is the user pill/avatar (generated by renderHeaderUser)
  const trigger =
    mount.querySelector("a.header-user") ||
    mount.querySelector("a.account-mini") ||
    document.querySelector(".main-header a.header-user") ||
    document.querySelector(".main-header a.account-mini") ||
    null;

  if (!trigger) return;

  // Avoid binding twice (trigger element is stable; only innerHTML changes)
  if (trigger.dataset.userMenuBound === "1") {
    // Still ensure we expose the close handler globally
    const existing = document.getElementById("userMenuPanel");
    if (existing) window.__opsCloseUserMenu = () => { try { existing.hidden = true; trigger.setAttribute("aria-expanded", "false"); } catch {} };
    return;
  }
  trigger.dataset.userMenuBound = "1";

  try {
    const existingHref = trigger.getAttribute('href');
    if (existingHref) trigger.dataset.userMenuHref = existingHref;
    trigger.removeAttribute('href');
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.dataset.userMenuTrigger = '1';
  } catch {}

  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");

  // Panel (portal)
  let panel = document.getElementById("userMenuPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "userMenuPanel";
    panel.className = "user-menu-panel user-menu-panel--portal";
    panel.hidden = true;
    panel.setAttribute("role", "menu");
    panel.setAttribute("aria-label", "User menu");
    // Force overlay positioning (even if legacy CSS changes)
    panel.style.position = "fixed";
    panel.style.zIndex = "999999";
    panel.innerHTML = `
      <div class="user-menu-shell">
        <div class="user-menu-user" aria-label="Signed in user">
          <span class="user-menu-user__avatar" aria-hidden="true">
            <img class="user-menu-user__img" data-user-menu-img alt="Profile photo" />
            <span class="user-menu-user__fallback" data-user-menu-fallback></span>
          </span>
          <div class="user-menu-user__meta">
            <div class="user-menu-user__name" data-user-menu-name>—</div>
            <div class="user-menu-user__role" data-user-menu-role></div>
          </div>
        </div>

        <div class="user-menu-sep user-menu-sep--tight" role="separator"></div>

        <button type="button" class="user-menu-item" data-user-menu-action="profile">
          <span class="umi-ico"><i data-feather="user"></i></span>
          <span class="umi-label">User Profile</span>
        </button>

        <button type="button" class="user-menu-item" data-user-menu-action="history">
          <span class="umi-ico"><i data-feather="clock"></i></span>
          <span class="umi-label">History</span>
        </button>

        <button type="button" class="user-menu-item" data-user-menu-action="backup">
          <span class="umi-ico"><i data-feather="database"></i></span>
          <span class="umi-label">Database</span>
        </button>

        <button type="button" class="user-menu-item" data-user-menu-action="how">
          <span class="umi-ico"><i data-feather="activity"></i></span>
          <span class="umi-label">How it works</span>
        </button>

        <button type="button" class="user-menu-item user-menu-item--app" data-user-menu-action="app-downloads">
          <span class="umi-ico"><i data-feather="smartphone"></i></span>
          <span class="umi-label">App</span>
        </button>

        <button type="button" class="user-menu-item user-menu-item--refresh" data-user-menu-action="hard-refresh">
          <span class="umi-ico"><i data-feather="rotate-cw"></i><span class="umi-spinner" aria-hidden="true"></span></span>
          <span class="umi-label">Hard Refresh</span>
        </button>

        <div class="user-menu-sep" role="separator"></div>

        <button type="button" class="user-menu-item user-menu-item--danger" data-user-menu-action="logout">
          <span class="umi-ico"><i data-feather="log-out"></i></span>
          <span class="umi-label">Log out</span>
        </button>
      </div>
    `;
    document.body.appendChild(panel);
    try { syncUserMenuPageAccess(getCachedAllowedPages() || []); } catch {}
  } else {
    try { syncUserMenuPageAccess(getCachedAllowedPages() || []); } catch {}
  }

  // Keep the header section (avatar + name + position) in sync with the account info.
  function applyUserInfoToMenu(info) {
    const safe = info && typeof info === 'object' ? info : {};
    const name = String(safe.name || localStorage.getItem('username') || 'User').trim() || 'User';
    const role = String(safe.position || safe.department || '').trim();
    const photoUrl = String(safe.photoUrl || '').trim();

    const elName = panel.querySelector('[data-user-menu-name]');
    const elRole = panel.querySelector('[data-user-menu-role]');
    const img = panel.querySelector('[data-user-menu-img]');
    const fb = panel.querySelector('[data-user-menu-fallback]');

    if (elName) elName.textContent = name;
    if (elRole) elRole.textContent = role;

    // Initials helper (kept local to avoid depending on other closures)
    const initials = (function initialsFrom(n) {
      const parts = String(n || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '';
      const first = parts[0][0] || '';
      const last = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
      return (String(first) + String(last)).toUpperCase();
    })(name);

    if (img) {
      if (photoUrl) {
        img.src = photoUrl;
        img.style.display = 'block';
        img.alt = name + ' photo';
        if (fb) fb.style.display = 'none';
      } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        if (fb) {
          fb.textContent = initials;
          fb.style.display = 'grid';
        }
      }
    }
  }

  // Apply immediately from cache/global (then refresh via /api/account)
  try { applyUserInfoToMenu(window.__opsUserInfo || {}); } catch {}

  // Listen to updates from ensureGreetingAndPages()
  if (!window.__opsUserMenuInfoBound) {
    window.__opsUserMenuInfoBound = true;
    window.addEventListener('ops:userinfo', (e) => {
      try { applyUserInfoToMenu(e && e.detail ? e.detail : {}); } catch {}
    });
  }

  function positionPanel() {
    if (panel.hidden) return;
    try {
      const rect = trigger.getBoundingClientRect();
      const gap = 12;

      const top = rect.bottom + gap;
      const right = Math.max(14, Math.round(window.innerWidth - rect.right));

      panel.style.top = `${Math.round(top)}px`;
      panel.style.right = `${right}px`;
      panel.style.left = "auto";

      // Keep inside viewport
      const pRect = panel.getBoundingClientRect();
      if (pRect.left < 14) {
        panel.style.left = "14px";
        panel.style.right = "auto";
      }

      const maxH = Math.max(180, Math.round(window.innerHeight - top - 16));
      panel.style.maxHeight = `${maxH}px`;
      panel.style.overflow = "auto";
    } catch {}
  }

  let _posRaf = 0;
  function requestPosition() {
    if (panel.hidden) return;
    if (_posRaf) cancelAnimationFrame(_posRaf);
    _posRaf = requestAnimationFrame(positionPanel);
  }

  function closeMenu() {
    if (panel.hidden) return;
    trigger.setAttribute("aria-expanded", "false");
    panel.classList.remove("is-open");

    const finish = () => {
      panel.hidden = true;
      panel.removeEventListener("transitionend", finish);
    };

    panel.addEventListener("transitionend", finish);
    setTimeout(finish, 240);
  }

  function openMenu() {
    // Close other top-right panels first
    try { window.__opsCloseNotifications && window.__opsCloseNotifications(); } catch {}
    try { window.__opsCloseFloatingSearch && window.__opsCloseFloatingSearch(); } catch {}

    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    requestPosition();
    requestAnimationFrame(() => {
      requestPosition();
      panel.classList.add("is-open");
    });
  }

  // Expose a global close helper so other widgets (search/bell) can close it.
  window.__opsCloseUserMenu = closeMenu;

  // Trigger click
  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (panel.hidden) openMenu();
    else closeMenu();
  });

  // Keyboard support
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (panel.hidden) openMenu();
      else closeMenu();
    }
    if (e.key === "Escape") closeMenu();
  });

  // Action clicks (delegated)
  if (panel.dataset.actionsBound !== "1") {
    panel.dataset.actionsBound = "1";

    async function doLogout() {
      try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch(e) {}
      try { sessionStorage.clear(); } catch {}
      try {
        localStorage.removeItem('ui.sidebarMini');
        localStorage.removeItem('ui.sidebarCollapsed');
        localStorage.removeItem('username');
        localStorage.removeItem('ops.ui.chrome.v1');
      } catch {}
      window.location.href = '/login';
    }

    async function doHardRefresh(btn) {
      if (window.OpsHardRefresh && typeof window.OpsHardRefresh.run === 'function') {
        return window.OpsHardRefresh.run(btn || null);
      }
      // Last-resort fallback: reload with fresh markers if the global helper is unavailable.
      try { clearKnownClientDataCaches(); } catch {}
      markHardRefreshPending();
      const url = new URL(window.location.href);
      url.searchParams.set('_fresh', '1');
      url.searchParams.set('_refresh', String(Date.now()));
      window.location.replace(url.toString());
    }

    function safeUserMenuText(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function ensureAppDownloadModal() {
      let overlay = document.getElementById('appDownloadOverlay');
      if (overlay) return overlay;

      overlay = document.createElement('div');
      overlay.id = 'appDownloadOverlay';
      overlay.className = 'app-download-overlay';
      overlay.hidden = true;
      overlay.innerHTML = `
        <div class="app-download-modal" role="dialog" aria-modal="true" aria-labelledby="appDownloadTitle">
          <button type="button" class="app-download-close" data-app-download-close aria-label="Close app download window">
            <i data-feather="x"></i>
            <span aria-hidden="true">×</span>
          </button>
          <div class="app-download-head">
            <span class="app-download-icon"><i data-feather="download-cloud"></i></span>
            <div>
              <div class="app-download-kicker">Operations Hub App</div>
              <h2 id="appDownloadTitle">Download the application</h2>
              <p>Choose the suitable version for your device.</p>
            </div>
          </div>
          <div class="app-download-body" data-app-download-body>
            <div class="app-download-loading">Loading download links...</div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.addEventListener('click', (event) => {
        const installBtn = event.target && event.target.closest ? event.target.closest('[data-pwa-install-platform]') : null;
        if (installBtn) {
          event.preventDefault();
          event.stopPropagation();
          const platform = installBtn.getAttribute('data-pwa-install-platform') || '';
          try { runPwaInstallPrompt(platform); } catch (error) { console.error('PWA install click failed:', error); }
          return;
        }

        const closeBtn = event.target && event.target.closest ? event.target.closest('[data-app-download-close]') : null;
        if (closeBtn || event.target === overlay) {
          overlay.hidden = true;
        }
      });

      if (!window.__opsAppDownloadEscBound) {
        window.__opsAppDownloadEscBound = true;
        document.addEventListener('keydown', (event) => {
          if (event.key !== 'Escape') return;
          const activeOverlay = document.getElementById('appDownloadOverlay');
          if (activeOverlay && !activeOverlay.hidden) activeOverlay.hidden = true;
        });
      }

      try { if (window.feather) window.feather.replace(); } catch {}
      return overlay;
    }

    function isUsableDownloadUrl(value) {
      const clean = String(value || '').trim();
      if (!clean) return false;
      const lower = clean.toLowerCase();
      const badParts = [
        'your-android-download-link',
        'your-windows-download-link',
        'your-download-link',
        'your-app-link',
        'yourdomain.com',
        'example.com',
        'https://your-',
        'http://your-',
      ];
      if (badParts.some((part) => lower.includes(part))) return false;
      return /^https?:\/\//i.test(clean) || clean.startsWith('/');
    }

    function renderDirectDownloadOption(label, sublabel, iconName, url) {
      const cleanUrl = String(url || '').trim();
      if (!isUsableDownloadUrl(cleanUrl)) return '';
      return `
        <a class="app-download-option" href="${safeUserMenuText(cleanUrl)}" target="_blank" rel="noopener noreferrer" data-app-download-direct>
          <span class="app-download-option__icon"><i data-feather="${safeUserMenuText(iconName)}"></i></span>
          <span class="app-download-option__text">
            <strong>${safeUserMenuText(label)}</strong>
            <small>${safeUserMenuText(sublabel)}</small>
          </span>
          <span class="app-download-option__arrow"><i data-feather="external-link"></i></span>
        </a>
      `;
    }

    function renderPwaInstallOption(platform, label, sublabel, iconName) {
      return `
        <button type="button" class="app-download-option app-download-option--button" data-pwa-install-platform="${safeUserMenuText(platform)}">
          <span class="app-download-option__icon"><i data-feather="${safeUserMenuText(iconName)}"></i></span>
          <span class="app-download-option__text">
            <strong>${safeUserMenuText(label)}</strong>
            <small>${safeUserMenuText(sublabel)}</small>
          </span>
          <span class="app-download-option__arrow"><i data-feather="download"></i></span>
        </button>
      `;
    }

    function getPwaManualSteps(platform) {
      const isAndroid = String(platform || '').toLowerCase() === 'android';
      if (isAndroid) {
        return `
          <ol class="app-download-steps">
            <li>Open the app in <strong>Chrome on Android</strong>.</li>
            <li>Make sure <strong>Desktop site is OFF</strong>. If it is ON, Chrome often creates only a shortcut instead of installing the PWA app.</li>
            <li>Stay on the page for about <strong>30 seconds</strong> and tap anywhere once, then reopen this App window.</li>
            <li>Tap <strong>Android PWA</strong>. If the browser menu still says only <strong>Add to Home screen</strong>, choose it, then select <strong>Install</strong> if Chrome shows that option.</li>
          </ol>
        `;
      }
      return `
        <ol class="app-download-steps">
          <li>Open the app in <strong>Chrome</strong> or <strong>Microsoft Edge</strong> on Windows.</li>
          <li>Click the install icon in the address bar, or open <strong>⋮ → Apps → Install this site as an app</strong>.</li>
          <li>Confirm <strong>Install</strong>.</li>
        </ol>
      `;
    }

    function getPwaInstallDiagnostic() {
      const isAndroid = /Android/i.test(String(navigator.userAgent || ''));
      const isStandalone = !!(window.OpsPWAInstall && window.OpsPWAInstall.isStandalone && window.OpsPWAInstall.isStandalone());
      const canPrompt = !!(window.OpsPWAInstall && window.OpsPWAInstall.canPrompt && window.OpsPWAInstall.canPrompt());
      const swReady = !!(window.OpsPWAInstall && window.OpsPWAInstall.serviceWorkerReady);

      if (isStandalone) {
        return `<div class="app-download-diagnostic app-download-diagnostic--success">This device is already running the app in installed mode.</div>`;
      }

      if (canPrompt) {
        return `<div class="app-download-diagnostic app-download-diagnostic--success">PWA install is ready. Press Android PWA or Windows PWA below.</div>`;
      }

      if (isAndroid) {
        return `
          <div class="app-download-diagnostic app-download-diagnostic--warning">
            If Chrome shows <strong>Create shortcut</strong> only, turn off <strong>Desktop site</strong> from the Chrome menu, then refresh and try again. Chrome may also need one tap and about 30 seconds on the site before showing the real install prompt.
          </div>
        `;
      }

      if (!swReady) {
        return `<div class="app-download-diagnostic app-download-diagnostic--warning">The service worker is still preparing. Refresh once, then try installing again.</div>`;
      }

      return `<div class="app-download-diagnostic">If the install prompt is not available yet, use the browser install option from the menu.</div>`;
    }

    function setAppDownloadStatus(message, type = 'info', detailsHtml = '') {
      const overlay = document.getElementById('appDownloadOverlay');
      if (!overlay) return;
      const status = overlay.querySelector('[data-app-download-status]');
      if (!status) return;
      status.className = `app-download-status app-download-status--${String(type || 'info').replace(/[^a-z0-9_-]/gi, '')}`;
      status.innerHTML = `
        <div class="app-download-status__title">${safeUserMenuText(message)}</div>
        ${detailsHtml || ''}
      `;
      status.hidden = false;
    }

    async function runPwaInstallPrompt(platform) {
      if (window.OpsPWAInstall && window.OpsPWAInstall.isStandalone && window.OpsPWAInstall.isStandalone()) {
        setAppDownloadStatus('The app is already installed on this device.', 'success');
        return;
      }

      const deferredPrompt = window.OpsPWAInstall && window.OpsPWAInstall.deferredPrompt;
      if (!deferredPrompt) {
        setAppDownloadStatus('Browser install prompt is not available right now.', 'warning', getPwaManualSteps(platform));
        return;
      }

      setAppDownloadStatus('Opening the browser install prompt...', 'info');
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice.catch(() => null);
        const outcome = choice && choice.outcome ? String(choice.outcome) : '';
        window.OpsPWAInstall.deferredPrompt = null;
        window.OpsPWAInstall.lastOutcome = outcome || null;

        if (outcome === 'accepted') {
          setAppDownloadStatus('Install request accepted. The app will be added by the browser.', 'success');
        } else {
          setAppDownloadStatus('Install was dismissed. You can try again from the browser menu.', 'warning', getPwaManualSteps(platform));
        }
      } catch (error) {
        console.error('PWA install prompt failed:', error);
        window.OpsPWAInstall.deferredPrompt = null;
        setAppDownloadStatus('Could not open the install prompt automatically.', 'warning', getPwaManualSteps(platform));
      }
    }

    async function openAppDownloadModal() {
      const overlay = ensureAppDownloadModal();
      const body = overlay.querySelector('[data-app-download-body]');
      if (body) body.innerHTML = '<div class="app-download-loading">Preparing app install options...</div>';
      overlay.hidden = false;

      let links = {};
      try {
        const response = await fetch('/api/app-download-links', { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to load app download links.');
        links = await response.json();
      } catch (error) {
        console.error('App download links failed:', error);
        links = {};
      }

      const directAndroid = renderDirectDownloadOption('Android APK', 'Download a configured APK file', 'smartphone', links.androidUrl);
      const directWindows = renderDirectDownloadOption('Windows installer', 'Download a configured Windows installer', 'monitor', links.windowsUrl);

      if (body) {
        body.innerHTML = `
          <div class="app-download-note">
            <strong>Install the PWA version</strong>
            <span>This installs the current Operations Hub website as an app on Android or Windows. No APK/domain is required.</span>
          </div>
          ${getPwaInstallDiagnostic()}
          ${renderPwaInstallOption('android', 'Android PWA', 'Install to Android Home screen', 'smartphone')}
          ${renderPwaInstallOption('windows', 'Windows PWA', 'Install as a desktop app in Chrome or Edge', 'monitor')}
          ${directAndroid || directWindows ? `
            <div class="app-download-divider"><span>Configured direct downloads</span></div>
            ${directAndroid}
            ${directWindows}
          ` : ''}
          <div class="app-download-status" data-app-download-status hidden></div>
        `;
      }

      try { if (window.feather) window.feather.replace(); } catch {}
    }

    panel.addEventListener("click", async (e) => {
      const btn = e.target && e.target.closest ? e.target.closest("[data-user-menu-action]") : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const action = btn.getAttribute("data-user-menu-action") || "";

      if (action === "app-downloads") {
        closeMenu();
        try { await openAppDownloadModal(); } catch (error) { console.error('App download modal failed:', error); }
        return;
      }

      if (action === "hard-refresh") {
        try { await doHardRefresh(btn); } catch (error) { console.error('Hard refresh failed:', error); }
        return;
      }

      closeMenu();

      if (action === "profile") {
        if (window.OpsShell && typeof window.OpsShell.navigate === 'function') {
          window.OpsShell.navigate('/account', { pushHistory: true });
        } else {
          window.location.href = "/account";
        }
        return;
      }

      if (action === "history") {
        if (window.OpsShell && typeof window.OpsShell.navigate === 'function') {
          window.OpsShell.navigate('/history', { pushHistory: true });
        } else {
          window.location.href = "/history";
        }
        return;
      }

      if (action === "backup") {
        if (window.OpsShell && typeof window.OpsShell.navigate === 'function') {
          window.OpsShell.navigate('/backup', { pushHistory: true });
        } else {
          window.location.href = "/backup";
        }
        return;
      }

      if (action === "how") {
        if (window.OpsShell && typeof window.OpsShell.navigate === 'function') {
          window.OpsShell.navigate('/how-it-works', { pushHistory: true });
        } else {
          window.location.href = "/how-it-works";
        }
        return;
      }

      if (action === "logout") {
        await doLogout();
      }
    });
  }

  // Close on outside click / ESC
  if (!window.__opsUserMenuDocBound) {
    window.__opsUserMenuDocBound = true;

    document.addEventListener("click", (e) => {
      const p = document.getElementById("userMenuPanel");
      if (!p || p.hidden) return;
      const t = document.querySelector(".main-header a.header-user") || document.querySelector(".main-header a.account-mini");
      if (t && t.contains(e.target)) return;
      if (p.contains(e.target)) return;
      try { p.hidden = true; if (t) t.setAttribute("aria-expanded", "false"); } catch {}
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const p = document.getElementById("userMenuPanel");
      if (!p || p.hidden) return;
      const t = document.querySelector(".main-header a.header-user") || document.querySelector(".main-header a.account-mini");
      try { p.hidden = true; if (t) t.setAttribute("aria-expanded", "false"); } catch {}
    });

    window.addEventListener("resize", () => {
      const p = document.getElementById("userMenuPanel");
      if (!p || p.hidden) return;
      try {
        const t = document.querySelector(".main-header a.header-user") || document.querySelector(".main-header a.account-mini");
        if (!t) return;
        const r = t.getBoundingClientRect();
        const gap = 12;
        const top = r.bottom + gap;
        const right = Math.max(14, Math.round(window.innerWidth - r.right));
        p.style.top = `${Math.round(top)}px`;
        p.style.right = `${right}px`;
        p.style.left = "auto";
      } catch {}
    });

    window.addEventListener("scroll", () => {
      const p = document.getElementById("userMenuPanel");
      if (!p || p.hidden) return;
      try {
        const t = document.querySelector(".main-header a.header-user") || document.querySelector(".main-header a.account-mini");
        if (!t) return;
        const r = t.getBoundingClientRect();
        const gap = 12;
        const top = r.bottom + gap;
        const right = Math.max(14, Math.round(window.innerWidth - r.right));
        p.style.top = `${Math.round(top)}px`;
        p.style.right = `${right}px`;
        p.style.left = "auto";
      } catch {}
    }, true);
  }

  if (window.feather) {
    try { window.feather.replace(); } catch {}
  }
}



function getNotifState(){
  if (!window.__notifWidgetState) {
    window.__notifWidgetState = {
      activeTab: 'today',
      showAll: false,
      items: [],
    };
  }
  return window.__notifWidgetState;
}

function syncNotifTabs(){
  const st = getNotifState();
  const active = st.activeTab || 'today';
  document.querySelectorAll('#notifPanel .notif-tab').forEach((btn) => {
    const scope = btn.getAttribute('data-scope') || 'today';
    const on = scope === active;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function syncNotifActions(scopedItems) {
  const st = getNotifState();
  const seeAllBtn = document.getElementById('notifSeeAllBtn');
  const markAllBtn = document.getElementById('notifMarkAllReadBtn');
  const scoped = Array.isArray(scopedItems) ? scopedItems : [];

  if (seeAllBtn) {
    const canExpand = scoped.length > 3;
    seeAllBtn.textContent = st.showAll ? 'Collapse' : 'See All';
    seeAllBtn.disabled = !canExpand;
    seeAllBtn.classList.toggle('is-disabled', !canExpand);
  }

  if (markAllBtn) {
    const all = Array.isArray(st.items) ? st.items : [];
    const unread = all.reduce((count, item) => count + (item && !item.read ? 1 : 0), 0);
    markAllBtn.disabled = unread <= 0;
    markAllBtn.classList.toggle('is-disabled', unread <= 0);
  }
}

function syncNotifSeeAll(){
  syncNotifActions();
}

function notifScope(ts){
  const num = Number(ts);
  const t = Number.isFinite(num) ? num : Date.now();
  const now = new Date();
  const d = new Date(t);

  // Today
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= todayStart) return 'today';

  // This week (Mon → now)
  const day = now.getDay(); // 0 Sun, 1 Mon...
  const diffToMon = (day === 0 ? 6 : day - 1);
  const weekStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon);
  const weekStart = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate()).getTime();
  if (t >= weekStart) return 'week';

  return 'earlier';
}

function formatAgo(ts){
  const num = Number(ts);
  const t = Number.isFinite(num) ? num : Date.now();
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr  = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day >= 1) return `${day}d ago`;
  if (hr >= 1) return `${hr}h ago`;
  if (min >= 1) return `${min}m ago`;
  return 'just now';
}

function pickNotifIcon(n){
  const title = String(n?.title || '').toLowerCase();
  if (title.includes('task')) return 'check-circle';
  if (title.includes('stock')) return 'archive';
  if (title.includes('order')) return 'package';
  return 'bell';
}

async function refreshNotifications(renderList) {
  const badge = document.getElementById("notifBadge");
  const listEl = document.getElementById("notifList");

  // Guard against overlapping notification requests. Polling should never stack
  // requests while order pages, modals, or the desktop shell are busy.
  if (window.__opsNotifRefreshInFlight) return;
  if (!renderList && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const disabledUntil = Number(window.__opsNotifRefreshDisabledUntil || 0);
  if (!renderList && disabledUntil && Date.now() < disabledUntil) return;

  window.__opsNotifRefreshInFlight = true;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller ? window.setTimeout(() => { try { controller.abort(); } catch {} }, 7000) : 0;

  try {
    const resp = await fetch(`/api/notifications?limit=60&_=${Date.now()}`, {
      credentials: "include",
      cache: "no-store",
      signal: controller ? controller.signal : undefined,
      headers: {
        "Accept": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
      },
    });

    const data = await resp.json().catch(() => ({}));
    if (resp.status === 404) {
      window.__opsNotifRefreshDisabledUntil = Date.now() + (5 * 60 * 1000);
    }
    if (!resp.ok || !data || data.success === false) throw new Error(data.error || "Failed");
    window.__opsNotifRefreshDisabledUntil = 0;

    const unread = Number(data.unreadCount || 0);
    if (badge) {
      if (unread > 0) {
        badge.hidden = false;
        badge.textContent = unread > 99 ? "99+" : String(unread);
      } else {
        badge.hidden = true;
        badge.textContent = "0";
      }
    }

    const st = getNotifState();
    const rawItems = Array.isArray(data.items) ? data.items : [];
    st.items = rawItems
      .slice()
      .sort((a, b) => (Number(b?.ts || 0) - Number(a?.ts || 0)));

    if (renderList && listEl) {
      renderNotificationsList(listEl, st.items);
    }
  } catch (e) {
    if (renderList && listEl) {
      listEl.innerHTML = `<div class="notif-empty">Couldn’t load notifications</div>`;
    }
  } finally {
    if (timeout) { try { window.clearTimeout(timeout); } catch {} }
    window.__opsNotifRefreshInFlight = false;
  }
}

function renderNotificationsList(listEl, items) {
  const st = getNotifState();
  const scope = st.activeTab || 'today';

  const scoped = Array.isArray(items)
    ? items.filter((n) => notifScope(n?.ts) === scope)
    : [];

  syncNotifActions(scoped);

  if (!scoped.length) {
    listEl.innerHTML = window.OpsNoData?.html({ compact: true }) || `<div class="notif-empty">Sorry, No data available</div>`;
    return;
  }

  const visible = st.showAll ? scoped : scoped.slice(0, 3);

  listEl.innerHTML = "";
  for (const n of visible) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'notif-row' + (n && !n.read ? ' is-unread' : '');
    row.dataset.id = n.id || '';
    row.dataset.url = (n && n.url) ? String(n.url) : '';
    row.setAttribute('aria-label', `${n?.title || 'Notification'}${n && !n.read ? ', unread' : ''}. Swipe right to mark as read.`);

    const title = escapeHtml(n?.title || 'Update');
    const body = escapeHtml(n?.body || '');
    const ts = typeof n?.ts === 'number' ? n.ts : Date.now();
    const time = formatAgo(ts);
    const icon = pickNotifIcon(n);
    const showDot = !(n && n.read);

    row.innerHTML = `
      <div class="notif-row__swipe-hint" aria-hidden="true"><i data-feather="check-circle"></i><span>Mark read</span></div>
      <div class="notif-row__surface">
        <div class="notif-row__ico"><i data-feather="${escapeAttr(icon)}"></i></div>
        <div class="notif-row__content">
          <div class="notif-row__title">
            <span class="notif-dot ${showDot ? '' : 'is-hidden'}" aria-hidden="true"></span>
            <span class="notif-row__title-text">${title}</span>
          </div>
          ${body ? `<div class="notif-row__body">${body}</div>` : ''}
        </div>
        <div class="notif-row__time">${escapeHtml(time)}</div>
      </div>
    `;

    bindNotificationSwipe(row);

    row.addEventListener('click', async () => {
      if (row.dataset.suppressClick === '1') {
        row.dataset.suppressClick = '0';
        return;
      }

      const id = row.dataset.id;
      const url = row.dataset.url;

      if (id) {
        await markNotificationRowRead(row, id);
      }

      // Close the dropdown
      const panel = document.getElementById('notifPanel');
      if (panel) panel.hidden = true;

      if (url) {
        window.location.href = url;
      }
    });

    listEl.appendChild(row);
  }

  if (window.feather) {
    try { window.feather.replace(); } catch {}
  }
}

async function markNotificationRowRead(row, id) {
  const cleanId = String(id || row?.dataset?.id || '').trim();
  if (!cleanId) return false;

  try {
    await fetch('/api/notifications/read', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cleanId }),
    });
  } catch {}

  try {
    const s = getNotifState();
    s.items = (Array.isArray(s.items) ? s.items : []).map((x) => {
      if (!x || String(x.id) !== cleanId) return x;
      return { ...x, read: true };
    });
    syncNotifActions((Array.isArray(s.items) ? s.items : []).filter((n) => notifScope(n?.ts) === (s.activeTab || 'today')));
  } catch {}

  if (row) {
    row.classList.remove('is-unread', 'is-swiping');
    row.classList.add('is-swipe-read');
    row.style.removeProperty('--notif-swipe-x');
    row.querySelector('.notif-dot')?.classList.add('is-hidden');
    row.setAttribute('aria-label', `${row.textContent || 'Notification'}, read`);
    setTimeout(() => row.classList.remove('is-swipe-read'), 450);
  }

  try { refreshNotifications(false); } catch {}
  return true;
}

function bindNotificationSwipe(row) {
  if (!row || row.dataset.swipeBound === '1') return;
  row.dataset.swipeBound = '1';

  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let active = false;
  let dragging = false;
  let pointerId = null;

  const reset = () => {
    row.classList.remove('is-swiping');
    row.style.removeProperty('--notif-swipe-x');
    active = false;
    dragging = false;
    pointerId = null;
  };

  row.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startX = event.clientX;
    startY = event.clientY;
    currentX = startX;
    active = true;
    dragging = false;
    pointerId = event.pointerId;
    try { row.setPointerCapture(pointerId); } catch {}
  });

  row.addEventListener('pointermove', (event) => {
    if (!active) return;
    currentX = event.clientX;
    const dx = currentX - startX;
    const dy = event.clientY - startY;
    if (dx > 8 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      dragging = true;
      row.classList.add('is-swiping');
      row.style.setProperty('--notif-swipe-x', `${Math.min(dx, 110)}px`);
      try { event.preventDefault(); } catch {}
    }
  }, { passive: false });

  const finish = async (event) => {
    if (!active) return;
    const dx = (event?.clientX || currentX) - startX;
    const dy = (event?.clientY || startY) - startY;
    const shouldMarkRead = dx >= 72 && Math.abs(dx) > Math.abs(dy) * 1.15;

    try { if (pointerId !== null) row.releasePointerCapture(pointerId); } catch {}

    if (dragging) {
      row.dataset.suppressClick = '1';
      setTimeout(() => { if (row.dataset.suppressClick === '1') row.dataset.suppressClick = '0'; }, 350);
      try { event?.preventDefault?.(); } catch {}
    }

    if (shouldMarkRead) {
      row.style.setProperty('--notif-swipe-x', '118px');
      await markNotificationRowRead(row, row.dataset.id || '');
      reset();
      return;
    }

    reset();
  };

  row.addEventListener('pointerup', finish);
  row.addEventListener('pointercancel', reset);
  row.addEventListener('lostpointercapture', () => {
    if (active && !dragging) reset();
  });
}

async function markAllRead() {
  try {
    await fetch("/api/notifications/read-all", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {}
}

// -------------------
// Push subscription helpers
// -------------------
async function ensureOpsPushNotificationsEnabled(options = {}) {
  const ask = !!options.ask;
  const quiet = options.quiet !== false;

  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return { ok: false, reason: "unsupported" };
    }

    let permission = Notification.permission;
    if (permission === "default" && ask) {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      return { ok: false, reason: permission || "not-granted" };
    }

    const keyResp = await fetch("/api/push/vapid-public-key", {
      credentials: "include",
      cache: "no-store",
      headers: { "Accept": "application/json", "Cache-Control": "no-cache" },
    });
    const keyData = await keyResp.json().catch(() => ({}));
    const publicKey = String(keyData?.publicKey || "").trim();
    if (!keyResp.ok || !keyData?.enabled || !publicKey) {
      return { ok: false, reason: "server-disabled" };
    }

    let registration = null;
    try {
      registration = await navigator.serviceWorker.ready;
    } catch {
      registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    }

    try { await registration.update(); } catch {}

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await fetch("/api/push/subscribe", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON ? subscription.toJSON() : subscription }),
    });

    window.__opsPushNotificationsEnabled = true;
    return { ok: true };
  } catch (error) {
    if (!quiet) console.warn("[notifications] push enable failed", error);
    return { ok: false, reason: "error" };
  }
}

// -------------------
// Push subscription UI
// -------------------
async function refreshPushRow() {
  const row = document.getElementById("notifPushRow");
  if (!row) return;

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    row.innerHTML = `<div class="notif-push-msg">Push notifications are not supported on this device.</div>`;
    return;
  }

  // iOS requirement: needs to be installeds: PWA installed to Home Screen (Safari)
  const perm = Notification.permission;

  let subscribed = false;
  let sub = null;
  try {
    const reg = await navigator.serviceWorker.ready;
    sub = await reg.pushManager.getSubscription();
    subscribed = !!sub;
  } catch {}

  // Fetch server public key status (to show better errors)
  let serverEnabled = false;
  let publicKey = "";
  try {
    const r = await fetch("/api/push/vapid-public-key", { credentials: "include" });
    const d = await r.json().catch(() => ({}));
    serverEnabled = !!d.enabled;
    publicKey = String(d.publicKey || "");
  } catch {}

  if (!serverEnabled) {
    row.innerHTML = `
      <div class="notif-push-msg">
        Push is not configured on the server (missing VAPID keys).
      </div>
    `;
    return;
  }

  if (perm === "denied") {
    row.innerHTML = `
      <div class="notif-push-msg">
        Notifications are blocked in the browser settings.
      </div>
    `;
    return;
  }

  if (subscribed) {
    row.innerHTML = `
      <div class="notif-push-row">
        <div class="notif-push-status">Push notifications: <b>ON</b></div>
        <button type="button" class="notif-push-btn danger" id="notifDisablePush">Disable</button>
      </div>
    `;

    document.getElementById("notifDisablePush")?.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await disablePush();
      await refreshPushRow();
    });
    return;
  }

  row.innerHTML = `
    <div class="notif-push-row">
      <div class="notif-push-status">Push notifications: <b>OFF</b></div>
      <button type="button" class="notif-push-btn" id="notifEnablePush">Enable</button>
    </div>
  `;

  document.getElementById("notifEnablePush")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await enablePush(publicKey);
    await refreshPushRow();
  });
}

async function enablePush(publicKey) {
  if (!publicKey) {
    alert("Push is not configured (missing VAPID public key).");
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    alert("You need to allow notifications to enable push.");
    return;
  }

  const reg = await navigator.serviceWorker.ready;

  // Convert VAPID key
  const appServerKey = urlBase64ToUint8Array(publicKey);

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: appServerKey,
  });

  // Save on server
  await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub }),
  });
}

async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const endpoint = sub.endpoint;

  try {
    await sub.unsubscribe();
  } catch {}

  try {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch {}
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Escape text for safe usage inside HTML attributes.
// (We keep it simple because we only need it for <img src="..."> and similar.)
function escapeAttr(str) {
  // escapeHtml already escapes &, <, >, " and '
  return escapeHtml(str)
    .replaceAll("`", "&#096;")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");
}


function isOpsShellEmbeddedMode() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('__shell') === 'content') return true;
  } catch {}

  try {
    if (!window.parent || window.parent === window) return false;

    const frameEl = window.frameElement || null;
    if (frameEl && String(frameEl.id || '').trim() === 'ops-shell-frame') {
      return true;
    }

    const sameOriginParent = (() => {
      try {
        return window.parent.location.origin === window.location.origin;
      } catch {
        return false;
      }
    })();

    if (!sameOriginParent) return false;

    const hostFrame = window.parent.document?.getElementById?.('ops-shell-frame') || null;
    if (hostFrame && (hostFrame === frameEl || hostFrame.contentWindow === window)) {
      return true;
    }

    const hostState = window.parent.__opsShellHostState || null;
    if (hostState?.frame && (hostState.frame === frameEl || hostState.frame.contentWindow === window)) {
      return true;
    }
  } catch {}

  return false;
}

function getOpsPersistentShellFrame() {
  return document.getElementById('ops-shell-frame') || null;
}

function getOpsPersistentShellFrameDocument() {
  try {
    const frame = getOpsPersistentShellFrame();
    return frame?.contentDocument || frame?.contentWindow?.document || null;
  } catch {
    return null;
  }
}

function stripOpsShellParam(input) {
  try {
    const url = new URL(String(input || window.location.href), window.location.origin);
    url.searchParams.delete('__shell');
    const pathname = String(url.pathname || '/').replace(/\/+$/, '') || '/';
    return `${pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

function resolveOpsShellCanonicalPath(input) {
  try {
    const display = stripOpsShellParam(input);
    const url = new URL(display, window.location.origin);
    const pathname = String(url.pathname || '/').replace(/\/+$/, '') || '/';

    if (pathname === '/orders/new' || pathname === '/orders/new/review') {
      url.pathname = '/orders/new/products';
    }

    const safePathname = String(url.pathname || '/').replace(/\/+$/, '') || '/';
    return `${safePathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

function buildOpsShellContentUrl(input) {
  const display = resolveOpsShellCanonicalPath(input);
  const url = new URL(display, window.location.origin);
  url.searchParams.set('__shell', 'content');
  return url.toString();
}

function isOpsShellNavigableHref(href) {
  try {
    const url = new URL(String(href || ''), window.location.origin);
    if (url.origin !== window.location.origin) return false;
    if (url.pathname.startsWith('/api/')) return false;
    if (url.pathname.replace(/\/+$/, '') === '/lms') return false;
    if (/\.(?:css|js|mjs|map|json|png|jpe?g|gif|webp|svg|ico|pdf|zip|txt|xml|woff2?|ttf|eot|mp4|mp3)$/i.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeOpsShellPath(input) {
  try {
    const display = resolveOpsShellCanonicalPath(input);
    const url = new URL(display, window.location.origin);
    const pathname = String(url.pathname || '/').replace(/\/+$/, '') || '/';
    return `${pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

function deriveOpsShellTitle(path) {
  const pathname = (() => {
    try { return new URL(String(path || '/'), window.location.origin).pathname; } catch { return String(path || '/'); }
  })();
  const map = [
    ['/home', 'Home'],
    ['/orders/new', 'Create New Order'],
    ['/orders/requested', 'Operations Orders'],
    ['/orders/maintenance-orders', 'Maintenance Orders'],
    ['/orders/sv-orders', 'Orders Review'],
    ['/orders', 'Current Orders'],
    ['/stocktaking', 'Stocktaking'],
    ['/products', 'Products'],
    ['/proposals', 'Proposals'],
    ['/kits', 'Kits'],
    ['/expenses/users', 'Expenses Users'],
    ['/expenses', 'Expenses'],
    ['/b2b', 'B2B'],
    ['/account', 'Account'],
    ['/history', 'History'],
    ['/backup', 'Database'],
    ['/how-it-works', 'How it works'],
  ];
  const found = map.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (found) return found[1];
  const raw = pathname.split('/').filter(Boolean).pop() || 'Dashboard';
  return raw.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function readOpsShellFrameMeta() {
  const frameDoc = getOpsPersistentShellFrameDocument();
  const frameWin = (() => { try { return getOpsPersistentShellFrame()?.contentWindow || null; } catch { return null; } })();
  const framePath = frameWin ? resolveOpsShellCanonicalPath(frameWin.location.href) : resolveOpsShellCanonicalPath(window.location.href);
  if (!frameDoc) {
    const fallbackTitle = deriveOpsShellTitle(framePath);
    return { displayTitle: fallbackTitle, fullTitle: fallbackTitle, path: framePath, searchPlaceholder: `Search in ${fallbackTitle}` };
  }

  const titleEl =
    frameDoc.querySelector('.main-header .page-title') ||
    frameDoc.querySelector('.main-header .dash-title') ||
    frameDoc.querySelector('[data-shell-title]') ||
    frameDoc.querySelector('h1');

  const displayTitle = String(titleEl?.textContent || frameDoc.title || deriveOpsShellTitle(framePath)).trim() || deriveOpsShellTitle(framePath);
  const searchInput = frameDoc.querySelector([
    '.main-header .searchbar input[type="search"]',
    '.main-header .searchbar input:not([type])',
    '.tasks-v2-toolbar input[type="search"]',
    '.tasks-v2-topbar input[type="search"]',
    '#homeSearch',
    '#orderSearch',
    '#requestedSearch',
    '#svSearch',
    '#b2bSearch',
    '#stockSearch',
    '#schoolStockSearch',
    '#notifSearch'
  ].join(','));

  const placeholder = String(searchInput?.getAttribute('placeholder') || '').trim() || `Search in ${displayTitle}`;
  return {
    displayTitle,
    fullTitle: String(frameDoc.title || displayTitle).trim() || displayTitle,
    path: framePath,
    searchPlaceholder: placeholder,
  };
}

function applyOpsShellBodyState(path) {
  try {
    document.body.classList.forEach((cls) => {
      if (/^page-/.test(cls) || cls === 'tasks-v2' || cls === 'order-modal-fit-screen') {
        document.body.classList.remove(cls);
      }
    });
  } catch {}

  document.body.classList.add('page-shell-host');

  try {
    const pathname = new URL(stripOpsShellParam(path), window.location.origin).pathname;
    const slug = (pathname === '/') ? 'root' : pathname.split('/').filter(Boolean).join('-');
    if (slug) document.body.classList.add(`page-shell-${slug}`);
  } catch {}
}

function setOpsShellActiveNav(path) {
  const currentPath = (() => {
    try { return new URL(stripOpsShellParam(path), window.location.origin).pathname; } catch { return '/'; }
  })();

  const links = Array.from(document.querySelectorAll('.sidebar .nav-link'));
  if (!links.length) return;

  links.forEach((link) => link.classList.remove('active'));

  let best = null;
  let bestLen = -1;

  links.forEach((link) => {
    try {
      const linkPath = new URL(link.getAttribute('href') || '', window.location.origin).pathname.replace(/\/+$/, '') || '/';
      const safeCurrent = currentPath.replace(/\/+$/, '') || '/';
      const matches = safeCurrent === linkPath || safeCurrent.startsWith(`${linkPath}/`);
      if (matches && linkPath.length > bestLen) {
        best = link;
        bestLen = linkPath.length;
      }
    } catch {}
  });

  if (!best) {
    best = links.find((link) => (link.getAttribute('href') || '').replace(/\/+$/, '') === '/home') || links[0];
  }

  if (best) best.classList.add('active');
  try {
    window.OpsSidebarNav?.reorder?.();
    window.OpsSidebarNav?.restore?.();
  } catch {}
}

function applyOpsShellChrome(meta) {
  const safeMeta = meta && typeof meta === 'object' ? meta : {};
  const title = String(safeMeta.displayTitle || deriveOpsShellTitle(safeMeta.path || window.location.pathname)).trim() || 'Dashboard';
  const fullTitle = String(safeMeta.fullTitle || title).trim() || title;
  const placeholder = String(safeMeta.searchPlaceholder || `Search in ${title}`).trim();

  document.title = fullTitle;
  applyOpsShellBodyState(safeMeta.path || window.location.pathname);
  setOpsShellActiveNav(safeMeta.path || window.location.pathname);

  document.querySelectorAll('.main-header .dash-title, .main-header .page-title').forEach((el) => {
    try { el.textContent = title; } catch {}
  });

  const searchInput = document.querySelector('.main-header .searchbar input');
  if (searchInput) {
    searchInput.setAttribute('placeholder', placeholder);
    searchInput.setAttribute('aria-label', placeholder);
  }

  const floating = document.getElementById('floatingSearchInput');
  if (floating && !floating.value) {
    floating.setAttribute('placeholder', placeholder);
    floating.setAttribute('aria-label', placeholder);
  }
}

function applyOpsShellSearchToFrame(query) {
  const frameDoc = getOpsPersistentShellFrameDocument();
  if (!frameDoc) return;

  const q = String(query || '');
  const selector = [
    '.main-header .searchbar input[type="search"]',
    '.main-header .searchbar input:not([type])',
    '.tasks-v2-toolbar input[type="search"]',
    '.tasks-v2-topbar input[type="search"]',
    '#homeSearch',
    '#orderSearch',
    '#requestedSearch',
    '#svSearch',
    '#b2bSearch',
    '#stockSearch',
    '#schoolStockSearch',
    '#notifSearch',
    '#eventComponentsSearchInput'
  ].join(',');

  const linked = Array.from(frameDoc.querySelectorAll(selector));
  if (linked.length) {
    linked.forEach((input) => {
      try { input.dataset.opsFloatingSearchSync = '1'; } catch {}
      try { input.value = q; } catch {}
      const ViewEvent = input.ownerDocument?.defaultView?.Event || Event;
      try { input.dispatchEvent(new ViewEvent('input', { bubbles: true })); } catch {}
      try { input.dispatchEvent(new ViewEvent('change', { bubbles: true })); } catch {}
      window.setTimeout(() => { try { delete input.dataset.opsFloatingSearchSync; } catch {} }, 0);
    });
    return;
  }

  const items = Array.from(frameDoc.querySelectorAll([
    '.co-card',
    '.order-card',
    '.tv2-card',
    '.task-card',
    '.stock-card',
    '.stock-item',
    '.school-folder-card',
    '.folder-card',
    '.notif-row',
    '.product-card'
  ].join(',')));

  const needle = q.trim().toLowerCase();
  items.forEach((el) => {
    const hay = String(el.getAttribute('data-search') || el.textContent || '').trim().toLowerCase();
    const visible = !needle || hay.includes(needle);
    el.style.display = visible ? '' : 'none';
  });
}

function bindOpsShellFrameNavigation(frameDoc) {
  if (!frameDoc || frameDoc.documentElement?.dataset?.opsShellNavBound === '1') return;
  try { frameDoc.documentElement.dataset.opsShellNavBound = '1'; } catch {}

  frameDoc.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const role = String(anchor.getAttribute('role') || '').toLowerCase();
    if (role === 'tab') {
      try { event.preventDefault(); } catch {}
      return;
    }
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (anchor.hasAttribute('download')) return;
    const target = String(anchor.getAttribute('target') || '').toLowerCase();
    if (target && target !== '_self') return;
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return;
    const absolute = anchor.href || href;
    if (!isOpsShellNavigableHref(absolute)) return;

    try {
      event.preventDefault();
      if (window.OpsShell && typeof window.OpsShell.navigate === 'function') {
        window.OpsShell.navigate(absolute, { pushHistory: true });
      }
    } catch {}
  }, true);
}

function shouldSkipOpsPersistentShellHostForCurrentPage() {
  try {
    const pathname = new URL(window.location.href).pathname.replace(/\/+$/, '') || '/';
    // Direct desktop loads of these pages stay in normal-page mode. Their legacy
    // layout CSS can otherwise force a hidden page visible beneath the iframe.
    if (pathname === '/lms') return true;
    if (pathname === '/expenses' || pathname === '/expenses/users') return true;
    if (pathname === '/proposals' || pathname === '/kits' || pathname === '/b2b') return true;
  } catch {}

  try {
    const body = document.body;
    if (body?.classList?.contains('emails-page') || body?.classList?.contains('email-inbox-redesign')) return true;
  } catch {}

  return false;
}


function shouldSkipOpsPersistentShellHostForFreshLoad() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('_fresh') === '1' || params.has('_refresh')) return true;
  } catch {}

  try {
    const markerKey = 'ops.hardRefresh.pendingAt';
    const ts = Number(sessionStorage.getItem(markerKey) || 0);
    if (ts && Number.isFinite(ts)) {
      const age = Date.now() - ts;
      if (age >= 0 && age <= (90 * 1000)) return true;
    }
  } catch {}

  return false;
}

function shouldSkipOpsPersistentShellHostOnMobile() {
  try {
    if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) return true;
  } catch {}

  try {
    const visualWidth = Number(window.visualViewport?.width || 0);
    if (visualWidth > 0 && visualWidth <= 768) return true;
  } catch {}

  try {
    const layoutWidth = Math.min(
      Number(window.innerWidth || 0) || Infinity,
      Number(document.documentElement?.clientWidth || 0) || Infinity
    );
    if (Number.isFinite(layoutWidth) && layoutWidth <= 768) return true;
  } catch {}

  return false;
}

function restoreOpsPersistentShellHostNormalPage() {
  try {
    document.body.classList.remove('page-shell-host');
    document.querySelectorAll('.ops-shell-host-main').forEach((el) => el.remove());
    document.querySelectorAll('[data-ops-shell-legacy="1"]').forEach((el) => {
      el.removeAttribute('data-ops-shell-legacy');
      setOpsShellHiddenElement(el, false);
    });
  } catch {}
}

function initOpsPersistentShellHost() {
  if (window.__opsShellHostInitialized) return;
  if (isOpsShellEmbeddedMode()) return;

  // On mobile, keep the app in normal page mode instead of booting the
  // persistent iframe shell. The shell and the normal hard-refresh mode use
  // slightly different viewport calculations on Android/PWA launch, which can
  // make the bottom white scroll area large until a hard refresh. Normal page
  // mode keeps first open and hard refresh identical while preserving all page
  // features and bottom dock behavior.
  if (shouldSkipOpsPersistentShellHostOnMobile()) {
    restoreOpsPersistentShellHostNormalPage();
    return;
  }

  // Important: keep the persistent shell enabled after Hard Refresh on
  // tablet/desktop layouts. This preserves the same smooth in-app page
  // transition behavior after refresh, so the sidebar/main bar do not rebuild
  // or briefly show the legacy "Dashboard" header between pages.
  // Fresh API/cache bypass is still handled by pageForcesFreshApiRequests(),
  // so added/removed pages and fresh data continue to update correctly.

  // Creating a persistent iframe shell on a direct /messages refresh makes
  // the page render inside itself, so we intentionally keep /messages as a
  // normal page host and only use shell-embedded mode when another page loads it.
  if (shouldSkipOpsPersistentShellHostForCurrentPage()) {
    try {
      document.body.classList.remove('page-shell-host');
      document.querySelectorAll('.ops-shell-host-main').forEach((el) => el.remove());
      document.querySelectorAll('[data-ops-shell-legacy="1"]').forEach((el) => el.removeAttribute('data-ops-shell-legacy'));
    } catch {}
    return;
  }

  if (!document.querySelector('.sidebar') || !document.querySelector('.main-content')) return;

  const mainContent = document.querySelector('.main-content');
  const header = mainContent?.querySelector('.main-header');
  const legacyMain = Array.from(mainContent?.children || []).find((node) => node.tagName === 'MAIN');
  if (!mainContent || !header || !legacyMain) return;

  window.__opsShellHostInitialized = true;
  legacyMain.setAttribute('data-ops-shell-legacy', '1');

  const hostMain = document.createElement('main');
  hostMain.className = 'ops-shell-host-main';
  hostMain.hidden = true;
  hostMain.innerHTML = `
    <div class="ops-shell-frame-wrap is-loading">
      <div class="ops-shell-loading" aria-live="polite">
        <span class="ops-shell-loading__spinner" aria-hidden="true"></span>
        <span class="ops-shell-loading__text">Loading page…</span>
      </div>
      <iframe id="ops-shell-frame" class="ops-shell-frame" title="Dashboard page content" loading="eager"></iframe>
    </div>
  `;
  mainContent.appendChild(hostMain);

  const frame = hostMain.querySelector('#ops-shell-frame');
  const frameWrap = hostMain.querySelector('.ops-shell-frame-wrap');
  const hostSearch = document.querySelector('.main-header .searchbar input');
  const state = {
    currentPath: resolveOpsShellCanonicalPath(window.location.href),
    requestedPath: null,
    queuedPath: null,
    queuedOpts: null,
    queueTimer: 0,
    loading: false,
    loadStartedAt: 0,
    loadWatchdog: 0,
    frame,
    frameWrap,
    legacyMain,
    hostMain,
    hostSearch,
  };
  window.__opsShellHostState = state;

  const showLoading = (hideLegacy) => {
    frameWrap.classList.add('is-loading');
    frame.classList.remove('is-ready');
    frame.style.visibility = 'hidden';
    if (hideLegacy) {
      legacyMain.hidden = true;
      hostMain.hidden = false;
    }
  };

  const finishLoad = () => {
    if (state.loadWatchdog) {
      try { window.clearTimeout(state.loadWatchdog); } catch {}
      state.loadWatchdog = 0;
    }

    const meta = readOpsShellFrameMeta();
    const loadedPath = normalizeOpsShellPath(meta.path || state.requestedPath || state.currentPath);
    const requestedPath = normalizeOpsShellPath(state.requestedPath || state.currentPath);
    const currentPath = normalizeOpsShellPath(state.currentPath || '/');

    if (!state.requestedPath && loadedPath !== currentPath) {
      try { history.pushState({ opsShellPath: loadedPath }, '', loadedPath); } catch {}
    } else if (state.requestedPath && loadedPath !== requestedPath && loadedPath !== currentPath) {
      try { history.pushState({ opsShellPath: loadedPath }, '', loadedPath); } catch {}
    }

    state.currentPath = loadedPath;
    state.requestedPath = null;
    state.loading = false;

    applyOpsShellChrome(meta);
    legacyMain.hidden = true;
    hostMain.hidden = false;
    frameWrap.classList.remove('is-loading');
    frame.style.visibility = 'visible';
    frame.classList.add('is-ready');
    bindOpsShellFrameNavigation(getOpsPersistentShellFrameDocument());

    if (hostSearch && hostSearch.value) {
      applyOpsShellSearchToFrame(hostSearch.value);
    }

    try { window.__opsFreshLoadOverlayMarkShellReady?.(); } catch {}

    // If the user clicked several nav links while the iframe was still loading,
    // keep only the latest requested page. This prevents a cascade of iframe
    // reloads/page scripts that can freeze Chromium/Android WebView.
    if (state.queuedPath) {
      const queuedPath = state.queuedPath;
      const queuedOpts = Object.assign({}, state.queuedOpts || {});
      state.queuedPath = null;
      state.queuedOpts = null;
      if (normalizeOpsShellPath(queuedPath) !== normalizeOpsShellPath(state.currentPath)) {
        window.setTimeout(() => loadFrame(queuedPath, queuedOpts), 0);
      }
    }
  };

  frame.addEventListener('load', () => {
    try { finishLoad(); } catch (e) { console.warn('[ops-shell] frame load sync failed', e); }
  });

  const startFrameLoad = (nextPath, opts = {}) => {
    const nextNormalized = normalizeOpsShellPath(nextPath);
    const currentNormalized = normalizeOpsShellPath(state.currentPath);
    const shouldPush = !!opts.pushHistory && nextNormalized !== currentNormalized;
    const shouldReplace = !!opts.replaceHistory;
    const hasLoadedFrame = !!(frame && frame.getAttribute('src'));

    if (!opts.forceReload && hasLoadedFrame && nextNormalized === currentNormalized) {
      state.requestedPath = null;
      state.loading = false;
      if (shouldReplace) {
        try { history.replaceState({ opsShellPath: nextPath }, '', nextPath); } catch {}
      }
      try { bindOpsShellFrameNavigation(getOpsPersistentShellFrameDocument()); } catch {}
      return;
    }

    state.requestedPath = nextPath;
    state.loading = true;
    state.loadStartedAt = Date.now();

    if (shouldPush) {
      try { history.pushState({ opsShellPath: nextPath }, '', nextPath); } catch {}
    } else if (shouldReplace) {
      try { history.replaceState({ opsShellPath: nextPath }, '', nextPath); } catch {}
    }

    showLoading(!!opts.hideLegacy);
    frame.src = buildOpsShellContentUrl(nextPath);

    if (state.loadWatchdog) {
      try { window.clearTimeout(state.loadWatchdog); } catch {}
    }
    state.loadWatchdog = window.setTimeout(() => {
      try {
        // Do not leave the user trapped behind the shell loader if the iframe
        // load event is lost during a rapid navigation burst.
        state.loading = false;
        state.requestedPath = null;
        frameWrap.classList.remove('is-loading');
        frame.style.visibility = 'visible';
        try { window.__opsFreshLoadOverlayMarkShellReady?.(); } catch {}
        if (state.queuedPath) {
          const queuedPath = state.queuedPath;
          const queuedOpts = Object.assign({}, state.queuedOpts || {});
          state.queuedPath = null;
          state.queuedOpts = null;
          loadFrame(queuedPath, queuedOpts);
        }
      } catch {}
    }, 12000);
  };

  const loadFrame = (href, opts = {}) => {
    const nextPath = resolveOpsShellCanonicalPath(href);
    const nextNormalized = normalizeOpsShellPath(nextPath);
    const currentNormalized = normalizeOpsShellPath(state.currentPath);

    if (state.loading && !opts.forceReload) {
      state.queuedPath = nextPath;
      state.queuedOpts = Object.assign({}, opts);
      if (state.queueTimer) {
        try { window.clearTimeout(state.queueTimer); } catch {}
      }
      state.queueTimer = window.setTimeout(() => {
        state.queueTimer = 0;
        // If loading finished meanwhile, start the latest queued page now. If
        // not, finishLoad/watchdog will pick it up.
        if (!state.loading && state.queuedPath) {
          const queuedPath = state.queuedPath;
          const queuedOpts = Object.assign({}, state.queuedOpts || {});
          state.queuedPath = null;
          state.queuedOpts = null;
          startFrameLoad(queuedPath, queuedOpts);
        }
      }, 140);
      return;
    }

    if (!opts.forceReload && nextNormalized === currentNormalized && frame && frame.getAttribute('src')) {
      try { bindOpsShellFrameNavigation(getOpsPersistentShellFrameDocument()); } catch {}
      return;
    }

    startFrameLoad(nextPath, opts);
  };

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const role = String(anchor.getAttribute('role') || '').toLowerCase();
    if (role === 'tab') {
      try { event.preventDefault(); } catch {}
      return;
    }
    const insideLegacy = anchor.closest('[data-ops-shell-legacy="1"]');
    if (insideLegacy && legacyMain.hidden) return;
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (anchor.hasAttribute('download')) return;
    const target = String(anchor.getAttribute('target') || '').toLowerCase();
    if (target && target !== '_self') return;
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return;
    const absolute = anchor.href || href;
    if (!isOpsShellNavigableHref(absolute)) return;

    event.preventDefault();
    loadFrame(absolute, { pushHistory: true, hideLegacy: true });
  }, true);

  window.addEventListener('popstate', () => {
    const desired = resolveOpsShellCanonicalPath(window.location.href);
    if (normalizeOpsShellPath(desired) === normalizeOpsShellPath(state.currentPath)) return;
    loadFrame(desired, { replaceHistory: true, hideLegacy: true });
  });

  if (hostSearch && hostSearch.dataset.opsShellBound !== '1') {
    hostSearch.dataset.opsShellBound = '1';
    hostSearch.addEventListener('input', () => {
      applyOpsShellSearchToFrame(hostSearch.value || '');
    });
    hostSearch.addEventListener('search', () => {
      applyOpsShellSearchToFrame(hostSearch.value || '');
    });
  }

  window.OpsShell = {
    navigate(href, opts = {}) {
      const next = resolveOpsShellCanonicalPath(href);
      loadFrame(next, { pushHistory: opts.pushHistory !== false, replaceHistory: !!opts.replaceHistory, hideLegacy: true, forceReload: !!opts.forceReload });
    },
    getFrame() { return frame; },
    getFrameDocument() { return getOpsPersistentShellFrameDocument(); },
    getCurrentPath() { return state.currentPath; },
  };

  applyOpsShellChrome({
    displayTitle: deriveOpsShellTitle(state.currentPath),
    fullTitle: document.title || deriveOpsShellTitle(state.currentPath),
    path: state.currentPath,
    searchPlaceholder: `Search in ${deriveOpsShellTitle(state.currentPath)}`
  });
  setOpsShellActiveNav(state.currentPath);
  try { history.replaceState({ opsShellPath: state.currentPath }, '', state.currentPath); } catch {}
  loadFrame(state.currentPath, { replaceHistory: true, hideLegacy: false });
}

// Keep authenticated pages synchronized with server-side session revocation.
// A username/password change or account deletion invalidates every active device.
(() => {
  if (window.__OPS_SESSION_GUARD__) return;
  window.__OPS_SESSION_GUARD__ = true;

  const currentPath = String(window.location.pathname || '').toLowerCase();
  if (currentPath === '/login' || currentPath === '/' || currentPath.includes('forgot-password')) return;

  let checking = false;
  let invalidated = false;

  const forceLogin = () => {
    if (invalidated) return;
    invalidated = true;
    try { sessionStorage.clear(); } catch {}
    try { localStorage.removeItem('accountCache'); } catch {}
    const target = '/login?reason=session-invalidated';
    try { window.history.replaceState(null, '', target); } catch {}
    window.location.replace(target);
  };

  const checkSession = async () => {
    if (checking || invalidated || document.visibilityState === 'hidden') return;
    checking = true;
    try {
      const response = await fetch(`/api/session-status?_=${Date.now()}`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'X-Ops-Session-Check': '1' },
      });
      if (response.status === 401 || response.redirected && /\/login/i.test(response.url || '')) {
        forceLogin();
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.authenticated === false || payload?.code === 'SESSION_INVALIDATED') {
        forceLogin();
      }
    } catch {
      // Network errors must not log users out. The next heartbeat retries.
    } finally {
      checking = false;
    }
  };

  window.addEventListener('pageshow', checkSession);
  window.addEventListener('focus', checkSession);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkSession();
  });

  checkSession();
  window.setInterval(checkSession, 1500);
})();
