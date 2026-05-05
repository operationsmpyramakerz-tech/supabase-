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

  function formControlHTML(field, value) {
    const name = String(field.name || '');
    const type = String(field.type || 'rich_text');
    const label = escapeHTML(name);
    const safeValue = escapeHTML(value || '');
    const required = field.required || type === 'title' ? 'required' : '';
    const placeholder = field.placeholder || '';
    const commonAttrs = `data-field-name="${label}" data-field-type="${escapeHTML(type)}" ${required}`;

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

    if (type === 'files') {
      return `
        <label class="ua-form-field ua-form-field--wide">
          <span>${label}</span>
          <textarea rows="3" ${commonAttrs} placeholder="Paste external file/image URLs, one per line">${safeValue}</textarea>
        </label>
      `;
    }

    if (type === 'relation') {
      return `
        <label class="ua-form-field ua-form-field--wide">
          <span>${label}</span>
          <textarea rows="2" ${commonAttrs} placeholder="Optional: Notion page IDs separated by comma or new line">${safeValue}</textarea>
          <small>Relation fields accept Notion page IDs. Existing names are shown in the user details but saving needs IDs.</small>
        </label>
      `;
    }

    if (type === 'multi_select') {
      return `
        <label class="ua-form-field ua-form-field--wide">
          <span>${label}</span>
          <input type="text" ${commonAttrs} value="${safeValue}" placeholder="Comma separated values">
        </label>
      `;
    }

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
        ? `${member?.name || 'User'} • Update data in Notion Team Members database.`
        : `${dept?.name || 'Department'} • Create a new Notion Team Members record.`;
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
