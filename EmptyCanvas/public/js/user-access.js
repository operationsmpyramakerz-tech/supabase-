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
    formMemberSnapshot: null,
    pageAccessCache: new Map(),
    pageAccessDraft: [],
    pageAccessModalRows: [],
    pageAccessModalMemberId: '',
    pageAccessModalLoading: false,
    pageAccessSaving: false,
    svAccessCache: new Map(),
    svAccessModalRows: [],
    svAccessModalMemberId: '',
    svAccessModalLoading: false,
    svAccessSaving: false,
    departmentModalMode: 'create',
    departmentTargetId: '',
    moveMemberId: '',
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

  function departmentById(departmentId) {
    const id = String(departmentId || '').trim();
    if (!id) return null;
    return state.departments.find((d) => String(d.id || '') === id) || null;
  }

  function departmentName(department) {
    return String(department?.name || 'No Department').trim() || 'No Department';
  }

  function canEditDepartment(department) {
    return !!department && departmentName(department).toLowerCase() !== 'no department';
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
      const name = departmentName(department);
      const deptId = String(department.id || '');
      const canEdit = canEditDepartment(department);
      const editDisabled = canEdit ? '' : 'disabled aria-disabled="true" title="Default fallback department cannot be renamed"';
      const deleteDisabled = canEdit ? '' : 'disabled aria-disabled="true" title="Default fallback department cannot be deleted"';
      const emptyBadge = count ? '' : '<span class="ua-folder__badge">Empty</span>';
      return `
        <article class="ua-folder" data-dept-id="${escapeHTML(deptId)}" role="button" tabindex="0" aria-label="Open ${escapeHTML(name)} department">
          <div class="ua-folder__main">
            <span class="ua-folder__icon"><i data-feather="folder"></i></span>
            <span class="ua-folder__text">
              <span class="ua-folder__name" title="${escapeHTML(name)}">${escapeHTML(name)}</span>
              <span class="ua-folder__count">${count} ${count === 1 ? 'member' : 'members'}${emptyBadge}</span>
            </span>
          </div>
          <div class="ua-folder__actions">
            <button type="button" class="ua-folder__edit" data-action="edit-department" data-dept-id="${escapeHTML(deptId)}" ${editDisabled}>
              <i data-feather="edit-3"></i>
              <span>Edit</span>
            </button>
            <button type="button" class="ua-folder__delete" data-action="delete-department" data-dept-id="${escapeHTML(deptId)}" ${deleteDisabled}>
              <i data-feather="trash-2"></i>
              <span>Delete</span>
            </button>
            <span class="ua-folder__open"><i data-feather="chevron-right"></i></span>
          </div>
        </article>
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
            <div class="ua-member-menu-wrap">
              <button type="button" class="ua-member-menu-btn" data-action="toggle-member-menu" data-member-id="${escapeHTML(member.id)}" aria-label="More actions for ${escapeHTML(member.name || 'user')}">
                <i data-feather="more-vertical"></i>
              </button>
              <div class="ua-member-menu" data-member-menu="${escapeHTML(member.id)}" hidden>
                <button type="button" data-action="move-member" data-member-id="${escapeHTML(member.id)}">
                  <i data-feather="shuffle"></i>
                  <span>Move</span>
                </button>
                <button type="button" class="is-danger" data-action="delete-member" data-member-id="${escapeHTML(member.id)}">
                  <i data-feather="trash-2"></i>
                  <span>Delete</span>
                </button>
              </div>
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

  function canonFieldName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function isAllowedPagesField(fieldOrName) {
    const name = typeof fieldOrName === 'string' ? fieldOrName : fieldOrName?.name;
    return canonFieldName(name) === 'allowedpages';
  }

  function isSvSchoolsField(fieldOrName) {
    const name = typeof fieldOrName === 'string' ? fieldOrName : fieldOrName?.name;
    return canonFieldName(name) === 'svschools';
  }

  function normalizeAccessRows(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        pageId: String(row?.pageId || row?.page_id || row?.id || '').trim(),
        pageKey: String(row?.pageKey || row?.page_key || '').trim(),
        pageName: String(row?.pageName || row?.page_name || row?.name || 'Page').trim() || 'Page',
        moduleName: String(row?.moduleName || row?.module_name || 'General').trim() || 'General',
        routePath: String(row?.routePath || row?.route_path || '').trim(),
        sortOrder: Number(row?.sortOrder || row?.sort_order || 100),
        accessLevel: String(row?.accessLevel || row?.access_level || 'user').toLowerCase() === 'admin' ? 'admin' : 'user',
        isEnabled: !!(row?.isEnabled ?? row?.is_enabled ?? row?.enabled),
      }))
      .filter((row) => row.pageId || row.pageKey)
      .sort((a, b) => (Number(a.sortOrder || 0) - Number(b.sortOrder || 0)) || a.pageName.localeCompare(b.pageName));
  }

  function pageAccessSummaryFromRows(rows) {
    const enabled = (rows || []).filter((row) => !!row.isEnabled);
    const admins = enabled.filter((row) => row.accessLevel === 'admin');
    return { enabledCount: enabled.length, adminCount: admins.length };
  }

  function pageAccessSummaryText(member = null) {
    const memberId = String(member?.id || state.formMemberId || '').trim();
    let summary = null;
    if (memberId && state.pageAccessCache.has(memberId)) {
      summary = pageAccessSummaryFromRows(state.pageAccessCache.get(memberId));
    } else if (state.formMode === 'create' && state.pageAccessDraft.length) {
      summary = pageAccessSummaryFromRows(state.pageAccessDraft);
    } else if (member?.pageAccessSummary) {
      summary = {
        enabledCount: Number(member.pageAccessSummary.accessCount || 0),
        adminCount: Number(member.pageAccessSummary.adminCount || 0),
      };
    }

    if (!summary || !summary.enabledCount) return 'No pages enabled yet. Open the access window to configure permissions.';
    const adminPart = summary.adminCount ? ` • ${summary.adminCount} admin` : '';
    return `${summary.enabledCount} enabled page${summary.enabledCount === 1 ? '' : 's'}${adminPart}`;
  }

  function updatePageAccessSummaryText() {
    const summary = els.formBody?.querySelector('[data-page-access-summary]');
    if (summary) summary.textContent = pageAccessSummaryText(state.formMemberSnapshot);
  }

  function pageAccessManagerHTML(field, value) {
    const name = String(field?.name || 'Allowed Pages');
    const label = escapeHTML(name);
    const summary = escapeHTML(pageAccessSummaryText(state.formMemberSnapshot));
    return `
      <div class="ua-form-field ua-form-field--wide ua-page-access-field">
        <span>${label}</span>
        <div class="ua-page-access-card">
          <div>
            <strong>Supabase page access</strong>
            <small data-page-access-summary>${summary}</small>
          </div>
          <button type="button" class="ua-page-access-open" data-page-access-open>
            <i data-feather="shield"></i>
            <span>Manage Access</span>
          </button>
        </div>
      </div>
    `;
  }

  function svAccessSummaryText(member = null) {
    const memberId = String(member?.id || state.formMemberId || '').trim();
    let count = 0;
    if (memberId && state.svAccessCache.has(memberId)) {
      count = normalizeSvAccessRows(state.svAccessCache.get(memberId)).filter((row) => row.isEnabled).length;
    } else if (member?.svAccessSummary) {
      count = Number(member.svAccessSummary.enabledCount || member.svAccessSummary.accessCount || 0);
    } else {
      const fallback = splitCsvValues(fieldValueFromMember(member, 'S.V Schools'));
      count = fallback.length;
    }
    if (!memberId && state.formMode === 'create') return 'Create the member first, then enable visible team members for Orders Review.';
    if (!count) return 'No team members enabled yet. Orders Review will not show orders for this user.';
    return `${count} visible team member${count === 1 ? '' : 's'} for Orders Review`;
  }

  function updateSvAccessSummaryText() {
    const summary = els.formBody?.querySelector('[data-sv-access-summary]');
    if (summary) summary.textContent = svAccessSummaryText(state.formMemberSnapshot);
  }

  function svAccessManagerHTML(field, value) {
    const name = String(field?.name || 'S.V Schools');
    const label = escapeHTML(name);
    const summary = escapeHTML(svAccessSummaryText(state.formMemberSnapshot));
    const disabled = state.formMode === 'create' ? 'disabled aria-disabled="true" title="Create the member first, then configure visible team members."' : '';
    return `
      <div class="ua-form-field ua-form-field--wide ua-sv-access-field">
        <span>${label}</span>
        <div class="ua-page-access-card ua-sv-access-card">
          <div>
            <strong>Orders Review visibility</strong>
            <small data-sv-access-summary>${summary}</small>
          </div>
          <button type="button" class="ua-page-access-open" data-sv-access-open ${disabled}>
            <i data-feather="users"></i>
            <span>Manage Users</span>
          </button>
        </div>
      </div>
    `;
  }

  function normalizeSvAccessRows(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        memberId: String(row?.memberId || row?.member_id || row?.visibleTeamMemberId || row?.visible_team_member_id || row?.id || '').trim(),
        name: String(row?.name || row?.memberName || row?.member_name || row?.visibleTeamMemberName || row?.visible_team_member_name || 'User').trim() || 'User',
        department: String(row?.department || '').trim(),
        position: String(row?.position || '').trim(),
        email: String(row?.email || '').trim(),
        photoUrl: String(row?.photoUrl || row?.photo_url || '').trim(),
        isEnabled: !!(row?.isEnabled ?? row?.is_enabled ?? row?.enabled),
      }))
      .filter((row) => row.memberId)
      .sort((a, b) => (Number(b.isEnabled) - Number(a.isEnabled)) || a.name.localeCompare(b.name));
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

    if (isAllowedPagesField(field) || type === 'ua_page_access_manager') return pageAccessManagerHTML(field, value);
    if (isSvSchoolsField(field) || type === 'ua_sv_access_manager') return svAccessManagerHTML(field, value);
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
    state.formMemberSnapshot = mode === 'edit' ? member : null;
    if (mode === 'create') state.pageAccessDraft = [];

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
    state.formMemberSnapshot = null;
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

      if (mode === 'create' && Array.isArray(state.pageAccessDraft) && state.pageAccessDraft.length && data?.member?.id) {
        await savePageAccessForMember(String(data.member.id), state.pageAccessDraft);
        state.pageAccessDraft = [];
      }

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

  function openDepartmentModal(mode, department = null) {
    if (!els.departmentModal || !els.departmentNameInput) return;
    state.departmentModalMode = mode === 'edit' ? 'edit' : 'create';
    state.departmentTargetId = state.departmentModalMode === 'edit' ? String(department?.id || '') : '';

    const isEdit = state.departmentModalMode === 'edit';
    if (els.departmentTitle) els.departmentTitle.textContent = isEdit ? 'Edit Department' : 'New Department';
    if (els.departmentSubtitle) {
      els.departmentSubtitle.textContent = isEdit
        ? 'Rename this department for all assigned team members.'
        : 'Create an empty department folder, then assign members to it later.';
    }
    if (els.departmentSaveLabel) els.departmentSaveLabel.textContent = isEdit ? 'Save Department' : 'Create Department';
    if (els.departmentError) els.departmentError.textContent = '';
    els.departmentNameInput.value = isEdit ? departmentName(department) : '';
    els.departmentModal.hidden = false;
    els.departmentModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ua-modal-open');
    hydrateIcons(els.departmentModal);
    setTimeout(() => els.departmentNameInput?.focus(), 50);
  }

  function closeDepartmentModal() {
    if (!els.departmentModal) return;
    els.departmentModal.hidden = true;
    els.departmentModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ua-modal-open');
    state.departmentModalMode = 'create';
    state.departmentTargetId = '';
    if (els.departmentNameInput) els.departmentNameInput.value = '';
    if (els.departmentError) els.departmentError.textContent = '';
  }

  function setDepartmentSaving(saving) {
    if (els.departmentSaveBtn) {
      els.departmentSaveBtn.disabled = !!saving;
      els.departmentSaveBtn.classList.toggle('is-loading', !!saving);
    }
    if (els.departmentCancelBtn) els.departmentCancelBtn.disabled = !!saving;
    if (els.departmentNameInput) els.departmentNameInput.disabled = !!saving;
  }

  async function submitDepartmentForm(event) {
    event?.preventDefault?.();
    const name = String(els.departmentNameInput?.value || '').replace(/\s+/g, ' ').trim();
    if (!name) {
      if (els.departmentError) els.departmentError.textContent = 'Department name is required.';
      return;
    }

    const isEdit = state.departmentModalMode === 'edit';
    const targetId = String(state.departmentTargetId || '').trim();
    if (isEdit && !targetId) {
      if (els.departmentError) els.departmentError.textContent = 'Select a department first.';
      return;
    }

    setDepartmentSaving(true);
    if (els.departmentError) els.departmentError.textContent = '';
    try {
      const endpoint = isEdit
        ? `/api/user-access/departments/${encodeURIComponent(targetId)}`
        : '/api/user-access/departments';
      const res = await fetch(endpoint, {
        method: isEdit ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to save department.');

      const newDepartmentId = String(data?.department?.id || data?.departmentId || '').trim();
      closeDepartmentModal();
      await loadMembers({ force: true, keepDepartment: true });
      if (newDepartmentId && state.departments.some((d) => String(d.id || '') === newDepartmentId)) {
        navigateToDepartment(newDepartmentId);
      }
      toast('success', isEdit ? 'Department updated' : 'Department added', data?.message || `${name} was saved.`);
    } catch (error) {
      if (els.departmentError) els.departmentError.textContent = error?.message || 'Failed to save department.';
      toast('error', 'Department save failed', error?.message || 'Failed to save department.');
    } finally {
      setDepartmentSaving(false);
    }
  }



  function cssEscapeValue(value) {
    const raw = String(value || '');
    try {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(raw);
    } catch {}
    return raw.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
  }

  function closeMemberMenus(exceptMemberId = '') {
    if (!els.membersGrid) return;
    const keep = String(exceptMemberId || '');
    els.membersGrid.querySelectorAll('[data-member-menu]').forEach((menu) => {
      if (keep && menu.getAttribute('data-member-menu') === keep) return;
      menu.hidden = true;
    });
    els.membersGrid.querySelectorAll('.ua-member-menu-btn[aria-expanded="true"]').forEach((btn) => {
      if (keep && btn.getAttribute('data-member-id') === keep) return;
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  function toggleMemberMenu(memberId) {
    const id = String(memberId || '').trim();
    if (!id || !els.membersGrid) return;
    const menu = els.membersGrid.querySelector(`[data-member-menu="${cssEscapeValue(id)}"]`);
    const btn = els.membersGrid.querySelector(`.ua-member-menu-btn[data-member-id="${cssEscapeValue(id)}"]`);
    if (!menu) return;
    const willOpen = !!menu.hidden;
    closeMemberMenus(id);
    menu.hidden = !willOpen;
    if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    hydrateIcons(menu);
  }

  function departmentOptionsForMove(member = null) {
    const currentKey = _safeDepartmentKey(member?.department || activeDepartment()?.name || '');
    const departments = (state.departments || []).slice().sort((a, b) => departmentName(a).localeCompare(departmentName(b)));
    return departments.map((department) => {
      const id = String(department.id || '');
      const name = departmentName(department);
      const selected = id === currentKey ? 'selected' : '';
      return `<option value="${escapeHTML(id)}" ${selected}>${escapeHTML(name)}</option>`;
    }).join('');
  }

  function _safeDepartmentKey(name) {
    const clean = String(name || 'No Department').trim() || 'No Department';
    return clean.toLowerCase().replace(/[^a-z0-9]+/g, '').trim() || 'nodepartment';
  }

  function openMoveMemberModal(member) {
    if (!els.moveMemberModal || !els.moveDepartmentSelect || !member) return;
    state.moveMemberId = String(member.id || '').trim();
    if (els.moveMemberSubtitle) {
      els.moveMemberSubtitle.textContent = `Move ${member.name || 'this user'} to another department.`;
    }
    if (els.moveMemberError) els.moveMemberError.textContent = '';
    els.moveDepartmentSelect.innerHTML = departmentOptionsForMove(member);
    els.moveMemberModal.hidden = false;
    els.moveMemberModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ua-modal-open');
    hydrateIcons(els.moveMemberModal);
    setTimeout(() => els.moveDepartmentSelect?.focus(), 50);
  }

  function closeMoveMemberModal() {
    if (!els.moveMemberModal) return;
    els.moveMemberModal.hidden = true;
    els.moveMemberModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ua-modal-open');
    state.moveMemberId = '';
    if (els.moveMemberError) els.moveMemberError.textContent = '';
  }

  function setMoveSaving(saving) {
    if (els.moveMemberSaveBtn) {
      els.moveMemberSaveBtn.disabled = !!saving;
      els.moveMemberSaveBtn.classList.toggle('is-loading', !!saving);
    }
    if (els.moveMemberCancelBtn) els.moveMemberCancelBtn.disabled = !!saving;
    if (els.moveDepartmentSelect) els.moveDepartmentSelect.disabled = !!saving;
  }

  async function submitMoveMemberForm(event) {
    event?.preventDefault?.();
    const memberId = String(state.moveMemberId || '').trim();
    const departmentId = String(els.moveDepartmentSelect?.value || '').trim();
    if (!memberId || !departmentId) {
      if (els.moveMemberError) els.moveMemberError.textContent = 'Please select a target department.';
      return;
    }

    const member = state.membersById.get(memberId);
    const target = departmentById(departmentId);
    if (member && target && _safeDepartmentKey(member.department) === String(target.id || '')) {
      if (els.moveMemberError) els.moveMemberError.textContent = 'This user is already inside this department.';
      return;
    }

    setMoveSaving(true);
    if (els.moveMemberError) els.moveMemberError.textContent = '';
    try {
      const res = await fetch(`/api/user-access/team-members/${encodeURIComponent(memberId)}/department`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to move member.');
      closeMoveMemberModal();
      await loadMembers({ force: true, keepDepartment: false });
      if (departmentId) navigateToDepartment(departmentId);
      toast('success', 'Member moved', data?.message || 'Team member moved successfully.');
    } catch (error) {
      if (els.moveMemberError) els.moveMemberError.textContent = error?.message || 'Failed to move member.';
      toast('error', 'Move failed', error?.message || 'Failed to move member.');
    } finally {
      setMoveSaving(false);
    }
  }

  async function deleteMember(memberId) {
    const id = String(memberId || '').trim();
    const member = state.membersById.get(id);
    if (!id || !member) return;
    const ok = window.confirm(`Delete ${member.name || 'this user'} permanently from Team Members?`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/user-access/team-members/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to delete member.');
      await loadMembers({ force: true, keepDepartment: true });
      toast('success', 'Member deleted', data?.message || 'Team member deleted.');
    } catch (error) {
      toast('error', 'Delete failed', error?.message || 'Failed to delete member.');
    }
  }

  async function deleteDepartment(departmentId) {
    const department = departmentById(departmentId);
    if (!department || !canEditDepartment(department)) return;
    const count = Number(department.count || 0);
    const message = count
      ? `Delete ${departmentName(department)} department? ${count} user${count === 1 ? '' : 's'} will be moved to No Department.`
      : `Delete ${departmentName(department)} department?`;
    if (!window.confirm(message)) return;
    try {
      const res = await fetch(`/api/user-access/departments/${encodeURIComponent(department.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to delete department.');
      backToDepartments(false);
      await loadMembers({ force: true, keepDepartment: false });
      toast('success', 'Department deleted', data?.message || 'Department deleted.');
    } catch (error) {
      toast('error', 'Delete failed', error?.message || 'Failed to delete department.');
    }
  }

  function openPasswordModal(memberId, action = 'edit') {
    if (!els.passwordModal) return;
    const allowedActions = new Set(['edit', 'create', 'move', 'delete-member', 'delete-department']);
    state.pendingEditMemberId = String(memberId || '');
    state.pendingPasswordAction = allowedActions.has(action) ? action : 'edit';
    if (els.passwordInput) els.passwordInput.value = '';
    if (els.passwordError) els.passwordError.textContent = '';
    try {
      const title = document.getElementById('uaAdminPasswordTitle');
      const subtitle = els.passwordModal.querySelector('.ua-modal__header p');
      if (title) title.textContent = 'Admin Verification';
      const copy = {
        create: 'Enter the Admin user password to add a new member.',
        edit: 'Enter the Admin user password to open the edit page.',
        move: 'Enter the Admin user password to move this member.',
        'delete-member': 'Enter the Admin user password to delete this member.',
        'delete-department': 'Enter the Admin user password to delete this department.',
      };
      if (subtitle) subtitle.textContent = copy[state.pendingPasswordAction] || copy.edit;
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
      const targetId = state.pendingEditMemberId;
      const member = state.membersById.get(targetId);
      closePasswordModal();
      if (action === 'create') {
        openFormModal('create');
      } else if (action === 'edit' && member) {
        openFormModal('edit', member);
      } else if (action === 'move' && member) {
        openMoveMemberModal(member);
      } else if (action === 'delete-member') {
        await deleteMember(targetId);
      } else if (action === 'delete-department') {
        await deleteDepartment(targetId);
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

  function ensurePageAccessModal() {
    if (els.pageAccessModal) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'ua-modal-overlay';
    wrapper.id = 'uaPageAccessModal';
    wrapper.hidden = true;
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.innerHTML = `
      <form class="ua-modal ua-modal--page-access" id="uaPageAccessForm" role="dialog" aria-modal="true" aria-labelledby="uaPageAccessTitle">
        <button type="button" class="ua-modal__close" id="uaPageAccessClose" aria-label="Close page access window">
          <i data-feather="x"></i>
        </button>
        <div class="ua-modal__header ua-modal__header--compact">
          <div class="ua-modal__avatar ua-modal__avatar--icon"><i data-feather="shield"></i></div>
          <div>
            <h2 id="uaPageAccessTitle">Page Access</h2>
            <p id="uaPageAccessSubtitle">Set page permissions for this team member.</p>
          </div>
        </div>
        <div class="ua-modal__body ua-page-access-body">
          <div class="ua-page-access-head">
            <div>Page name</div>
            <div>Access type</div>
            <div>Enable</div>
          </div>
          <div class="ua-page-access-list" id="uaPageAccessList"></div>
        </div>
        <div class="ua-modal__actions">
          <button type="button" class="ua-btn ua-btn--light" id="uaPageAccessCancel">Cancel</button>
          <button type="submit" class="ua-btn ua-btn--dark" id="uaPageAccessSave">
            <i data-feather="save"></i>
            <span>Save Access</span>
          </button>
        </div>
      </form>
    `;
    document.body.appendChild(wrapper);

    els.pageAccessModal = wrapper;
    els.pageAccessForm = wrapper.querySelector('#uaPageAccessForm');
    els.pageAccessList = wrapper.querySelector('#uaPageAccessList');
    els.pageAccessTitle = wrapper.querySelector('#uaPageAccessTitle');
    els.pageAccessSubtitle = wrapper.querySelector('#uaPageAccessSubtitle');
    els.pageAccessSaveBtn = wrapper.querySelector('#uaPageAccessSave');
    els.pageAccessCancelBtn = wrapper.querySelector('#uaPageAccessCancel');
    els.pageAccessClose = wrapper.querySelector('#uaPageAccessClose');

    els.pageAccessForm?.addEventListener('submit', submitPageAccessForm);
    els.pageAccessCancelBtn?.addEventListener('click', closePageAccessModal);
    els.pageAccessClose?.addEventListener('click', closePageAccessModal);
    els.pageAccessModal?.addEventListener('click', (event) => {
      if (event.target === els.pageAccessModal) closePageAccessModal();
    });
    els.pageAccessList?.addEventListener('change', (event) => {
      const row = event.target.closest('.ua-page-access-row');
      if (!row) return;
      const enabled = row.querySelector('[data-pa-enabled]')?.checked;
      row.classList.toggle('is-disabled', !enabled);
    });
    hydrateIcons(wrapper);
  }

  function setPageAccessSaving(saving) {
    state.pageAccessSaving = saving;
    if (els.pageAccessSaveBtn) {
      els.pageAccessSaveBtn.disabled = saving || state.pageAccessModalLoading;
      els.pageAccessSaveBtn.classList.toggle('is-loading', saving);
    }
    if (els.pageAccessCancelBtn) els.pageAccessCancelBtn.disabled = saving;
  }

  function renderPageAccessList() {
    if (!els.pageAccessList) return;
    if (state.pageAccessModalLoading) {
      els.pageAccessList.innerHTML = '<div class="ua-page-access-loading"><span></span> Loading pages from Supabase...</div>';
      if (els.pageAccessSaveBtn) els.pageAccessSaveBtn.disabled = true;
      return;
    }
    if (els.pageAccessSaveBtn) els.pageAccessSaveBtn.disabled = state.pageAccessSaving;
    const rows = normalizeAccessRows(state.pageAccessModalRows);
    state.pageAccessModalRows = rows;
    if (!rows.length) {
      els.pageAccessList.innerHTML = '<div class="ua-empty">No pages were found in the Supabase app_pages table.</div>';
      return;
    }
    els.pageAccessList.innerHTML = rows.map((row) => {
      const enabled = !!row.isEnabled;
      const userSelected = row.accessLevel === 'admin' ? '' : 'selected';
      const adminSelected = row.accessLevel === 'admin' ? 'selected' : '';
      return `
        <div class="ua-page-access-row ${enabled ? '' : 'is-disabled'}" data-page-id="${escapeHTML(row.pageId)}" data-page-key="${escapeHTML(row.pageKey)}">
          <div class="ua-page-access-name">
            <strong>${escapeHTML(row.pageName)}</strong>
            <small>${escapeHTML(row.moduleName)}${row.routePath ? ` • ${escapeHTML(row.routePath)}` : ''}</small>
          </div>
          <div>
            <select data-pa-level aria-label="Access type for ${escapeHTML(row.pageName)}">
              <option value="user" ${userSelected}>User</option>
              <option value="admin" ${adminSelected}>Admin</option>
            </select>
          </div>
          <div class="ua-page-access-enable">
            <label class="ua-switch" title="Enable ${escapeHTML(row.pageName)}">
              <input type="checkbox" data-pa-enabled ${enabled ? 'checked' : ''}>
              <span></span>
            </label>
          </div>
        </div>
      `;
    }).join('');
  }

  async function loadPageAccessRowsForCurrentForm() {
    const memberId = String(state.formMemberId || '').trim();
    if (state.formMode === 'create') {
      if (state.pageAccessDraft.length) return normalizeAccessRows(state.pageAccessDraft);
      const res = await fetch('/api/user-access/pages', { credentials: 'same-origin', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load pages.');
      return normalizeAccessRows((data.pages || []).map((page) => ({ ...page, accessLevel: 'user', isEnabled: false })));
    }
    if (!memberId) throw new Error('Missing team member ID.');
    if (state.pageAccessCache.has(memberId)) return normalizeAccessRows(state.pageAccessCache.get(memberId));
    const res = await fetch(`/api/user-access/team-members/${encodeURIComponent(memberId)}/page-access`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load page access.');
    const rows = normalizeAccessRows(data.pages || []);
    state.pageAccessCache.set(memberId, rows);
    const member = state.membersById.get(memberId);
    if (member && data.summary) member.pageAccessSummary = { accessCount: data.summary.accessCount || 0, adminCount: data.summary.adminCount || 0 };
    return rows;
  }

  async function openPageAccessModal() {
    ensurePageAccessModal();
    state.pageAccessModalMemberId = String(state.formMemberId || '').trim();
    state.pageAccessModalLoading = true;
    state.pageAccessModalRows = [];
    if (els.pageAccessTitle) els.pageAccessTitle.textContent = 'Page Access';
    if (els.pageAccessSubtitle) {
      const memberName = state.formMode === 'create' ? 'new team member' : (state.formMemberSnapshot?.name || 'this team member');
      els.pageAccessSubtitle.textContent = `Configure page access for ${memberName}.`;
    }
    els.pageAccessModal.hidden = false;
    els.pageAccessModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ua-modal-open');
    renderPageAccessList();
    try {
      state.pageAccessModalRows = await loadPageAccessRowsForCurrentForm();
    } catch (error) {
      console.error(error);
      toast('error', 'Load failed', error?.message || 'Failed to load page access.');
      if (els.pageAccessList) els.pageAccessList.innerHTML = `<div class="ua-error">${escapeHTML(error?.message || 'Failed to load page access.')}</div>`;
    } finally {
      state.pageAccessModalLoading = false;
      renderPageAccessList();
      hydrateIcons(els.pageAccessModal);
    }
  }

  function closePageAccessModal() {
    if (!els.pageAccessModal) return;
    els.pageAccessModal.hidden = true;
    els.pageAccessModal.setAttribute('aria-hidden', 'true');
    if (!els.formModal || els.formModal.hidden) document.body.classList.remove('ua-modal-open');
    state.pageAccessModalRows = [];
    state.pageAccessModalMemberId = '';
  }

  function collectPageAccessRowsFromModal() {
    if (!els.pageAccessList) return [];
    return Array.from(els.pageAccessList.querySelectorAll('.ua-page-access-row')).map((row) => ({
      pageId: String(row.getAttribute('data-page-id') || '').trim(),
      pageKey: String(row.getAttribute('data-page-key') || '').trim(),
      pageName: String(row.querySelector('.ua-page-access-name strong')?.textContent || '').trim(),
      accessLevel: row.querySelector('[data-pa-level]')?.value === 'admin' ? 'admin' : 'user',
      isEnabled: !!row.querySelector('[data-pa-enabled]')?.checked,
    }));
  }

  async function savePageAccessForMember(memberId, rows) {
    const res = await fetch(`/api/user-access/team-members/${encodeURIComponent(memberId)}/page-access`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: rows }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to save page access.');
    const normalized = normalizeAccessRows(data.pages || rows);
    state.pageAccessCache.set(String(memberId), normalized);
    const member = state.membersById.get(String(memberId));
    if (member) {
      member.pageAccessSummary = data.summary || pageAccessSummaryFromRows(normalized);
      state.formMemberSnapshot = member;
    }
    return { data, rows: normalized };
  }

  async function submitPageAccessForm(event) {
    event?.preventDefault?.();
    if (state.pageAccessSaving || state.pageAccessModalLoading) return;
    const rows = collectPageAccessRowsFromModal();
    setPageAccessSaving(true);
    try {
      if (state.formMode === 'create') {
        state.pageAccessDraft = normalizeAccessRows(rows);
        updatePageAccessSummaryText();
        closePageAccessModal();
        toast('success', 'Access prepared', 'Page access will be saved after creating the member.');
        return;
      }
      const memberId = String(state.formMemberId || '').trim();
      if (!memberId) throw new Error('Missing team member ID.');
      await savePageAccessForMember(memberId, rows);
      updatePageAccessSummaryText();
      closePageAccessModal();
      toast('success', 'Access updated', 'Page permissions were saved.');
    } catch (error) {
      console.error(error);
      toast('error', 'Save failed', error?.message || 'Failed to save page access.');
    } finally {
      setPageAccessSaving(false);
    }
  }

  function ensureSvAccessModal() {
    if (els.svAccessModal) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'ua-modal-overlay';
    wrapper.id = 'uaSvAccessModal';
    wrapper.hidden = true;
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.innerHTML = `
      <form class="ua-modal ua-modal--sv-access" id="uaSvAccessForm" role="dialog" aria-modal="true" aria-labelledby="uaSvAccessTitle">
        <button type="button" class="ua-modal__close" id="uaSvAccessClose" aria-label="Close S.V Schools window">
          <i data-feather="x"></i>
        </button>
        <div class="ua-modal__header ua-modal__header--compact">
          <div class="ua-modal__avatar ua-modal__avatar--icon"><i data-feather="users"></i></div>
          <div>
            <h2 id="uaSvAccessTitle">S.V Schools</h2>
            <p id="uaSvAccessSubtitle">Enable the team members whose orders should appear in Orders Review.</p>
          </div>
        </div>
        <div class="ua-modal__body ua-sv-access-body">
          <div class="ua-sv-access-tools">
            <div class="ua-sv-search">
              <i data-feather="search"></i>
              <input type="search" id="uaSvAccessSearch" placeholder="Search team members..." autocomplete="off">
            </div>
            <button type="button" class="ua-mini-btn" id="uaSvAccessSelectAll">Enable all visible</button>
          </div>
          <div class="ua-sv-access-list" id="uaSvAccessList"></div>
        </div>
        <div class="ua-modal__actions">
          <button type="button" class="ua-btn ua-btn--light" id="uaSvAccessCancel">Cancel</button>
          <button type="submit" class="ua-btn ua-btn--dark" id="uaSvAccessSave">
            <i data-feather="save"></i>
            <span>Save Users</span>
          </button>
        </div>
      </form>
    `;
    document.body.appendChild(wrapper);

    els.svAccessModal = wrapper;
    els.svAccessForm = wrapper.querySelector('#uaSvAccessForm');
    els.svAccessList = wrapper.querySelector('#uaSvAccessList');
    els.svAccessTitle = wrapper.querySelector('#uaSvAccessTitle');
    els.svAccessSubtitle = wrapper.querySelector('#uaSvAccessSubtitle');
    els.svAccessSearch = wrapper.querySelector('#uaSvAccessSearch');
    els.svAccessSaveBtn = wrapper.querySelector('#uaSvAccessSave');
    els.svAccessCancelBtn = wrapper.querySelector('#uaSvAccessCancel');
    els.svAccessClose = wrapper.querySelector('#uaSvAccessClose');
    els.svAccessSelectAll = wrapper.querySelector('#uaSvAccessSelectAll');

    els.svAccessForm?.addEventListener('submit', submitSvAccessForm);
    els.svAccessCancelBtn?.addEventListener('click', closeSvAccessModal);
    els.svAccessClose?.addEventListener('click', closeSvAccessModal);
    els.svAccessModal?.addEventListener('click', (event) => {
      if (event.target === els.svAccessModal) closeSvAccessModal();
    });
    els.svAccessSearch?.addEventListener('input', renderSvAccessList);
    els.svAccessSelectAll?.addEventListener('click', () => {
      const q = normalizeText(els.svAccessSearch?.value || '');
      state.svAccessModalRows = normalizeSvAccessRows(state.svAccessModalRows).map((row) => {
        const haystack = `${row.name} ${row.department} ${row.position} ${row.email}`.toLowerCase();
        return !q || haystack.includes(q) ? { ...row, isEnabled: true } : row;
      });
      renderSvAccessList();
    });
    els.svAccessList?.addEventListener('change', (event) => {
      const input = event.target.closest('[data-sv-enabled][data-member-id]');
      if (!input) return;
      const id = input.getAttribute('data-member-id') || '';
      state.svAccessModalRows = normalizeSvAccessRows(state.svAccessModalRows).map((row) => (row.memberId === id ? { ...row, isEnabled: !!input.checked } : row));
      const rowEl = input.closest('.ua-sv-access-row');
      if (rowEl) rowEl.classList.toggle('is-enabled', !!input.checked);
    });
    hydrateIcons(wrapper);
  }

  function setSvAccessSaving(saving) {
    state.svAccessSaving = saving;
    if (els.svAccessSaveBtn) {
      els.svAccessSaveBtn.disabled = saving || state.svAccessModalLoading;
      els.svAccessSaveBtn.classList.toggle('is-loading', saving);
    }
    if (els.svAccessCancelBtn) els.svAccessCancelBtn.disabled = saving;
  }

  function renderSvAccessList() {
    if (!els.svAccessList) return;
    if (state.svAccessModalLoading) {
      els.svAccessList.innerHTML = '<div class="ua-page-access-loading"><span></span> Loading team members...</div>';
      if (els.svAccessSaveBtn) els.svAccessSaveBtn.disabled = true;
      return;
    }
    if (els.svAccessSaveBtn) els.svAccessSaveBtn.disabled = state.svAccessSaving;
    const rows = normalizeSvAccessRows(state.svAccessModalRows);
    state.svAccessModalRows = rows;
    const q = normalizeText(els.svAccessSearch?.value || '');
    const filtered = q
      ? rows.filter((row) => `${row.name} ${row.department} ${row.position} ${row.email}`.toLowerCase().includes(q))
      : rows;
    if (!filtered.length) {
      els.svAccessList.innerHTML = '<div class="ua-empty">No team members found.</div>';
      return;
    }
    els.svAccessList.innerHTML = filtered.map((row) => `
      <div class="ua-sv-access-row ${row.isEnabled ? 'is-enabled' : ''}" data-member-id="${escapeHTML(row.memberId)}">
        <div class="ua-sv-access-person">
          <div class="ua-avatar ua-avatar--small">${row.photoUrl ? `<img src="${escapeHTML(row.photoUrl)}" alt="${escapeHTML(row.name)}" loading="lazy">` : escapeHTML(initials(row.name))}</div>
          <div>
            <strong>${escapeHTML(row.name)}</strong>
            <small>${escapeHTML([row.department, row.position].filter(Boolean).join(' • ') || row.email || 'Team member')}</small>
          </div>
        </div>
        <label class="ua-switch" title="Enable ${escapeHTML(row.name)}">
          <input type="checkbox" data-sv-enabled data-member-id="${escapeHTML(row.memberId)}" ${row.isEnabled ? 'checked' : ''}>
          <span></span>
        </label>
      </div>
    `).join('');
  }

  async function loadSvAccessRowsForCurrentForm() {
    const memberId = String(state.formMemberId || '').trim();
    if (!memberId) throw new Error('Create the team member first, then configure S.V Schools.');
    if (state.svAccessCache.has(memberId)) return normalizeSvAccessRows(state.svAccessCache.get(memberId));
    const res = await fetch(`/api/user-access/team-members/${encodeURIComponent(memberId)}/sv-access`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load S.V Schools.');
    const rows = normalizeSvAccessRows(data.members || data.rows || []);
    state.svAccessCache.set(memberId, rows);
    const member = state.membersById.get(memberId);
    if (member && data.summary) member.svAccessSummary = data.summary;
    return rows;
  }

  async function openSvAccessModal() {
    ensureSvAccessModal();
    const memberId = String(state.formMemberId || '').trim();
    if (!memberId) return toast('warning', 'Save first', 'Create the team member first, then configure S.V Schools.');
    state.svAccessModalMemberId = memberId;
    state.svAccessModalLoading = true;
    state.svAccessModalRows = [];
    if (els.svAccessSearch) els.svAccessSearch.value = '';
    if (els.svAccessTitle) els.svAccessTitle.textContent = 'S.V Schools';
    if (els.svAccessSubtitle) {
      els.svAccessSubtitle.textContent = `Enable team members whose orders should be visible to ${state.formMemberSnapshot?.name || 'this user'} in Orders Review.`;
    }
    els.svAccessModal.hidden = false;
    els.svAccessModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ua-modal-open');
    renderSvAccessList();
    try {
      state.svAccessModalRows = await loadSvAccessRowsForCurrentForm();
    } catch (error) {
      console.error(error);
      toast('error', 'Load failed', error?.message || 'Failed to load S.V Schools.');
      if (els.svAccessList) els.svAccessList.innerHTML = `<div class="ua-error">${escapeHTML(error?.message || 'Failed to load S.V Schools.')}</div>`;
    } finally {
      state.svAccessModalLoading = false;
      renderSvAccessList();
      hydrateIcons(els.svAccessModal);
      setTimeout(() => els.svAccessSearch?.focus(), 60);
    }
  }

  function closeSvAccessModal() {
    if (!els.svAccessModal) return;
    els.svAccessModal.hidden = true;
    els.svAccessModal.setAttribute('aria-hidden', 'true');
    if (!els.formModal || els.formModal.hidden) document.body.classList.remove('ua-modal-open');
    state.svAccessModalRows = [];
    state.svAccessModalMemberId = '';
  }

  function collectSvAccessRowsFromModal() {
    return normalizeSvAccessRows(state.svAccessModalRows);
  }

  async function saveSvAccessForMember(memberId, rows) {
    const enabled = normalizeSvAccessRows(rows).filter((row) => row.isEnabled);
    const res = await fetch(`/api/user-access/team-members/${encodeURIComponent(memberId)}/sv-access`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: enabled }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to save S.V Schools.');
    const normalized = normalizeSvAccessRows(data.members || rows);
    state.svAccessCache.set(String(memberId), normalized);
    const member = state.membersById.get(String(memberId));
    if (member) {
      member.svAccessSummary = data.summary || { enabledCount: normalized.filter((row) => row.isEnabled).length };
      state.formMemberSnapshot = member;
    }
    return { data, rows: normalized };
  }

  async function submitSvAccessForm(event) {
    event?.preventDefault?.();
    if (state.svAccessSaving || state.svAccessModalLoading) return;
    const memberId = String(state.formMemberId || '').trim();
    if (!memberId) return;
    setSvAccessSaving(true);
    try {
      await saveSvAccessForMember(memberId, collectSvAccessRowsFromModal());
      updateSvAccessSummaryText();
      closeSvAccessModal();
      toast('success', 'S.V Schools updated', 'Orders Review visibility was saved.');
      await loadMembers({ force: true, keepDepartment: true });
    } catch (error) {
      console.error(error);
      toast('error', 'Save failed', error?.message || 'Failed to save S.V Schools.');
    } finally {
      setSvAccessSaving(false);
    }
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
    const pageAccessOpen = event.target.closest('[data-page-access-open]');
    if (pageAccessOpen) return openPageAccessModal();

    const svAccessOpen = event.target.closest('[data-sv-access-open]');
    if (svAccessOpen && !svAccessOpen.disabled) return openSvAccessModal();

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
      const editBtn = event.target.closest('[data-action="edit-department"][data-dept-id]');
      if (editBtn) {
        event.preventDefault();
        event.stopPropagation();
        if (editBtn.disabled) return;
        const department = departmentById(editBtn.getAttribute('data-dept-id') || '');
        if (department && canEditDepartment(department)) openDepartmentModal('edit', department);
        return;
      }
      const deleteBtn = event.target.closest('[data-action="delete-department"][data-dept-id]');
      if (deleteBtn) {
        event.preventDefault();
        event.stopPropagation();
        if (deleteBtn.disabled) return;
        const department = departmentById(deleteBtn.getAttribute('data-dept-id') || '');
        if (department && canEditDepartment(department)) openPasswordModal(department.id, 'delete-department');
        return;
      }
      const card = event.target.closest('.ua-folder[data-dept-id]');
      if (!card) return;
      navigateToDepartment(card.getAttribute('data-dept-id') || '');
    });

    els.folders?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = event.target.closest('.ua-folder[data-dept-id]');
      if (!card || event.target.closest('button')) return;
      event.preventDefault();
      navigateToDepartment(card.getAttribute('data-dept-id') || '');
    });

    els.membersGrid?.addEventListener('click', (event) => {
      const actionBtn = event.target.closest('[data-action][data-member-id]');
      if (!actionBtn) return;
      event.stopPropagation();
      const id = String(actionBtn.getAttribute('data-member-id') || '');
      const action = String(actionBtn.getAttribute('data-action') || '');
      if (!id) return;
      if (action === 'toggle-member-menu') return toggleMemberMenu(id);
      closeMemberMenus();
      if (action === 'edit') openPasswordModal(id);
      if (action === 'message') handleMessage(id);
      if (action === 'move-member') openPasswordModal(id, 'move');
      if (action === 'delete-member') openPasswordModal(id, 'delete-member');
    });

    els.searchInput?.addEventListener('input', () => {
      state.search = els.searchInput.value || '';
      render();
    });

    els.refreshBtn?.addEventListener('click', () => loadMembers({ force: true, keepDepartment: true }));
    els.backBtn?.addEventListener('click', () => backToDepartments());
    els.addMemberBtn?.addEventListener('click', () => openPasswordModal('', 'create'));
    els.addDepartmentBtn?.addEventListener('click', () => openDepartmentModal('create'));
    els.departmentForm?.addEventListener('submit', submitDepartmentForm);
    els.departmentCancelBtn?.addEventListener('click', closeDepartmentModal);
    els.departmentClose?.addEventListener('click', closeDepartmentModal);
    els.departmentModal?.addEventListener('click', (event) => {
      if (event.target === els.departmentModal) closeDepartmentModal();
    });

    els.moveMemberForm?.addEventListener('submit', submitMoveMemberForm);
    els.moveMemberCancelBtn?.addEventListener('click', closeMoveMemberModal);
    els.moveMemberClose?.addEventListener('click', closeMoveMemberModal);
    els.moveMemberModal?.addEventListener('click', (event) => {
      if (event.target === els.moveMemberModal) closeMoveMemberModal();
    });

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
      if (els.svAccessModal && !els.svAccessModal.hidden) return closeSvAccessModal();
      if (els.pageAccessModal && !els.pageAccessModal.hidden) return closePageAccessModal();
      if (els.departmentModal && !els.departmentModal.hidden) return closeDepartmentModal();
      if (els.moveMemberModal && !els.moveMemberModal.hidden) return closeMoveMemberModal();
      if (els.passwordModal && !els.passwordModal.hidden) return closePasswordModal();
      if (els.formModal && !els.formModal.hidden) return closeFormModal();
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.ua-member-menu-wrap')) closeMemberMenus();
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
    els.addDepartmentBtn = $('uaAddDepartmentBtn');
    els.editActiveDeptBtn = $('uaEditActiveDepartmentBtn');

    els.departmentModal = $('uaDepartmentModal');
    els.departmentForm = $('uaDepartmentForm');
    els.departmentTitle = $('uaDepartmentTitle');
    els.departmentSubtitle = $('uaDepartmentSubtitle');
    els.departmentNameInput = $('uaDepartmentNameInput');
    els.departmentError = $('uaDepartmentError');
    els.departmentSaveBtn = $('uaDepartmentSave');
    els.departmentSaveLabel = $('uaDepartmentSaveLabel');
    els.departmentCancelBtn = $('uaDepartmentCancel');
    els.departmentClose = $('uaDepartmentClose');

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

    els.moveMemberModal = $('uaMoveMemberModal');
    els.moveMemberForm = $('uaMoveMemberForm');
    els.moveMemberSubtitle = $('uaMoveMemberSubtitle');
    els.moveDepartmentSelect = $('uaMoveDepartmentSelect');
    els.moveMemberError = $('uaMoveMemberError');
    els.moveMemberSaveBtn = $('uaMoveMemberSave');
    els.moveMemberCancelBtn = $('uaMoveMemberCancel');
    els.moveMemberClose = $('uaMoveMemberClose');

    bindEvents();
    loadMembers();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
