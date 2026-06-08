// public/js/account.js
document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('account-content');
  if (!container) return;

  // Local state (single source of truth for displayed values)
  let state = null;

  const FIELD_META = [
    { key: 'name',         label: 'Name',          icon: 'user',       inputType: 'text',     required: true },
    { key: 'department',   label: 'Department',    icon: 'briefcase',  inputType: 'text',     required: false },
    { key: 'position',     label: 'Position',      icon: 'award',      inputType: 'text',     required: false },
    { key: 'phone',        label: 'Phone',         icon: 'phone',      inputType: 'text',     required: false, placeholder: 'e.g. 0123456789' },
    { key: 'email',        label: 'Email',         icon: 'mail',       inputType: 'email',    required: false, placeholder: 'e.g. name@company.com' },
    { key: 'employeeCode', label: 'Employee Code', icon: 'hash',       inputType: 'number',   required: false },
    // Password can be text (Notion: Rich text) - we don't display its real value.
    { key: 'password',     label: 'Password',      icon: 'lock',       inputType: 'password', required: true,  placeholder: 'New password', autocomplete: 'new-password' },
  ];

  const PROFILE_PICTURE_META = {
    key: 'profilePicture',
    label: 'Profile picture',
    icon: 'image',
    inputType: 'text',
    required: false,
    isFileUpload: true,
    placeholder: 'Selected image',
    endpoint: '/api/account/profile-picture',
    responseKey: 'photoUrl',
    successMessage: 'Profile picture updated successfully.',
    removeSuccessMessage: 'Profile picture removed successfully.',
  };

  const COVER_PHOTO_META = {
    key: 'coverPhoto',
    label: 'Cover photo',
    icon: 'image',
    inputType: 'text',
    required: false,
    isFileUpload: true,
    placeholder: 'Selected cover image',
    endpoint: '/api/account/cover-photo',
    responseKey: 'coverPhotoUrl',
    successMessage: 'Cover photo updated successfully.',
    removeSuccessMessage: 'Cover photo removed successfully.',
  };

  let pendingProfilePicture = null;
  let pendingCoverPhoto = null;

  // ===== Helpers =====
  function toast(type, title, message) {
    if (window.UI && typeof window.UI.toast === 'function') {
      window.UI.toast({ type, title, message });
    } else {
      alert(`${title}\n${message}`);
    }
  }

  function displayValue(key) {
    if (!state) return '—';
    if (key === 'password') return state.passwordSet ? '••••••••' : '—';

    const v = state[key];
    if (v === null || v === undefined) return '—';
    const s = String(v).trim();
    return s ? s : '—';
  }

  function initialsFromName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'U';
    const first = parts[0]?.[0] || '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] || '') : '';
    return (String(first) + String(last)).toUpperCase() || 'U';
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function normalizeValueForApi(field, raw) {
    const v = String(raw ?? '').trim();

    // Name must not be empty
    if (field === 'name') return v;

    // Password must not be empty
    if (field === 'password') return v;

    // Empty => null (clears the field)
    if (v === '') return null;

    // Numeric fields - keep as string; server validates/converts
    if (field === 'employeeCode') return v;

    return v;
  }

  // ===== Render =====
  function profileFieldCard(meta) {
    const isPassword = meta.key === 'password';
    return `
      <section class="profile-field-card" data-field="${escapeHTML(meta.key)}">
        <div class="profile-field-label">${escapeHTML(meta.label)}</div>
        <div class="profile-field-box ${isPassword ? 'profile-field-box--password' : ''}">
          <span class="profile-field-value">${escapeHTML(displayValue(meta.key))}</span>
        </div>
      </section>
    `;
  }

  function profileAvatarMarkup() {
    const photoUrl = String(state?.photoUrl || '').trim();
    const displayName = String(state?.name || 'User').trim() || 'User';
    return photoUrl
      ? `<img class="profile-avatar-image" src="${escapeHTML(photoUrl)}" width="142" height="142" decoding="async" alt="${escapeHTML(displayName)} profile picture" />`
      : `<span class="profile-avatar-fallback" aria-hidden="true">${escapeHTML(initialsFromName(displayName))}</span>`;
  }

  function profileHeroSection() {
    const coverPhotoUrl = String(state?.coverPhotoUrl || '').trim();
    const displayName = String(state?.name || 'User').trim() || 'User';
    const department = String(state?.department || '').trim();
    const position = String(state?.position || '').trim();
    const subtitle = [department, position].filter(Boolean).join('  |  ') || 'Team Member';
    const coverMarkup = coverPhotoUrl
      ? `<img class="profile-cover-image" src="${escapeHTML(coverPhotoUrl)}" decoding="async" alt="${escapeHTML(displayName)} cover photo" />`
      : `<div class="profile-cover-fallback" aria-hidden="true"></div>`;
    const coverRemoveMarkup = coverPhotoUrl
      ? `<button class="profile-cover-remove profile-image-remove" type="button" data-remove-image="coverPhoto" aria-label="Remove cover photo" title="Remove cover photo"><i data-feather="trash-2"></i><span>Remove</span></button>`
      : '';
    const avatarRemoveMarkup = String(state?.photoUrl || '').trim()
      ? `<button class="profile-avatar-remove profile-image-remove" type="button" data-remove-image="profilePicture" aria-label="Remove profile picture" title="Remove profile picture"><i data-feather="trash-2"></i><span>Remove</span></button>`
      : '';

    return `
      <section class="profile-hero-section" aria-label="User profile header">
        <div class="profile-cover-section" data-field="coverPhoto">
          <button class="profile-cover-display" type="button" aria-label="Change cover photo" title="Change cover photo">
            ${coverMarkup}
          </button>
          ${coverRemoveMarkup}
          <button class="profile-cover-edit" type="button" aria-label="Edit cover photo" title="Edit cover photo">
            <i data-feather="edit-2"></i>
          </button>
          <input class="acc-file-input profile-cover-file-input" data-upload-field="coverPhoto" type="file" accept="image/*" hidden />
        </div>

        <div class="profile-identity-block">
          <div class="profile-avatar-section" data-field="profilePicture">
            <div class="profile-avatar-shell">
              <button class="profile-avatar-display" type="button" aria-label="Change profile picture" title="Change profile picture">
                ${profileAvatarMarkup()}
              </button>
              <button class="profile-avatar-edit" type="button" aria-label="Edit profile picture" title="Edit profile picture">
                <i data-feather="edit-2"></i>
              </button>
              ${avatarRemoveMarkup}
              <input class="acc-file-input profile-avatar-file-input" data-upload-field="profilePicture" type="file" accept="image/*" hidden />
            </div>
          </div>
          <h2 class="profile-identity-name">${escapeHTML(displayName)}</h2>
          <div class="profile-identity-subtitle">${escapeHTML(subtitle)}</div>
        </div>
      </section>
    `;
  }

  function normalizeFilesMedia(files) {
    return (Array.isArray(files) ? files : [])
      .map((file, index) => ({
        name: String(file?.name || '').trim() || `File ${index + 1}`,
        url: String(file?.url || '').trim(),
      }))
      .filter((file) => file.name || file.url);
  }

  function safeUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw, window.location.origin);
      if (!/^https?:$/i.test(u.protocol)) return '';
      return u.href;
    } catch {
      return '';
    }
  }

  function urlHost(url) {
    const clean = safeUrl(url);
    if (!clean) return '';
    try {
      return new URL(clean).hostname.replace(/^www\./i, '');
    } catch {
      return '';
    }
  }

  function fileIconName(file) {
    const text = `${file?.name || ''} ${file?.url || ''}`.toLowerCase();
    if (/\.(png|jpe?g|webp|gif|bmp|svg|avif)(\?|#|$)/i.test(text)) return 'image';
    if (/\.pdf(\?|#|$)/i.test(text)) return 'file-text';
    if (/\.(xls|xlsx|csv)(\?|#|$)/i.test(text)) return 'grid';
    if (/\.(doc|docx)(\?|#|$)/i.test(text)) return 'file-text';
    if (/\.(ppt|pptx)(\?|#|$)/i.test(text)) return 'monitor';
    if (/\.(zip|rar|7z)(\?|#|$)/i.test(text)) return 'archive';
    return 'paperclip';
  }

  function renderFilesMediaSection() {
    const files = normalizeFilesMedia(state?.filesMedia);
    const filesMarkup = files.length
      ? files.map((file) => {
          const url = safeUrl(file.url);
          const host = urlHost(url);
          const icon = fileIconName(file);
          const inner = `
            <span class="profile-media-file-icon"><i data-feather="${escapeHTML(icon)}"></i></span>
            <span class="profile-media-file-body">
              <span class="profile-media-file-name">${escapeHTML(file.name || host || 'File')}</span>
              ${host ? `<span class="profile-media-file-url">${escapeHTML(host)}</span>` : ''}
            </span>
            ${url ? '<span class="profile-media-file-open"><i data-feather="external-link"></i></span>' : ''}
          `;

          return url
            ? `<a class="profile-media-file-card" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
            : `<div class="profile-media-file-card profile-media-file-card--disabled">${inner}</div>`;
        }).join('')
      : `
        <div class="profile-media-empty">
          <span class="profile-media-empty-icon"><i data-feather="folder"></i></span>
          <span>No files or links added yet.</span>
        </div>
      `;

    return `
      <section class="profile-files-media-section" aria-label="Files and media">
        <div class="profile-files-media-head">
          <span class="profile-files-media-badge"><i data-feather="paperclip"></i></span>
          <div>
            <div class="profile-files-media-title">Files &amp; media</div>
            <div class="profile-files-media-sub">${files.length ? `${files.length} item${files.length === 1 ? '' : 's'} attached to your Notion profile` : 'Attachments from your Team Members record'}</div>
          </div>
        </div>
        <div class="profile-media-files-grid">
          ${filesMarkup}
        </div>
      </section>
    `;
  }

  function render() {
    container.innerHTML = `
      <div class="account-panel account-panel--profile account-profile-modern">
        ${profileHeroSection()}
        <div class="profile-fields-list">
          ${FIELD_META.map(profileFieldCard).join('')}
        </div>
        ${renderFilesMediaSection()}
      </div>
    `;

    if (window.feather) feather.replace();
  }

  function readRawFileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });
  }

  function shouldCompressProfileImage(file) {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if (type === 'image/gif' || type === 'image/svg+xml' || /\.(gif|svg)$/i.test(name)) return false;
    return type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|avif)$/i.test(name);
  }

  function loadProfileImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image for compression.'));
      img.src = dataUrl;
    });
  }

  async function fileToDataUrl(file) {
    const raw = await readRawFileToDataUrl(file);
    if (!shouldCompressProfileImage(file)) return raw;
    try {
      const img = await loadProfileImage(raw);
      const maxW = 1400;
      const maxH = 1400;
      const ratio = Math.min(1, maxW / Math.max(1, img.naturalWidth || img.width), maxH / Math.max(1, img.naturalHeight || img.height));
      const w = Math.max(1, Math.round((img.naturalWidth || img.width) * ratio));
      const h = Math.max(1, Math.round((img.naturalHeight || img.height) * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: true });
      ctx.drawImage(img, 0, 0, w, h);
      let compressed = canvas.toDataURL('image/webp', 0.74);
      if (!/^data:image\/webp/i.test(compressed)) compressed = canvas.toDataURL('image/jpeg', 0.76);
      return compressed && compressed.length < raw.length ? compressed : raw;
    } catch (error) {
      console.warn('Image compression skipped:', error);
      return raw;
    }
  }

  function validateProfilePictureFile(file, inputEl) {
    const selected = file || null;
    if (!selected) return false;

    const mime = String(selected.type || '').toLowerCase();
    const isImage = mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(String(selected.name || ''));

    if (!isImage) {
      toast('warning', 'Invalid file', 'Only image files are allowed for Profile picture.');
      if (inputEl) inputEl.value = '';
      return false;
    }

    if (selected.size > 10 * 1024 * 1024) {
      toast('warning', 'Image too large', 'Please choose an image up to 10MB.');
      if (inputEl) inputEl.value = '';
      return false;
    }

    return true;
  }

  function pendingUploadForField(field) {
    return field === COVER_PHOTO_META.key ? pendingCoverPhoto : pendingProfilePicture;
  }

  function setPendingUploadForField(field, value) {
    if (field === COVER_PHOTO_META.key) pendingCoverPhoto = value;
    else pendingProfilePicture = value;
  }

  function imageMetaForField(field) {
    return field === COVER_PHOTO_META.key ? COVER_PHOTO_META : PROFILE_PICTURE_META;
  }

  async function handleAccountImageUpload(meta, file, inputEl, buttonEl, currentPassword) {
    const selected = file || null;
    if (!selected || !meta?.endpoint) return false;

    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.classList.add('is-uploading');
      buttonEl.setAttribute('aria-busy', 'true');
      buttonEl.setAttribute('title', 'Uploading...');
    }

    try {
      const dataUrl = await fileToDataUrl(selected);
      const res = await fetch(meta.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          filename: selected.name || 'account-image.png',
          dataUrl,
          currentPassword: String(currentPassword || '').trim(),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }

      const returnedUrl = String(json?.[meta.responseKey] || '').trim();
      if (meta.key === COVER_PHOTO_META.key) state.coverPhotoUrl = returnedUrl;
      else state.photoUrl = returnedUrl;

      setPendingUploadForField(meta.key, null);
      render();
      try { window.dispatchEvent(new Event('user:updated')); } catch {}
      toast('success', 'Saved', meta.successMessage || `${meta.label} updated successfully.`);
      return true;
    } catch (e) {
      toast('error', 'Upload failed', e.message === 'invalid password' ? 'invalid password' : (e.message || `Failed to update ${String(meta.label || 'image').toLowerCase()}.`));
      return false;
    } finally {
      if (inputEl) inputEl.value = '';
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.classList.remove('is-uploading');
        buttonEl.removeAttribute('aria-busy');
        buttonEl.setAttribute('title', `Edit ${String(meta.label || 'image').toLowerCase()}`);
      }
      if (window.feather) feather.replace();
    }
  }


  async function removeAccountImage(fieldKey, buttonEl) {
    const meta = imageMetaForField(fieldKey);
    if (!meta?.endpoint) return;

    const isCover = fieldKey === COVER_PHOTO_META.key;
    const currentUrl = String(isCover ? (state?.coverPhotoUrl || '') : (state?.photoUrl || '')).trim();
    if (!currentUrl) return;

    const label = isCover ? 'cover photo' : 'profile picture';
    const confirmed = window.confirm(`Remove ${label} and restore the default image?`);
    if (!confirmed) return;

    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.classList.add('is-removing');
      buttonEl.setAttribute('aria-busy', 'true');
    }

    try {
      showSavingOverlay();
      const res = await fetch(meta.endpoint, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }

      if (isCover) state.coverPhotoUrl = '';
      else state.photoUrl = '';

      render();
      try { window.dispatchEvent(new Event('user:updated')); } catch {}
      toast('success', 'Removed', meta.removeSuccessMessage || `${meta.label} removed successfully.`);
    } catch (e) {
      toast('error', 'Remove failed', e.message || `Failed to remove ${label}.`);
    } finally {
      hideSavingOverlay();
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.classList.remove('is-removing');
        buttonEl.removeAttribute('aria-busy');
      }
      if (window.feather) feather.replace();
    }
  }

  // ===== Modal (markup lives in account.html) =====
  // We intentionally reuse the same classes/styles as Expenses "Settled my account"
  // so the Account edit window looks identical.

  const modalEl = document.getElementById('accountEditModal');
  const titleEl = document.getElementById('accountEditTitle');
  const valueLabelEl = document.getElementById('accountEditValueLabel');
  const passLabelEl = document.getElementById('accountEditPasswordLabel');

  const valueWrapEl = document.getElementById('accountEditValueWrap');
  const passWrapEl = document.getElementById('accountEditPasswordWrap');
  const valueInput = document.getElementById('accountEditValue');
  const passInput = document.getElementById('accountEditPassword');

  const toggleValueBtn = document.getElementById('toggleAccountEditValue');
  const togglePassBtn = document.getElementById('toggleAccountEditPassword');
  const confirmBtn = document.getElementById('accountEditSubmit');
  const cancelBtn = document.getElementById('accountEditClose');

  const errorEl = document.getElementById('accountEditError');
  const savingOverlayEl = document.getElementById('accountSavingOverlay');

  function setModalError(message) {
    if (!errorEl) return;
    if (!message) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
      return;
    }
    errorEl.textContent = String(message);
    errorEl.style.display = 'block';
  }

  function showSavingOverlay() {
    if (!savingOverlayEl) return;
    savingOverlayEl.style.display = 'flex';
    savingOverlayEl.setAttribute('aria-hidden', 'false');
    if (window.feather) feather.replace();
  }

  function hideSavingOverlay() {
    if (!savingOverlayEl) return;
    savingOverlayEl.style.display = 'none';
    savingOverlayEl.setAttribute('aria-hidden', 'true');
  }


  let activeField = null;

  function isModalOpen() {
    return !!modalEl && modalEl.style.display === 'flex';
  }

  // ===== Password toggles (same behavior as Login page) =====
  function syncToggleVisual(btn, inputEl) {
    if (!btn || !inputEl) return;
    const isText = String(inputEl.getAttribute('type') || '').toLowerCase() === 'text';
    btn.setAttribute('aria-pressed', String(isText));
    const eye = btn.querySelector('.icon-eye');
    const eyeOff = btn.querySelector('.icon-eye-off');
    if (eye && eyeOff) {
      eye.style.display = isText ? 'none' : '';
      eyeOff.style.display = isText ? '' : 'none';
    }
  }

  function bindToggle(btn) {
    if (!btn) return;
    const targetId = btn.getAttribute('data-target');
    if (!targetId) return;
    const inputEl = document.getElementById(targetId);
    if (!inputEl) return;

    syncToggleVisual(btn, inputEl);

    btn.addEventListener('click', () => {
      const t = String(inputEl.getAttribute('type') || '').toLowerCase();
      const show = t === 'password';
      inputEl.setAttribute('type', show ? 'text' : 'password');
      syncToggleVisual(btn, inputEl);
    });
  }

  // Bind once
  bindToggle(toggleValueBtn);
  bindToggle(togglePassBtn);

  function openModalForField(fieldKey, options = {}) {
    const meta = fieldKey === PROFILE_PICTURE_META.key
      ? PROFILE_PICTURE_META
      : (fieldKey === COVER_PHOTO_META.key
        ? COVER_PHOTO_META
        : FIELD_META.find((m) => m.key === fieldKey));
    if (!meta || !modalEl) return;

    const isProfilePicture = !!meta.isFileUpload;
    activeField = meta;

    if (titleEl) titleEl.textContent = isProfilePicture ? `Change ${meta.label}` : `Edit ${meta.label}`;
    if (valueLabelEl) valueLabelEl.innerHTML = `<i data-feather="${escapeHTML(meta.icon)}"></i> ${escapeHTML(isProfilePicture ? 'Selected image' : meta.label)}`;
    if (passLabelEl) passLabelEl.innerHTML = `<i data-feather="lock"></i> Current password`;
    if (confirmBtn) confirmBtn.textContent = isProfilePicture ? 'Upload' : 'Submit';

    // Configure input type per field
    if (valueInput) {
      valueInput.removeAttribute('readonly');
      valueInput.type = isProfilePicture ? 'text' : (meta.inputType || 'text');

      if (!isProfilePicture && meta.inputMode) valueInput.setAttribute('inputmode', meta.inputMode);
      else valueInput.removeAttribute('inputmode');

      if (!isProfilePicture && meta.autocomplete) valueInput.setAttribute('autocomplete', meta.autocomplete);
      else valueInput.removeAttribute('autocomplete');

      const placeholder = isProfilePicture
        ? (options.placeholder || meta.placeholder || 'Selected image')
        : (meta.placeholder || '');
      if (placeholder) valueInput.setAttribute('placeholder', placeholder);
      else valueInput.removeAttribute('placeholder');

      if (isProfilePicture) {
        valueInput.value = String(options.fileName || '').trim();
        valueInput.setAttribute('readonly', 'readonly');
      } else {
        // Prefill current value (except password)
        valueInput.value = (fieldKey === 'password')
          ? ''
          : ((state && state[fieldKey] != null) ? String(state[fieldKey]) : '');
      }
    }

    // Ensure the "Current password" input is always hidden by default
    if (passInput) {
      passInput.setAttribute('type', 'password');
      passInput.value = '';
    }

    // Only show toggle for the value input when editing password
    if (valueWrapEl) {
      valueWrapEl.classList.toggle('has-toggle', !isProfilePicture && fieldKey === 'password');
    }

    // Reset toggle icons/state on every open
    if (toggleValueBtn && valueInput) syncToggleVisual(toggleValueBtn, valueInput);
    if (togglePassBtn && passInput) syncToggleVisual(togglePassBtn, passInput);

    setModalError('');

    modalEl.style.display = 'flex';
    modalEl.setAttribute('aria-hidden', 'false');

    // Focus
    setTimeout(() => {
      if (isProfilePicture) {
        passInput?.focus();
        passInput?.select?.();
      } else {
        valueInput?.focus();
        valueInput?.select?.();
      }
    }, 0);

    if (window.feather) feather.replace();
  }

  function closeModal(options = {}) {
    if (!modalEl) return;
    const preservePendingProfilePicture = !!options.preservePendingProfilePicture;
    const closingUploadField = activeField && activeField.isFileUpload ? activeField.key : '';

    modalEl.style.display = 'none';
    modalEl.setAttribute('aria-hidden', 'true');
    activeField = null;
    // Clear sensitive fields
    if (passInput) {
      passInput.setAttribute('type', 'password');
      passInput.value = '';
    }
    if (valueInput) {
      valueInput.removeAttribute('readonly');
      valueInput.value = '';
      // When closing, always revert the value input back to password if it was shown
      // (will be re-configured correctly on next open anyway)
      if (String(valueInput.getAttribute('type') || '').toLowerCase() === 'text') {
        valueInput.setAttribute('type', 'password');
      }
    }

    if (confirmBtn) confirmBtn.textContent = 'Submit';
    if (valueWrapEl) valueWrapEl.classList.remove('has-toggle');
    if (toggleValueBtn && valueInput) syncToggleVisual(toggleValueBtn, valueInput);
    if (togglePassBtn && passInput) syncToggleVisual(togglePassBtn, passInput);
    setModalError('');

    if (closingUploadField && !preservePendingProfilePicture) {
      const pending = pendingUploadForField(closingUploadField);
      try { pending?.inputEl && (pending.inputEl.value = ''); } catch {}
      setPendingUploadForField(closingUploadField, null);
    }
  }

  // Close when clicking on the backdrop (outside the box)
  modalEl?.addEventListener('click', (e) => {
    if (e.target === modalEl) closeModal();
  });

  cancelBtn?.addEventListener('click', closeModal);

  passInput?.addEventListener('input', () => setModalError(''));
  valueInput?.addEventListener('input', () => setModalError(''));

  confirmBtn?.addEventListener('click', async () => {
    if (!activeField) return;
    await saveActiveField();
  });

  // Enter to confirm, Esc to cancel
  document.addEventListener('keydown', (e) => {
    if (!isModalOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key === 'Enter') {
      // Avoid submitting while focused on a button
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
      e.preventDefault();
      saveActiveField();
    }
  });

  async function saveActiveField() {
    if (!activeField || !modalEl) return;

    const field = activeField.key;
    const meta = activeField;
    const isProfilePicture = !!meta.isFileUpload;

    const newValRaw = String(valueInput?.value ?? '');
    const newVal = isProfilePicture ? null : normalizeValueForApi(field, newValRaw);

    const currentPassword = String(passInput?.value || '').trim();

    // Reset error message on every submit
    setModalError('');

    if (isProfilePicture && !(pendingUploadForField(field) && pendingUploadForField(field).file)) {
      toast('warning', 'Image required', 'Please choose an image first.');
      closeModal();
      return;
    }

    // Client-side validation
    if (!isProfilePicture && meta.required && (!newVal || String(newVal).trim() === '')) {
      toast('warning', 'Required', `${meta.label} cannot be empty.`);
      return;
    }
    if (!currentPassword) {
      toast('warning', 'Password required', 'Current password is required to save changes.');
      return;
    }

    // Build payload
    const payload = { currentPassword };
    if (!isProfilePicture) payload[field] = newVal;

    // UI lock
    if (confirmBtn) confirmBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    try {
      // 1) Verify password first (so if it's correct we can close the modal immediately)
      const vRes = await fetch('/api/account/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ currentPassword }),
      });

      const vJson = await vRes.json().catch(() => ({}));
      if (!vRes.ok) {
        if (vRes.status === 401) {
          // Keep modal open and show inline message
          setModalError('invalid password');
          passInput?.focus?.();
          passInput?.select?.();
          return;
        }
        throw new Error(vJson.error || `Request failed (${vRes.status})`);
      }

      // Password OK → close modal + show saving loader until the update completes
      closeModal({ preservePendingProfilePicture: isProfilePicture });
      showSavingOverlay();

      if (isProfilePicture) {
        const pendingUpload = pendingUploadForField(field);
        await handleAccountImageUpload(
          imageMetaForField(field),
          pendingUpload?.file || null,
          pendingUpload?.inputEl || null,
          pendingUpload?.buttonEl || null,
          currentPassword,
        );
        return;
      }

      // 2) Save changes
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          toast('error', 'Save failed', 'invalid password');
          return;
        }
        throw new Error(json.error || `Request failed (${res.status})`);
      }

      // Update local state
      if (field === 'password') {
        state.passwordSet = true;
      } else {
        state[field] = newVal;
      }

      render();

      // Keep greeting / sidebar profile in sync
      if (field === 'name') {
        try { localStorage.setItem('username', String(newVal || '').trim()); } catch {}
      }
      // Refresh common UI (greeting + sidebar profile + permissions) from the server
      try { window.dispatchEvent(new Event('user:updated')); } catch {}

      toast('success', 'Saved', `${meta.label} updated successfully.`);
    } catch (e) {
      toast('error', 'Save failed', e.message || 'Failed to update account.');
    } finally {
      hideSavingOverlay();
      if (confirmBtn) confirmBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      if (window.feather) feather.replace();
    }
  }

  // ===== Load account data =====
  async function load() {
    container.innerHTML = `<p><i class="loading-icon" data-feather="loader"></i> Loading account...</p>`;
    if (window.feather) feather.replace();

    try {
      const res = await fetch('/api/account', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }

      const data = await res.json();

      state = {
        name: data.name || '',
        department: data.department || '',
        position: data.position || '',
        phone: data.phone || '',
        email: data.email || '',
        employeeCode: (typeof data.employeeCode === 'number' || typeof data.employeeCode === 'string')
          ? String(data.employeeCode ?? '').trim()
          : '',
        photoUrl: data.photoUrl || '',
        coverPhotoUrl: data.coverPhotoUrl || '',
        filesMedia: normalizeFilesMedia(data.filesMedia),
        passwordSet: !!data.passwordSet,
      };

      render();
    } catch (e) {
      container.innerHTML = `
        <div class="card" style="border:1px solid #FCA5A5; background:#FEE2E2; color:#B91C1C; padding:1rem; border-radius:8px;">
          <strong>Error:</strong> ${escapeHTML(e.message)}
        </div>
      `;
    } finally {
      if (window.feather) feather.replace();
    }
  }

  // Event delegation for image actions
  container.addEventListener('click', (e) => {
    const removeImageBtn = e.target.closest('[data-remove-image]');
    if (removeImageBtn) {
      e.preventDefault();
      e.stopPropagation();
      removeAccountImage(String(removeImageBtn.dataset.removeImage || '').trim(), removeImageBtn);
      return;
    }

    const coverEditBtn = e.target.closest('.profile-cover-edit, .profile-cover-display');
    if (coverEditBtn) {
      const coverSection = coverEditBtn.closest('.profile-cover-section');
      const fileInput = coverSection?.querySelector('.acc-file-input');
      fileInput?.click?.();
      return;
    }

    const avatarEditBtn = e.target.closest('.profile-avatar-edit, .profile-avatar-display');
    if (avatarEditBtn) {
      const avatarSection = avatarEditBtn.closest('.profile-avatar-section');
      const fileInput = avatarSection?.querySelector('.acc-file-input');
      fileInput?.click?.();
      return;
    }

    const editBtn = e.target.closest('.acc-edit');
    if (!editBtn) return;

    const row = editBtn.closest('.profile-field-card');
    if (!row) return;

    const field = row.dataset.field;
    openModalForField(field);
  });

  container.addEventListener('change', async (e) => {
    const input = e.target.closest('.acc-file-input');
    if (!input) return;
    const file = input.files && input.files[0] ? input.files[0] : null;
    const field = String(input.dataset.uploadField || '').trim() || (input.closest('.profile-cover-section') ? COVER_PHOTO_META.key : PROFILE_PICTURE_META.key);
    const meta = imageMetaForField(field);
    const hostSection = input.closest(field === COVER_PHOTO_META.key ? '.profile-cover-section' : '.profile-avatar-section');
    const buttonEl = hostSection?.querySelector(field === COVER_PHOTO_META.key ? '.profile-cover-edit' : '.profile-avatar-edit') || null;

    if (!validateProfilePictureFile(file, input)) return;

    setPendingUploadForField(field, { file, inputEl: input, buttonEl });
    openModalForField(field, { fileName: file?.name || '', placeholder: meta.placeholder });
  });

  // Init
  await load();
});
