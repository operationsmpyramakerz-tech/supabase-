// public/js/user-access.js
(function () {
  'use strict';

  const state = {
    departments: [],
    editableFields: [],
    activeDepartmentId: '',
    search: '',
    loading: true,
    saving: false,
    membersById: new Map(),
    pendingEditMemberId: '',
    pendingPasswordAction: 'edit',
    formMode: 'create',
    formMemberId: '',
  };

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(type, title, message) {
    try {
      if (window.UI && typeof window.UI.toast === 'function') {
        window.UI.toast(type, title, message);
        return;
      }
    } catch {}
    if (message) console.log(`${title}: ${message}`);
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function initials(name) {
    const parts = String(name || 'User').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return (parts.map((p) => p[0]).join('') || 'U').toUpperCase();
  }

  function avatarHTML(member, extraClass = '') {
    const photo = String(member?.photoUrl || '').trim();
    const label = initials(member?.name);
    if (photo) {
      return `<div class="ua-avatar ${extraClass}"><img src="${escapeHTML(photo)}" alt="${escapeHTML(member?.name || 'User')}" loading="lazy"></div>`;
    }
    return `<div class="ua-avatar ${extraClass}" aria-hidden="true">${escapeHTML(label)}</div>`;
  }

  function hydrateIcons(root = document) {
    try {
      if (window.feather && root && typeof root.querySelector === 'function' && root.querySelector('[data-feather]')) {
        window.feather.replace();
      }
    } catch {}
  }

  function readDepartmentFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return params.get('department') || '';
    } catch {
      return '';
    }
  }

  function writeDepartmentToUrl(departmentId) {
    try {
      const url = new URL(window.location.href);
      if (departmentId) url.searchParams.set('department', departmentId);
      else url.searchParams.delete('department');
      window.history.pushState({ departmentId: departmentId || '' }, '', url.toString());
    } catch {}
  }

  function activeDepartment() {
    if (!state.activeDepartmentId) return null;
    return state.departments.find((d) => d.id === state.activeDepartmentId) || null;
  }

  function allMembers() {
    return state.departments.flatMap((d) => Array.isArray(d.members) ? d.members : []);
  }

  function isDepartmentPage() {
    return !!activeDepartment();
  }

  function getSearchHaystackForMember(member) {
    return [
      member.name,
      member.department,
      member.position,
      member.email,
      member.phone,
      member.employeeCode,
      ...(Array.isArray(member.fields) ? member.fields.map((f) => `${f.label || ''} ${f.value || ''}`) : []),
    ].join(' ').toLowerCase();
  }

  function getFilteredDepartments() {
    const q = normalizeText(state.search);
    if (!q) return state.departments;
    return state.departments.filter((department) => {
      const deptHit = normalizeText(department.name).includes(q);
      const memberHit = (department.members || []).some((member) => getSearchHaystackForMember(member).includes(q));
      return deptHit || memberHit;
    });
  }

  function getFilteredMembers() {
    const dept = activeDepartment();
    const list = Array.isArray(dept?.members) ? dept.members : [];
    const q = normalizeText(state.search);
    if (!q) return list;
    return list.filter((member) => getSearchHaystackForMember(member).includes(q));
  }

  function renderFolders() {
    if (!els.folders || !els.foldersPanel) return;
    const departments = getFilteredDepartments();

    if (els.totalCount) {
      const total = state.departments.reduce((sum, d) => sum + Number(d.count || 0), 0);
      els.totalCount.textContent = `${total} ${total === 1 ? 'user' : 'users'}`;
    }

    if (isDepartmentPage()) {
      els.foldersPanel.hidden = true;
      return;
    }
    els.foldersPanel.hidden = false;

    if (state.loading) {
      els.folders.innerHTML = '<div class="ua-loading-inline"><span></span> Loading departments...</div>';
      return;
    }

    if (!state.departments.length) {
      els.folders.innerHTML = '<div class="ua-empty">No departments found in the Team Members database.</div>';
      return;
    }

    if (!departments.length) {
      els.folders.innerHTML = '<div class="ua-empty">No departments match your search.</div>';
      return;
    }

    els.folders.innerHTML = departments.map((department) => {
      const count = Number(department.count || 0);
      return `
        <button type="button" class="ua-folder" data-dept-id="${escapeHTML(department.id)}">
          <span class="ua-folder__icon"><i data-feather="folder"></i></span>
          <span class="ua-folder__text">
            <span class="ua-folder__name">${escapeHTML(department.name || 'No Department')}</span>
            <span class="ua-folder__count">${count} ${count === 1 ? 'member' : 'members'}</span>
          </span>
          <span class="ua-folder__open"><i data-feather="chevron-right"></i></span>
        </button>
      `;
    }).join('');
    hydrateIcons(els.folders);
  }

  function renderMembers() {
    if (!els.membersGrid || !els.membersPanel) return;

    const dept = activeDepartment();
    if (!dept) {
      els.membersPanel.hidden = true;
      return;
    }
    els.membersPanel.hidden = false;

    if (state.loading) {
      els.membersGrid.innerHTML = `
        <div class="ua-loading-card">
          <div class="ua-loading-card__spinner" aria-hidden="true"></div>
          <div>Loading team members...</div>
        </div>
      `;
      return;
    }

    const members = getFilteredMembers();

    if (els.membersTitle) {
      els.membersTitle.textContent = `${dept.name || 'No Department'} Members`;
    }
    if (els.membersSubtitle) {
      const total = Array.isArray(dept?.members) ? dept.members.length : 0;
      const visible = members.length;
      els.membersSubtitle.textContent = `${visible} of ${total} user${total === 1 ? '' : 's'} shown from this department.`;
    }

    if (!members.length) {
      els.membersGrid.innerHTML = state.search
        ? '<div class="ua-empty">No users match your search inside this department.</div>'
        : '<div class="ua-empty">No users found inside this department.</div>';
      return;
    }

    els.membersGrid.innerHTML = members.map((member) => {
      const role = member.position || 'Team Member';
      const email = member.email || 'No email';
      const phone = member.phone || 'No phone';
      return `
        <article class="ua-member-card" data-member-id="${escapeHTML(member.id)}">
          <div class="ua-member-card__top">
            ${avatarHTML(member)}
            <div class="ua-member-card__identity">
              <h4 title="${escapeHTML(member.name || 'Unnamed')}">${escapeHTML(member.name || 'Unnamed')}</h4>
              <p title="${escapeHTML(role)}">${escapeHTML(role)}</p>
            </div>
          </div>
          <div class="ua-member-card__meta">
            <div class="ua-meta-line" title="${escapeHTML(email)}"><i data-feather="mail"></i><span>${escapeHTML(email)}</span></div>
            <div class="ua-meta-line" title="${escapeHTML(phone)}"><i data-feather="phone"></i><span>${escapeHTML(phone)}</span></div>
            <div class="ua-meta-line" title="${escapeHTML(member.department || 'No Department')}"><i data-feather="briefcase"></i><span>${escapeHTML(member.department || 'No Department')}</span></div>
          </div>
          <div class="ua-member-card__actions">
            <button type="button" class="ua-btn ua-btn--light" data-action="message" data-member-id="${escapeHTML(member.id)}">
              <i data-feather="message-circle"></i>
              <span>Message</span>
            </button>
            <button type="button" class="ua-btn ua-btn--dark" data-action="edit" data-member-id="${escapeHTML(member.id)}">
              <i data-feather="edit-3"></i>
              <span>Edit</span>
            </button>
          </div>
        </article>
      `;
    }).join('');
    hydrateIcons(els.membersGrid);
  }

  function render() {
    renderFolders();
    renderMembers();
    const dept = activeDepartment();
    if (els.searchInput) {
      els.searchInput.placeholder = dept ? 'Search users inside this department...' : 'Search departments, users, emails...';
    }
  }

  function fieldValueFromMember(member, fieldName) {
    const field = (member?.fields || []).find((f) => String(f.label || '') === String(fieldName || ''));
    if (!field) return '';
    if (field.type === 'files') {
      const urls = Array.isArray(field.files)
        ? field.files.map((x) => x?.url || '').filter(Boolean)
        : [];
      return urls.join('\n') || field.value || '';
    }
    if (field.type === 'relation') {
      const ids = Array.isArray(field.relationIds) ? field.relationIds.filter(Boolean) : [];
      return ids.join(', ') || '';
    }
    return field.value || '';
  }

  function schemaFields() {
    if (Array.isArray(state.editableFields) && state.editableFields.length) return state.editableFields;
    return [
      { name: 'Department', type: 'select' },
      { name: 'Name', type: 'title', required: true },
      { name: 'Phone', type: 'phone_number' },
      { name: 'School', type: 'rich_text' },
      { name: 'Password', type: 'rich_text' },
      { name: 'Allowed Pages', type: 'multi_select' },
      { name: 'S.V Schools', type: 'relation' },
      { name: 'Position', type: 'select' },
      { name: 'Profile picture', type: 'files' },
      { name: 'Files & media', type: 'files' },
      { name: 'Employee Code', type: 'number' },
      { name: 'Email', type: 'email' },
    ];
  }

  function optionsDatalist(field) {
    const options = Array.isArray(field.options) ? field.options : [];
    if (!options.length) return '';
    const id = `uaOptions_${String(field.name || '').replace(/[^a-z0-9]/gi, '_')}`;
    return `<datalist id="${escapeHTML(id)}">${options.map((o) => `<option value="${escapeHTML(o)}"></option>`).join('')}</datalist>`;
  }

  function splitCsvValues(value) {
    const raw = String(value || '').trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x || '').trim()).filter(Boolean);
    } catch {}
    return raw.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);
  }

  function uniqValues(values) {
    const out = [];
    const seen = new Set();
    for (const value of values || []) {
      const clean = String(value || '').trim();
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
    return out;
  }

  function fieldOptions(field) {
    return uniqValues(Array.isArray(field?.options) ? field.options : []);
  }

  function multiSelectHTML(field, value) {
    const name = String(field.name || '');
    const type = String(field.type || 'ua_multi_select');
    const selected = uniqValues(splitCsvValues(value));
    const options = uniqValues([...selected, ...fieldOptions(field)]);
    const allowCustom = field.allowCustom !== false;
    const label = escapeHTML(name);
    const hiddenValue = escapeHTML(selected.join(', '));
    const optionHtml = options.length
      ? options.map((option, index) => {
          const checked = selected.some((x) => x.toLowerCase() === String(option).toLowerCase()) ? 'checked' : '';
          return `
            <label class="ua-ms-option">
              <input type="checkbox" data-ms-option value="${escapeHTML(option)}" ${checked}>
              <span>${escapeHTML(option)}</span>
            </label>
          `;
        }).join('')
      : '<div class="ua-ms-empty">No options yet.</div>';
    return `
      <div class="ua-form-field ua-form-field--wide ua-form-field--tokens">
        <span>${label}</span>
        <div class="ua-multiselect" data-multiselect data-field-label="${label}">
          <input type="hidden" data-field-name="${label}" data-field-type="${escapeHTML(type)}" value="${hiddenValue}">
          <div class="ua-token-list" data-ms-selected>
            ${selected.length ? selected.map((x) => `<span class="ua-token">${escapeHTML(x)}</span>`).join('') : '<span class="ua-token ua-token--muted">No values selected</span>'}
          </div>
          <div class="ua-ms-options">${optionHtml}</div>
          ${allowCustom ? `
            <div class="ua-inline-add">
              <input type="text" data-ms-custom placeholder="Add new option then press Add">
              <button type="button" class="ua-mini-btn" data-ms-add>Add</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function schoolSelectHTML(field, value) {
    const name = String(field.name || 'School');
    const options = uniqValues([String(value || '').trim(), ...fieldOptions(field)]).filter(Boolean);
    const selected = String(value || '').trim();
    const label = escapeHTML(name);
    return `
      <div class="ua-form-field ua-form-field--wide ua-form-field--school">
        <span>${label}</span>
        <select data-field-name="${label}" data-field-type="school_select">
          <option value="">Select school / stocktaking column</option>
          ${options.map((option) => `<option value="${escapeHTML(option)}" ${option === selected ? 'selected' : ''}>${escapeHTML(option)}</option>`).join('')}
        </select>
        <div class="ua-inline-add">
          <input type="text" data-school-column-name placeholder="Add new Stocktaking column, e.g. New School Done">
          <button type="button" class="ua-mini-btn" data-school-add>Add column</button>
        </div>
        <small>Adding a school creates a new column in the Supabase stocktaking table, then selects it here.</small>
      </div>
    `;
  }

  function profileUploadHTML(field, value) {
    const name = String(field.name || 'Profile picture');
    const url = String(value || '').trim();
    const label = escapeHTML(name);
    return `
      <div class="ua-form-field ua-form-field--wide ua-upload-field" data-upload-widget="profile">
        <span>${label}</span>
        <input type="hidden" data-field-name="${label}" data-field-type="ua_profile_upload" value="${escapeHTML(url)}">
        <div class="ua-profile-uploader">
          <div class="ua-profile-preview" data-profile-preview>${url ? `<img src="${escapeHTML(url)}" alt="Profile picture">` : '<i data-feather="image"></i>'}</div>
          <div class="ua-upload-actions">
            <label class="ua-file-pick">
              <i data-feather="upload-cloud"></i>
              <span>${url ? 'Replace image' : 'Upload image'}</span>
              <input type="file" accept="image/*" data-profile-file>
            </label>
            <input type="url" data-profile-url placeholder="Or paste image URL" value="${escapeHTML(url)}">
            <button type="button" class="ua-mini-btn" data-profile-use-url>Use link</button>
          </div>
        </div>
        <small data-upload-status></small>
      </div>
    `;
  }

  function fileLinksHTML(field, value) {
    const name = String(field.name || 'Files & media');
    const label = escapeHTML(name);
    const safeValue = escapeHTML(value || '');
    return `
      <div class="ua-form-field ua-form-field--wide ua-upload-field" data-upload-widget="files">
        <span>${label}</span>
        <textarea rows="4" data-field-name="${label}" data-field-type="ua_file_links" placeholder="Uploaded or pasted links, one per line">${safeValue}</textarea>
        <div class="ua-upload-row">
          <label class="ua-file-pick ua-file-pick--small">
            <i data-feather="paperclip"></i>
            <span>Upload file</span>
            <input type="file" data-media-file multiple>
          </label>
          <input type="url" data-media-link placeholder="Insert external link">
          <button type="button" class="ua-mini-btn" data-media-insert-link>Insert link</button>
        </div>
        <small data-upload-status>Use upload for files, or paste a link manually.</small>
      </div>
    `;
  }

  function formControlHTML(field, value) {
    const name = String(field.name || '');
    const type = String(field.type || 'rich_text');
    const canon = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const label = escapeHTML(name);
    const safeValue = escapeHTML(value || '');
    const required = field.required || type === 'title' ? 'required' : '';
    const placeholder = field.placeholder || '';
    const commonAttrs = `data-field-name="${label}" data-field-type="${escapeHTML(type)}" ${required}`;

    if (type === 'school_select' || canon === 'school') return schoolSelectHTML(field, value);
    if (type === 'ua_multi_select' || type === 'multi_select') return multiSelectHTML(field, value);
    if (type === 'ua_profile_upload' || canon === 'profilepicture') return profileUploadHTML(field, value);
    if (type === 'ua_file_links' || canon === 'filesmedia') return fileLinksHTML(field, value);

    if (type === 'checkbox') {
      const yes = /^(yes|true|1)$/i.test(String(value || ''));
      return `
        <label class="ua-form-field ua-form-field--compact">
          <span>${label}</span>
          <select ${commonAttrs}>
            <option value="No" ${yes ? '' : 'selected'}>No</option>
            <option value="Yes" ${yes ? 'selected' : ''}>Yes</option>
          </select>
        </label>
      `;
    }

    if (type === 'files') return fileLinksHTML(field, value);

    if (type === 'relation') return multiSelectHTML({ ...field, type: 'ua_multi_select', allowCustom: false }, value);

    if (type === 'rich_text' || type === 'text') {
      const isLong = String(value || '').length > 90 || /notes?|comment|address|description/i.test(name);
      if (isLong) {
        return `
          <label class="ua-form-field ua-form-field--wide">
            <span>${label}</span>
            <textarea rows="3" ${commonAttrs} placeholder="${escapeHTML(placeholder)}">${safeValue}</textarea>
          </label>
        `;
      }
    }

    const inputType = type === 'email' ? 'email' : type === 'number' ? 'number' : type === 'phone_number' ? 'tel' : type === 'date' ? 'date' : 'text';
    const listId = (type === 'select' || type === 'status') && Array.isArray(field.options) && field.options.length
      ? `uaOptions_${String(field.name || '').replace(/[^a-z0-9]/gi, '_')}`
      : '';
    return `
      <label class="ua-form-field">
        <span>${label}</span>
        <input type="${inputType}" ${commonAttrs} value="${safeValue}" ${listId ? `list="${escapeHTML(listId)}"` : ''} placeholder="${escapeHTML(placeholder)}">
        ${optionsDatalist(field)}
      </label>
    `;
  }

  function openFormModal(mode, member = null) {
    if (!els.formModal || !els.formBody) return;
    state.formMode = mode;
    state.formMemberId = mode === 'edit' ? String(member?.id || '') : '';

    const dept = activeDepartment();
    const fields = schemaFields();
    const body = fields.map((field) => {
      let value = mode === 'edit' ? fieldValueFromMember(member, field.name) : '';
      if (mode === 'create' && String(field.name || '').toLowerCase() === 'department') value = dept?.name || '';
      return formControlHTML(field, value);
    }).join('');

    els.formBody.innerHTML = `<div class="ua-form-grid">${body}</div>`;
    if (els.formTitle) els.formTitle.textContent = mode === 'edit' ? 'Edit Team Member' : 'Add Team Member';
    if (els.formSubtitle) {
      els.formSubtitle.textContent = mode === 'edit'
        ? `${member?.name || 'User'} • Update data in Team Members database.`
        : `${dept?.name || 'Department'} • Create a new Team Members record.`;
    }
    if (els.formSaveLabel) els.formSaveLabel.textContent = mode === 'edit' ? 'Save Changes' : 'Create Member';

    els.formModal.hidden = false;
    els.formModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ua-modal-open');
    hydrateIcons(els.formModal);
    const first = els.formBody.querySelector('[data-field-name="Name"], input, textarea, select');
    setTimeout(() => first?.focus(), 50);
  }

  function closeFormModal() {
    if (!els.formModal) return;
    els.formModal.hidden = true;
    els.formModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ua-modal-open');
    state.formMode = 'create';
    state.formMemberId = '';
  }

  function collectFormFields() {
    const fields = {};
    if (!els.formBody) return fields;
    els.formBody.querySelectorAll('[data-field-name]').forEach((input) => {
      const name = input.getAttribute('data-field-name') || '';
      if (!name) return;
      fields[name] = input.value || '';
    });
    return fields;
  }

  function setFormSaving(saving) {
    state.saving = saving;
    if (els.formSaveBtn) {
      els.formSaveBtn.disabled = saving;
      els.formSaveBtn.classList.toggle('is-loading', saving);
    }
    if (els.formCancelBtn) els.formCancelBtn.disabled = saving;
  }

  async function submitMemberForm(event) {
    event?.preventDefault?.();
    if (state.saving) return;
    const fields = collectFormFields();
    const name = String(fields.Name || fields.name || '').trim();
    if (!name) {
      toast('warning', 'Missing name', 'Please enter the team member name.');
      return;
    }

    setFormSaving(true);
    try {
      const mode = state.formMode;
      const memberId = state.formMemberId;
      const url = mode === 'edit'
        ? `/api/user-access/team-members/${encodeURIComponent(memberId)}`
        : '/api/user-access/team-members';
      const method = mode === 'edit' ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to save member.');

      toast('success', mode === 'edit' ? 'Updated' : 'Created', mode === 'edit' ? 'Team member data updated.' : 'New team member added.');
      closeFormModal();
      await loadMembers({ force: true, keepDepartment: true });
    } catch (error) {
      console.error(error);
      toast('error', 'Save failed', error?.message || 'Failed to save member.');
    } finally {
      setFormSaving(false);
    }
  }

  function openPasswordModal(memberId, action = 'edit') {
    if (!els.passwordModal) return;
    state.pendingEditMemberId = String(memberId || '');
    state.pendingPasswordAction = action === 'create' ? 'create' : 'edit';
    if (els.passwordInput) els.passwordInput.value = '';
    if (els.passwordError) els.passwordError.textContent = '';
    try {
      const title = document.getElementById('uaAdminPasswordTitle');
      const subtitle = els.passwordModal.querySelector('.ua-modal__header p');
      if (title) title.textContent = state.pendingPasswordAction === 'create' ? 'Admin Verification' : 'Admin Verification';
      if (subtitle) subtitle.textContent = state.pendingPasswordAction === 'create'
        ? 'Enter the Admin user password to add a new member.'
        : 'Enter the Admin user password to open the edit page.';
    } catch {}
    els.passwordModal.hidden = false;
    els.passwordModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ua-modal-open');
    hydrateIcons(els.passwordModal);
    setTimeout(() => els.passwordInput?.focus(), 50);
  }

  function closePasswordModal() {
    if (!els.passwordModal) return;
    els.passwordModal.hidden = true;
    els.passwordModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ua-modal-open');
    state.pendingEditMemberId = '';
    state.pendingPasswordAction = 'edit';
  }

  function setPasswordLoading(loading) {
    if (els.passwordConfirmBtn) {
      els.passwordConfirmBtn.disabled = loading;
      els.passwordConfirmBtn.classList.toggle('is-loading', loading);
    }
    if (els.passwordCancelBtn) els.passwordCancelBtn.disabled = loading;
  }

  async function submitAdminPassword(event) {
    event?.preventDefault?.();
    const password = String(els.passwordInput?.value || '').trim();
    if (!password) {
      if (els.passwordError) els.passwordError.textContent = 'Please enter the Admin password.';
      return;
    }
    setPasswordLoading(true);
    if (els.passwordError) els.passwordError.textContent = '';
    try {
      const res = await fetch('/api/user-access/admin/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Invalid Admin password.');

      const action = state.pendingPasswordAction;
      const memberId = state.pendingEditMemberId;
      const member = state.membersById.get(memberId);
      closePasswordModal();
      if (action === 'create') {
        openFormModal('create');
      } else if (member) {
        openFormModal('edit', member);
      }
    } catch (error) {
      if (els.passwordError) els.passwordError.textContent = error?.message || 'Invalid Admin password.';
      toast('error', 'Access denied', error?.message || 'Invalid Admin password.');
    } finally {
      setPasswordLoading(false);
    }
  }

  function navigateToDepartment(departmentId, push = true) {
    state.activeDepartmentId = departmentId || '';
    if (push) writeDepartmentToUrl(state.activeDepartmentId);
    render();
    setTimeout(() => els.membersPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
  }

  function backToDepartments(push = true) {
    state.activeDepartmentId = '';
    if (push) writeDepartmentToUrl('');
    render();
    setTimeout(() => els.foldersPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
  }

  function handleMessage(memberId) {
    const member = state.membersById.get(memberId);
    toast('info', 'Message', `${member?.name || 'This user'} messaging will be connected later.`);
  }

  async function loadMembers({ force = false, keepDepartment = false } = {}) {
    const requestedDepartment = keepDepartment ? state.activeDepartmentId : readDepartmentFromUrl();
    state.loading = true;
    render();

    if (els.refreshBtn) {
      els.refreshBtn.disabled = true;
      els.refreshBtn.classList.add('is-loading');
      const label = els.refreshBtn.querySelector('span');
      if (label) label.textContent = 'Refreshing';
    }

    try {
      const url = force ? `/api/user-access/team-members?_fresh=1&_refresh=${Date.now()}` : '/api/user-access/team-members';
      const res = await fetch(url, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: force ? { 'X-Ops-Hard-Refresh': '1' } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load team members.');

      const departments = Array.isArray(data.departments) ? data.departments : [];
      state.departments = departments;
      state.editableFields = Array.isArray(data.editableFields) ? data.editableFields : [];
      state.membersById = new Map();
      departments.forEach((department) => {
        (department.members || []).forEach((member) => state.membersById.set(String(member.id), member));
      });

      if (requestedDepartment && departments.some((d) => d.id === requestedDepartment)) {
        state.activeDepartmentId = requestedDepartment;
      } else if (requestedDepartment && !departments.some((d) => d.id === requestedDepartment)) {
        state.activeDepartmentId = '';
        writeDepartmentToUrl('');
      } else if (!keepDepartment) {
        state.activeDepartmentId = '';
      }
    } catch (error) {
      console.error(error);
      state.departments = [];
      state.membersById = new Map();
      if (els.folders) {
        els.folders.innerHTML = `<div class="ua-error">${escapeHTML(error?.message || 'Failed to load team members.')}</div>`;
      }
      if (els.membersGrid) {
        els.membersGrid.innerHTML = '<div class="ua-error">Could not load the user cards. Please try Refresh.</div>';
      }
      toast('error', 'Load failed', error?.message || 'Could not load team members.');
    } finally {
      state.loading = false;
      if (els.refreshBtn) {
        els.refreshBtn.disabled = false;
        els.refreshBtn.classList.remove('is-loading');
        const label = els.refreshBtn.querySelector('span');
        if (label) label.textContent = 'Refresh';
      }
      render();
    }
  }

  function syncMultiSelectWidget(widget) {
    if (!widget) return;
    const hidden = widget.querySelector('input[type="hidden"][data-field-name]');
    const selectedBox = widget.querySelector('[data-ms-selected]');
    const values = Array.from(widget.querySelectorAll('input[data-ms-option]:checked'))
      .map((input) => input.value)
      .filter(Boolean);
    const clean = uniqValues(values);
    if (hidden) hidden.value = clean.join(', ');
    if (selectedBox) {
      selectedBox.innerHTML = clean.length
        ? clean.map((x) => `<span class="ua-token">${escapeHTML(x)}</span>`).join('')
        : '<span class="ua-token ua-token--muted">No values selected</span>';
    }
  }

  function addMultiSelectOption(widget, value, checked = true) {
    if (!widget || !value) return;
    const optionsBox = widget.querySelector('.ua-ms-options');
    if (!optionsBox) return;
    const exists = Array.from(optionsBox.querySelectorAll('input[data-ms-option]'))
      .some((input) => String(input.value || '').trim().toLowerCase() === String(value).trim().toLowerCase());
    if (!exists) {
      const empty = optionsBox.querySelector('.ua-ms-empty');
      if (empty) empty.remove();
      const label = document.createElement('label');
      label.className = 'ua-ms-option';
      label.innerHTML = `<input type="checkbox" data-ms-option value="${escapeHTML(value)}" ${checked ? 'checked' : ''}><span>${escapeHTML(value)}</span>`;
      optionsBox.prepend(label);
    } else if (checked) {
      const input = Array.from(optionsBox.querySelectorAll('input[data-ms-option]'))
        .find((x) => String(x.value || '').trim().toLowerCase() === String(value).trim().toLowerCase());
      if (input) input.checked = true;
    }
    syncMultiSelectWidget(widget);
  }

  function setUploadStatus(widget, message, isError = false) {
    const status = widget?.querySelector('[data-upload-status]');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('is-error', !!isError);
  }

  function readRawFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });
  }

  function shouldCompressUploadImage(file) {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if (type === 'image/gif' || type === 'image/svg+xml' || /\.(gif|svg)$/i.test(name)) return false;
    return type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|avif)$/i.test(name);
  }

  function loadUploadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image for compression.'));
      img.src = dataUrl;
    });
  }

  async function compressUploadImageDataUrl(file, rawDataUrl) {
    if (!shouldCompressUploadImage(file)) return rawDataUrl;
    try {
      const img = await loadUploadImage(rawDataUrl);
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
      return compressed && compressed.length < rawDataUrl.length ? compressed : rawDataUrl;
    } catch (error) {
      console.warn('Image compression skipped:', error);
      return rawDataUrl;
    }
  }

  async function readFileAsDataUrl(file) {
    const raw = await readRawFileAsDataUrl(file);
    return compressUploadImageDataUrl(file, raw);
  }

  async function uploadUserAccessFile(file, kind) {
    const dataUrl = await readFileAsDataUrl(file);
    const res = await fetch('/api/user-access/upload-file', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, filename: file.name || 'upload.bin', kind }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Upload failed.');
    return data;
  }

  async function handleSchoolAdd(button) {
    const field = button.closest('.ua-form-field--school');
    const input = field?.querySelector('[data-school-column-name]');
    const select = field?.querySelector('select[data-field-name]');
    const name = String(input?.value || '').trim();
    if (!name) return toast('warning', 'Missing school', 'Enter the new school / column name first.');
    button.disabled = true;
    button.classList.add('is-loading');
    try {
      const res = await fetch('/api/user-access/stocktaking-columns', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to add column.');
      const label = data.label || name;
      if (select && !Array.from(select.options).some((o) => o.value.toLowerCase() === String(label).toLowerCase())) {
        const opt = new Option(label, label, true, true);
        select.add(opt, 1);
      }
      if (select) select.value = label;
      if (input) input.value = '';
      toast('success', 'School added', `${label} was added to Stocktaking.`);
    } catch (error) {
      toast('error', 'Could not add school', error?.message || 'Failed to add Stocktaking column.');
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  }

  async function handleProfileFile(input) {
    const file = input?.files?.[0];
    if (!file) return;
    const widget = input.closest('[data-upload-widget="profile"]');
    const hidden = widget?.querySelector('input[type="hidden"][data-field-name]');
    const preview = widget?.querySelector('[data-profile-preview]');
    setUploadStatus(widget, 'Uploading profile picture...');
    try {
      const data = await uploadUserAccessFile(file, 'profile-picture');
      if (hidden) hidden.value = data.url || '';
      const urlInput = widget?.querySelector('[data-profile-url]');
      if (urlInput) urlInput.value = data.url || '';
      if (preview) preview.innerHTML = `<img src="${escapeHTML(data.url || '')}" alt="Profile picture">`;
      setUploadStatus(widget, 'Profile picture uploaded. Save changes to apply it.');
      toast('success', 'Uploaded', 'Profile picture uploaded.');
    } catch (error) {
      setUploadStatus(widget, error?.message || 'Upload failed.', true);
      toast('error', 'Upload failed', error?.message || 'Profile picture upload failed.');
    } finally {
      input.value = '';
    }
  }

  async function handleMediaFiles(input) {
    const files = Array.from(input?.files || []);
    if (!files.length) return;
    const widget = input.closest('[data-upload-widget="files"]');
    const textarea = widget?.querySelector('textarea[data-field-name]');
    setUploadStatus(widget, `Uploading ${files.length} file${files.length === 1 ? '' : 's'}...`);
    try {
      const urls = [];
      for (const file of files) {
        const data = await uploadUserAccessFile(file, 'files-media');
        if (data?.url) urls.push(data.url);
      }
      if (textarea && urls.length) {
        const existing = String(textarea.value || '').trim();
        textarea.value = [existing, ...urls].filter(Boolean).join('\n');
      }
      setUploadStatus(widget, `${urls.length} file${urls.length === 1 ? '' : 's'} uploaded. Save changes to apply.`);
      toast('success', 'Uploaded', `${urls.length} file${urls.length === 1 ? '' : 's'} uploaded.`);
    } catch (error) {
      setUploadStatus(widget, error?.message || 'Upload failed.', true);
      toast('error', 'Upload failed', error?.message || 'File upload failed.');
    } finally {
      input.value = '';
    }
  }

  function handleFormBodyClick(event) {
    const msAdd = event.target.closest('[data-ms-add]');
    if (msAdd) {
      const widget = msAdd.closest('[data-multiselect]');
      const input = widget?.querySelector('[data-ms-custom]');
      const value = String(input?.value || '').trim();
      if (!value) return;
      addMultiSelectOption(widget, value, true);
      if (input) input.value = '';
      return;
    }

    const schoolAdd = event.target.closest('[data-school-add]');
    if (schoolAdd) return handleSchoolAdd(schoolAdd);

    const useProfileUrl = event.target.closest('[data-profile-use-url]');
    if (useProfileUrl) {
      const widget = useProfileUrl.closest('[data-upload-widget="profile"]');
      const input = widget?.querySelector('[data-profile-url]');
      const hidden = widget?.querySelector('input[type="hidden"][data-field-name]');
      const preview = widget?.querySelector('[data-profile-preview]');
      const url = String(input?.value || '').trim();
      if (!url) return;
      if (hidden) hidden.value = url;
      if (preview) preview.innerHTML = `<img src="${escapeHTML(url)}" alt="Profile picture">`;
      setUploadStatus(widget, 'Image link inserted. Save changes to apply it.');
      return;
    }

    const mediaInsert = event.target.closest('[data-media-insert-link]');
    if (mediaInsert) {
      const widget = mediaInsert.closest('[data-upload-widget="files"]');
      const input = widget?.querySelector('[data-media-link]');
      const textarea = widget?.querySelector('textarea[data-field-name]');
      const url = String(input?.value || '').trim();
      if (!url) return;
      const existing = String(textarea?.value || '').trim();
      if (textarea) textarea.value = [existing, url].filter(Boolean).join('\n');
      if (input) input.value = '';
      setUploadStatus(widget, 'Link inserted. Save changes to apply it.');
    }
  }

  function handleFormBodyChange(event) {
    const option = event.target.closest('input[data-ms-option]');
    if (option) return syncMultiSelectWidget(option.closest('[data-multiselect]'));
    if (event.target.matches('[data-profile-file]')) return handleProfileFile(event.target);
    if (event.target.matches('[data-media-file]')) return handleMediaFiles(event.target);
  }

  function bindEvents() {
    els.folders?.addEventListener('click', (event) => {
      const btn = event.target.closest('.ua-folder[data-dept-id]');
      if (!btn) return;
      navigateToDepartment(btn.getAttribute('data-dept-id') || '');
    });

    els.membersGrid?.addEventListener('click', (event) => {
      const actionBtn = event.target.closest('[data-action][data-member-id]');
      if (!actionBtn) return;
      const id = String(actionBtn.getAttribute('data-member-id') || '');
      const action = String(actionBtn.getAttribute('data-action') || '');
      if (!id) return;
      if (action === 'edit') openPasswordModal(id);
      if (action === 'message') handleMessage(id);
    });

    els.searchInput?.addEventListener('input', () => {
      state.search = els.searchInput.value || '';
      render();
    });

    els.refreshBtn?.addEventListener('click', () => loadMembers({ force: true, keepDepartment: true }));
    els.backBtn?.addEventListener('click', () => backToDepartments());
    els.addMemberBtn?.addEventListener('click', () => openPasswordModal('', 'create'));

    els.passwordForm?.addEventListener('submit', submitAdminPassword);
    els.passwordCancelBtn?.addEventListener('click', closePasswordModal);
    els.passwordClose?.addEventListener('click', closePasswordModal);
    els.passwordModal?.addEventListener('click', (event) => {
      if (event.target === els.passwordModal) closePasswordModal();
    });

    els.form?.addEventListener('submit', submitMemberForm);
    els.formBody?.addEventListener('click', handleFormBodyClick);
    els.formBody?.addEventListener('change', handleFormBodyChange);
    els.formCancelBtn?.addEventListener('click', closeFormModal);
    els.formClose?.addEventListener('click', closeFormModal);
    els.formModal?.addEventListener('click', (event) => {
      if (event.target === els.formModal) closeFormModal();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (els.passwordModal && !els.passwordModal.hidden) return closePasswordModal();
      if (els.formModal && !els.formModal.hidden) return closeFormModal();
    });

    window.addEventListener('popstate', () => {
      state.activeDepartmentId = readDepartmentFromUrl();
      if (!state.departments.some((d) => d.id === state.activeDepartmentId)) state.activeDepartmentId = '';
      render();
    });
  }

  function init() {
    els.foldersPanel = $('uaFoldersPanel');
    els.membersPanel = $('uaMembersPanel');
    els.folders = $('uaFolders');
    els.membersGrid = $('uaMembersGrid');
    els.searchInput = $('uaSearchInput');
    els.refreshBtn = $('uaRefreshBtn');
    els.totalCount = $('uaTotalCount');
    els.membersTitle = $('uaMembersTitle');
    els.membersSubtitle = $('uaMembersSubtitle');
    els.backBtn = $('uaBackToDepartments');
    els.addMemberBtn = $('uaAddMemberBtn');

    els.passwordModal = $('uaAdminPasswordModal');
    els.passwordForm = $('uaAdminPasswordForm');
    els.passwordInput = $('uaAdminPasswordInput');
    els.passwordError = $('uaAdminPasswordError');
    els.passwordConfirmBtn = $('uaAdminPasswordConfirm');
    els.passwordCancelBtn = $('uaAdminPasswordCancel');
    els.passwordClose = $('uaAdminPasswordClose');

    els.formModal = $('uaMemberFormModal');
    els.form = $('uaMemberForm');
    els.formBody = $('uaMemberFormBody');
    els.formTitle = $('uaMemberFormTitle');
    els.formSubtitle = $('uaMemberFormSubtitle');
    els.formSaveBtn = $('uaMemberFormSave');
    els.formSaveLabel = $('uaMemberFormSaveLabel');
    els.formCancelBtn = $('uaMemberFormCancel');
    els.formClose = $('uaMemberFormClose');

    bindEvents();
    loadMembers();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
