(() => {
  'use strict';

  const TYPES = {
    book: { label: 'Book', icon: 'book-open' },
    teacher_guide: { label: 'Teacher Guide', icon: 'book' },
    lesson_plan: { label: 'Lesson Plan', icon: 'clipboard' },
    presentation: { label: 'Presentation', icon: 'monitor' },
    materials: { label: 'Materials', icon: 'video' },
    exam: { label: 'Exam', icon: 'file-text' },
  };
  const MAX_FILE_BYTES = 500 * 1024 * 1024;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  let currentThemeId = '';
  let currentGradeId = '';
  let activeCurriculumGroupId = '';
  let activeCurriculumGroupName = '';
  let activeResourceType = '';
  let currentTheme = null;
  let selectedResourceFile = null;
  let resourceUploadPending = false;
  let activeResourceUpload = null;
  let editingCurriculumGroupId = '';
  let editingThemeId = '';
  let editingGradeId = '';
  let editingResourceId = '';
  let editingResourceItem = null;
  let viewerLoadToken = 0;
  let activePdfDocument = null;
  let activePdfLoadingTask = null;
  let activePdfSpreadStart = 1;
  let activePdfZoom = 1;
  let pdfRenderToken = 0;
  let pdfResizeTimer = 0;
  let pdfZoomTimer = 0;
  let pdfTurnFrame = 0;
  let pdfTurnState = null;
  let pdfTurnPreparing = false;
  let pdfJsPromise = null;
  const pdfPageCache = new Map();
  const PDF_MIN_ZOOM = 0.7;
  const PDF_MAX_ZOOM = 2.2;
  const PDF_ZOOM_STEP = 0.15;
  const PDF_PAGE_CACHE_LIMIT = 8;
  const curriculumGroupItems = new Map();
  const resourceItems = new Map();
  const folderItems = {
    theme: new Map(),
    grade: new Map(),
  };

  function icons() { if (window.feather) window.feather.replace(); }
  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (!value) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }
  function fileExtension(name) {
    const match = String(name || '').trim().match(/\.([a-z0-9]{1,10})$/i);
    return match ? match[1].toUpperCase() : '';
  }
  function resourceFormat(item) {
    const extension = fileExtension(item?.file_name || item?.name);
    if (extension) return extension;
    const mime = String(item?.mime_type || '').split('/').pop() || '';
    return mime && mime !== 'octet-stream' ? mime.toUpperCase().slice(0, 12) : 'FILE';
  }
  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...options });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }
  function showView(name) {
    $('curriculumListView').hidden = name !== 'list';
    $('curriculumThemeView').hidden = name !== 'theme';
    $('curriculumGradeView').hidden = name !== 'grade';
  }
  function emptyFolders(title, text) {
    return `<div class="curriculum-empty"><div><i data-feather="folder"></i><h3>${esc(title)}</h3><p>${esc(text)}</p></div></div>`;
  }
  function closeFolderActionMenus() {
    document.querySelectorAll('.curriculum-folder-card-shell.is-actions-open').forEach((card) => {
      card.classList.remove('is-actions-open');
      card.querySelector('[data-folder-actions-toggle]')?.setAttribute('aria-expanded', 'false');
    });
  }
  function closeCurriculumGroupActionMenus() {
    document.querySelectorAll('.curriculum-catalog-card.is-actions-open').forEach((card) => {
      card.classList.remove('is-actions-open');
      card.querySelector('[data-curriculum-actions-toggle]')?.setAttribute('aria-expanded', 'false');
    });
  }
  function closeResourceActionMenus() {
    document.querySelectorAll('.curriculum-file-card.is-actions-open').forEach((card) => {
      card.classList.remove('is-actions-open');
      card.querySelector('[data-resource-actions-toggle]')?.setAttribute('aria-expanded', 'false');
    });
  }
  function closeActionMenus() {
    closeFolderActionMenus();
    closeCurriculumGroupActionMenus();
    closeResourceActionMenus();
  }
  function folderCard(item, kind) {
    const fallback = kind === 'theme' ? 'Theme folder' : 'Grade folder';
    const name = item.name || (kind === 'theme' ? 'Untitled Theme' : 'Untitled Grade');
    const caption = item.description || fallback;
    return `<div class="curriculum-folder-card-shell" data-folder-kind="${esc(kind)}">
      <button type="button" class="curriculum-folder-card" data-${kind}-id="${esc(item.id)}" aria-label="Open ${esc(name)}">
        <span class="curriculum-folder-card__figure" aria-hidden="true">
          <span class="curriculum-folder-card__paper curriculum-folder-card__paper--left"></span>
          <span class="curriculum-folder-card__paper curriculum-folder-card__paper--middle"></span>
          <span class="curriculum-folder-card__paper curriculum-folder-card__paper--right"></span>
        </span>
        <span class="curriculum-folder-card__name" title="${esc(name)}">${esc(name)}</span>
        <span class="curriculum-folder-card__caption">${esc(caption)}</span>
      </button>
      <div class="curriculum-folder-actions">
        <button type="button" class="curriculum-folder-menu-btn" data-folder-actions-toggle aria-label="Actions for ${esc(name)}" aria-expanded="false">
          <span class="curriculum-folder-card__menu-dots" aria-hidden="true">•••</span>
        </button>
        <div class="curriculum-folder-actions__menu" role="menu">
          <button type="button" data-folder-edit="${esc(item.id)}" data-folder-action-kind="${esc(kind)}" role="menuitem"><i data-feather="edit-3"></i><span>Edit</span></button>
          <button type="button" class="is-danger" data-folder-delete="${esc(item.id)}" data-folder-action-kind="${esc(kind)}" role="menuitem"><i data-feather="trash-2"></i><span>Delete</span></button>
        </div>
      </div>
    </div>`;
  }
  function curriculumGroupCard(group) {
    const themes = Array.isArray(group.themes) ? group.themes : [];
    const themeCount = themes.length;
    return `<article class="curriculum-catalog-card" data-curriculum-group-id="${esc(group.id)}">
      <header class="curriculum-catalog-card__header">
        <div class="curriculum-catalog-card__identity">
          <span class="curriculum-catalog-card__icon"><i data-feather="layers"></i></span>
          <div><h2>${esc(group.name)}</h2><span class="curriculum-catalog-card__count">${themeCount} theme${themeCount === 1 ? '' : 's'}</span></div>
        </div>
        <div class="curriculum-catalog-card__actions">
          <button type="button" class="curriculum-primary-btn curriculum-add-theme-btn" data-add-theme-group-id="${esc(group.id)}" data-add-theme-group-name="${esc(group.name)}"><i data-feather="folder-plus"></i><span>Add New Theme</span></button>
          <div class="curriculum-catalog-actions">
            <button type="button" class="curriculum-catalog-menu-btn" data-curriculum-actions-toggle aria-label="Actions for ${esc(group.name)}" aria-expanded="false"><i data-feather="more-vertical"></i></button>
            <div class="curriculum-catalog-actions__menu" role="menu">
              <button type="button" data-curriculum-edit="${esc(group.id)}" role="menuitem"><i data-feather="edit-3"></i><span>Edit</span></button>
              <button type="button" class="is-danger" data-curriculum-delete="${esc(group.id)}" role="menuitem"><i data-feather="trash-2"></i><span>Delete</span></button>
            </div>
          </div>
        </div>
      </header>
      <div class="curriculum-theme-grid${themes.length ? '' : ' is-empty'}">${themes.length ? themes.map((item) => folderCard(item, 'theme')).join('') : `<div class="curriculum-theme-empty"><i data-feather="folder"></i><div><b>No themes yet</b><span>Use Add New Theme to create the first theme in this curriculum.</span></div></div>`}</div>
    </article>`;
  }
  function bindCurriculumGroupActions(container) {
    container.querySelectorAll('[data-curriculum-actions-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const card = button.closest('.curriculum-catalog-card');
        const willOpen = Boolean(card && !card.classList.contains('is-actions-open'));
        closeActionMenus();
        if (!card) return;
        card.classList.toggle('is-actions-open', willOpen);
        button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
    });
    container.querySelectorAll('[data-curriculum-edit]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const item = curriculumGroupItems.get(String(button.dataset.curriculumEdit || ''));
        closeActionMenus();
        if (item) openCurriculumEditModal(item);
      });
    });
    container.querySelectorAll('[data-curriculum-delete]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeActionMenus();
        deleteCurriculumGroup(button.dataset.curriculumDelete);
      });
    });
  }
  function renderCurriculumGroups(items) {
    const grid = $('curriculumFolderGrid');
    curriculumGroupItems.clear();
    folderItems.theme.clear();
    if (!items.length) {
      grid.innerHTML = emptyFolders('No curricula yet', 'Use Add New Curriculum to create the first curriculum group.');
      icons();
      return;
    }
    items.forEach((group) => {
      curriculumGroupItems.set(String(group.id), group);
      (Array.isArray(group.themes) ? group.themes : []).forEach((theme) => {
        folderItems.theme.set(String(theme.id), { ...theme, curriculumGroupName: group.name || 'Curriculum' });
      });
    });
    grid.innerHTML = items.map(curriculumGroupCard).join('');
    grid.querySelectorAll('[data-add-theme-group-id]').forEach((button) => button.addEventListener('click', () => openThemeModal(button.dataset.addThemeGroupId, button.dataset.addThemeGroupName)));
    bindCurriculumGroupActions(grid);
    bindFolderCards(grid, 'theme', openTheme);
    icons();
  }
  function renderGrades(items) {
    const grid = $('curriculumGradeGrid');
    folderItems.grade.clear();
    grid.classList.toggle('is-empty', !items.length);
    if (!items.length) {
      grid.innerHTML = emptyFolders('No grades yet', 'Use Add New Grade to create the first grade inside this theme.');
      icons();
      return;
    }
    items.forEach((grade) => folderItems.grade.set(String(grade.id), grade));
    grid.innerHTML = items.map((item) => folderCard(item, 'grade')).join('');
    bindFolderCards(grid, 'grade', openGrade);
    icons();
  }

  function bindFolderCards(container, kind, openFolder) {
    container.querySelectorAll(`[data-${kind}-id]`).forEach((item) => item.addEventListener('click', () => openFolder(item.dataset[`${kind}Id`])));
    container.querySelectorAll('[data-folder-actions-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const card = button.closest('.curriculum-folder-card-shell');
        const willOpen = Boolean(card && !card.classList.contains('is-actions-open'));
        closeActionMenus();
        if (!card) return;
        card.classList.toggle('is-actions-open', willOpen);
        button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
    });
    container.querySelectorAll('[data-folder-edit]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeActionMenus();
        const actionKind = button.dataset.folderActionKind;
        const item = folderItems[actionKind]?.get(String(button.dataset.folderEdit || ''));
        if (!item) return;
        if (actionKind === 'theme') openThemeEditModal(item);
        else if (actionKind === 'grade') openGradeEditModal(item);
      });
    });
    container.querySelectorAll('[data-folder-delete]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeActionMenus();
        deleteFolder(button.dataset.folderActionKind, button.dataset.folderDelete);
      });
    });
  }
  async function loadCurriculumGroups() {
    const data = await jsonFetch('/api/lms/curriculum');
    renderCurriculumGroups(data.groups || []);
  }
  function resourceCard(file, key, config) {
    const name = file.name || file.file_name || `Untitled ${config.label}`;
    const format = resourceFormat(file);
    const meta = formatBytes(file.file_size);
    const note = String(file.notes || '').trim();
    return `<article class="curriculum-file-card curriculum-file-card--${key}" data-resource-card="${esc(file.id)}">
      <button type="button" class="curriculum-file-card__open" data-view-resource="${esc(file.id)}" aria-label="Preview ${esc(name)} inside the system">
        <span class="curriculum-file-card__visual">
          <span class="curriculum-file-card__document"><i data-feather="${config.icon}"></i></span>
          <span class="curriculum-file-card__type-pill">${esc(format)}</span>
        </span>
        <span class="curriculum-file-card__details">
          <h3 title="${esc(name)}">${esc(name)}</h3>
          <span class="curriculum-file-card__meta">${esc(meta)}</span>
          ${note ? `<span class="curriculum-file-card__note">${esc(note)}</span>` : ''}
        </span>
      </button>
      <div class="curriculum-resource-actions">
        <button type="button" class="curriculum-resource-menu-btn" data-resource-actions-toggle aria-label="Actions for ${esc(name)}" aria-expanded="false"><i data-feather="more-vertical"></i></button>
        <div class="curriculum-resource-actions__menu" role="menu">
          <button type="button" data-edit-resource="${esc(file.id)}" role="menuitem"><i data-feather="edit-3"></i><span>Edit</span></button>
          <button type="button" class="is-danger" data-delete-resource="${esc(file.id)}" role="menuitem"><i data-feather="trash-2"></i><span>Delete</span></button>
        </div>
      </div>
    </article>`;
  }
  function bindResourceCards(container) {
    container.querySelectorAll('[data-view-resource]').forEach((button) => {
      button.addEventListener('click', () => openResourceViewer(button.dataset.viewResource));
    });
    container.querySelectorAll('[data-resource-actions-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const card = button.closest('.curriculum-file-card');
        const willOpen = Boolean(card && !card.classList.contains('is-actions-open'));
        closeActionMenus();
        if (!card) return;
        card.classList.toggle('is-actions-open', willOpen);
        button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
    });
    container.querySelectorAll('[data-edit-resource]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const item = resourceItems.get(String(button.dataset.editResource || ''));
        closeActionMenus();
        if (item) openResourceEditModal(item);
      });
    });
    container.querySelectorAll('[data-delete-resource]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeActionMenus();
        deleteResource(button.dataset.deleteResource);
      });
    });
  }
  function renderGroups(resources) {
    const grouped = {};
    Object.keys(TYPES).forEach((key) => { grouped[key] = []; });
    resourceItems.clear();
    (resources || []).forEach((item) => {
      if (!grouped[item.resource_type]) return;
      grouped[item.resource_type].push(item);
      resourceItems.set(String(item.id), item);
    });
    $('curriculumGroups').innerHTML = Object.entries(TYPES).map(([key, config]) => `
      <article class="curriculum-group-card">
        <header>
          <div class="curriculum-group-card__title"><span><i data-feather="${config.icon}"></i></span><div><h2>${config.label}</h2></div></div>
          <button class="curriculum-add-file-btn" data-resource-type="${key}"><i data-feather="plus"></i><span>Add ${config.label}</span></button>
        </header>
        <div class="curriculum-file-grid">${grouped[key].length ? grouped[key].map((file) => resourceCard(file, key, config)).join('') : `<div class="curriculum-group-empty"><i data-feather="folder"></i><span>No ${config.label.toLowerCase()} files yet</span></div>`}</div>
      </article>`).join('');
    $('curriculumGroups').querySelectorAll('[data-resource-type]').forEach((button) => button.addEventListener('click', () => openResourceModal(button.dataset.resourceType)));
    bindResourceCards($('curriculumGroups'));
    icons();
  }

  async function openTheme(id) { currentThemeId = String(id || ''); currentGradeId = ''; history.pushState({}, '', `/lms/curriculum/${encodeURIComponent(currentThemeId)}`); await loadTheme(); }
  async function loadTheme() {
    if (!currentThemeId) return;
    const data = await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}`);
    currentTheme = data.curriculum;
    showView('theme');
    $('curriculumPageTitle').textContent = currentTheme.name || 'Curriculum';
    $('curriculumThemeTitle').textContent = currentTheme.name || 'Theme';
    renderGrades(data.grades || []);
  }
  async function openGrade(id) { currentGradeId = String(id || ''); history.pushState({}, '', `/lms/curriculum/${encodeURIComponent(currentThemeId)}/grade/${encodeURIComponent(currentGradeId)}`); await loadGrade(); }
  async function loadGrade() {
    if (!currentThemeId || !currentGradeId) return;
    const data = await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades/${encodeURIComponent(currentGradeId)}`);
    currentTheme = data.curriculum;
    showView('grade');
    $('curriculumPageTitle').textContent = data.grade.name || 'Grade';
    $('curriculumGradeTitle').textContent = data.grade.name || 'Grade';
    renderGroups(data.resources || []);
  }
  function backToThemes() { currentThemeId = ''; currentGradeId = ''; history.pushState({}, '', '/lms/curriculum'); showView('list'); $('curriculumPageTitle').textContent = 'Curriculum'; loadCurriculumGroups().catch(showListError); }
  function backToGrades() { currentGradeId = ''; history.pushState({}, '', `/lms/curriculum/${encodeURIComponent(currentThemeId)}`); loadTheme().catch((error) => alert(error.message)); }
  function showListError(error) { $('curriculumFolderGrid').innerHTML = emptyFolders('Unable to load curricula', error.message); icons(); }

  function openCurriculumModal() {
    editingCurriculumGroupId = '';
    $('curriculumNameInput').value = '';
    $('curriculumDescriptionInput').value = '';
    $('curriculumModal').querySelector('.curriculum-kicker').textContent = 'NEW CURRICULUM GROUP';
    $('curriculumModal').querySelector('h2').textContent = 'Add New Curriculum';
    $('saveCurriculumBtn').textContent = 'Create Curriculum';
    $('curriculumModal').hidden = false;
    $('curriculumModalError').textContent = '';
    setTimeout(() => $('curriculumNameInput').focus(), 20);
  }
  function openCurriculumEditModal(item) {
    editingCurriculumGroupId = String(item?.id || '');
    $('curriculumNameInput').value = item?.name || '';
    $('curriculumDescriptionInput').value = item?.description || '';
    $('curriculumModal').querySelector('.curriculum-kicker').textContent = 'EDIT CURRICULUM GROUP';
    $('curriculumModal').querySelector('h2').textContent = 'Edit Curriculum';
    $('saveCurriculumBtn').textContent = 'Save Changes';
    $('curriculumModal').hidden = false;
    $('curriculumModalError').textContent = '';
    setTimeout(() => { $('curriculumNameInput').focus(); $('curriculumNameInput').select(); }, 20);
  }
  function closeCurriculumModal() {
    $('curriculumModal').hidden = true;
    $('curriculumModalError').textContent = '';
    editingCurriculumGroupId = '';
  }
  function openThemeModal(groupId, groupName) {
    editingThemeId = '';
    activeCurriculumGroupId = String(groupId || '');
    activeCurriculumGroupName = String(groupName || 'Curriculum');
    $('themeNameInput').value = '';
    $('themeDescriptionInput').value = '';
    $('themeCurriculumTarget').textContent = `Curriculum: ${activeCurriculumGroupName}`;
    $('themeModal').querySelector('.curriculum-kicker').textContent = 'NEW THEME FOLDER';
    $('themeModal').querySelector('h2').textContent = 'Add New Theme';
    $('saveThemeBtn').textContent = 'Create Theme';
    $('themeModalError').textContent = '';
    $('themeModal').hidden = false;
    setTimeout(() => $('themeNameInput').focus(), 20);
  }
  function openThemeEditModal(item) {
    editingThemeId = String(item?.id || '');
    activeCurriculumGroupId = String(item?.curriculum_group_id || '');
    activeCurriculumGroupName = String(item?.curriculumGroupName || 'Curriculum');
    $('themeNameInput').value = item?.name || '';
    $('themeDescriptionInput').value = item?.description || '';
    $('themeCurriculumTarget').textContent = `Curriculum: ${activeCurriculumGroupName}`;
    $('themeModal').querySelector('.curriculum-kicker').textContent = 'EDIT THEME FOLDER';
    $('themeModal').querySelector('h2').textContent = 'Edit Theme';
    $('saveThemeBtn').textContent = 'Save Changes';
    $('themeModalError').textContent = '';
    $('themeModal').hidden = false;
    setTimeout(() => { $('themeNameInput').focus(); $('themeNameInput').select(); }, 20);
  }
  function closeThemeModal() {
    $('themeModal').hidden = true;
    $('themeModalError').textContent = '';
    editingThemeId = '';
    activeCurriculumGroupId = '';
    activeCurriculumGroupName = '';
  }
  function openGradeModal() {
    editingGradeId = '';
    $('gradeNameInput').value = '';
    $('gradeDescriptionInput').value = '';
    $('gradeModal').querySelector('.curriculum-kicker').textContent = 'NEW GRADE FOLDER';
    $('gradeModal').querySelector('h2').textContent = 'Add New Grade';
    $('saveGradeBtn').textContent = 'Create Grade';
    $('gradeModal').hidden = false;
    $('gradeModalError').textContent = '';
    setTimeout(() => $('gradeNameInput').focus(), 20);
  }
  function openGradeEditModal(item) {
    editingGradeId = String(item?.id || '');
    $('gradeNameInput').value = item?.name || '';
    $('gradeDescriptionInput').value = item?.description || '';
    $('gradeModal').querySelector('.curriculum-kicker').textContent = 'EDIT GRADE FOLDER';
    $('gradeModal').querySelector('h2').textContent = 'Edit Grade';
    $('saveGradeBtn').textContent = 'Save Changes';
    $('gradeModal').hidden = false;
    $('gradeModalError').textContent = '';
    setTimeout(() => { $('gradeNameInput').focus(); $('gradeNameInput').select(); }, 20);
  }
  function closeGradeModal() {
    $('gradeModal').hidden = true;
    $('gradeModalError').textContent = '';
    editingGradeId = '';
  }

  function resetResourceUploadUi() {
    selectedResourceFile = null;
    resourceUploadPending = false;
    $('resourceFileInput').value = '';
    $('resourceFileInput').disabled = false;
    $('resourceFilePreview').hidden = true;
    $('resourceFilePreview').innerHTML = '';
    $('resourceCurrentFile').hidden = true;
    $('resourceCurrentFile').innerHTML = '';
    $('resourceUploadProgress').hidden = true;
    $('resourceUploadProgress').classList.remove('is-uploading', 'is-success', 'is-failed');
    $('resourceUploadProgressBar').style.width = '0%';
    $('resourceUploadProgressPercent').textContent = '0%';
    $('resourceUploadProgressLabel').innerHTML = '<span class="curriculum-upload-status-icon"><i data-feather="upload-cloud"></i></span><span>Uploading…</span>';
    $('saveResourceBtn').disabled = false;
    $('saveResourceBtn').textContent = 'Upload & Add File';
    $('resourceUploadLabel').textContent = 'Upload file';
    $('resourceUploadHint').textContent = 'Select a file up to 500 MB. It will be stored securely.';
    icons();
  }
  function setUploadStatus(state, label, percent) {
    const progress = $('resourceUploadProgress');
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    const icon = state === 'success' ? 'check-circle' : state === 'failed' ? 'x-circle' : 'upload-cloud';
    progress.hidden = false;
    progress.classList.remove('is-uploading', 'is-success', 'is-failed');
    progress.classList.add(`is-${state}`);
    $('resourceUploadProgressBar').style.width = `${safePercent}%`;
    $('resourceUploadProgressPercent').textContent = state === 'success' ? 'Done' : state === 'failed' ? 'Failed' : `${safePercent}%`;
    $('resourceUploadProgressLabel').innerHTML = `<span class="curriculum-upload-status-icon"><i data-feather="${icon}"></i></span><span>${esc(label)}</span>`;
    icons();
  }
  function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
  function clearSelectedResourceFile() {
    selectedResourceFile = null;
    $('resourceFileInput').value = '';
    $('resourceFilePreview').hidden = true;
    $('resourceFilePreview').innerHTML = '';
    $('resourceUploadProgress').hidden = true;
    $('resourceUploadProgress').classList.remove('is-uploading', 'is-success', 'is-failed');
    $('saveResourceBtn').disabled = false;
    $('resourceFileInput').disabled = false;
    $('saveResourceBtn').textContent = editingResourceId ? 'Save Changes' : 'Upload & Add File';
  }
  function renderSelectedFile() {
    const preview = $('resourceFilePreview');
    if (!selectedResourceFile) { preview.hidden = true; preview.innerHTML = ''; return; }
    preview.hidden = false;
    preview.innerHTML = `<span class="curriculum-upload-file__icon"><i data-feather="file-text"></i></span><span class="curriculum-upload-file__info"><b>${esc(selectedResourceFile.name)}</b><small>${esc([selectedResourceFile.type || 'File', formatBytes(selectedResourceFile.size)].filter(Boolean).join(' · '))}</small></span><button id="removeResourceFileBtn" type="button" aria-label="Remove selected file"><i data-feather="trash-2"></i></button>`;
    $('removeResourceFileBtn').addEventListener('click', () => {
      clearSelectedResourceFile();
      if (!editingResourceId) $('resourceNameInput').value = '';
    });
    icons();
  }
  function chooseResourceFile(file) {
    $('resourceModalError').textContent = '';
    $('resourceUploadProgress').hidden = true;
    $('resourceUploadProgress').classList.remove('is-uploading', 'is-success', 'is-failed');
    $('saveResourceBtn').disabled = false;
    $('resourceFileInput').disabled = false;
    if (!file) { clearSelectedResourceFile(); return; }
    if (!file.size) { $('resourceModalError').textContent = 'The selected file is empty.'; clearSelectedResourceFile(); return; }
    if (file.size > MAX_FILE_BYTES) { $('resourceModalError').textContent = `“${file.name}” is larger than 500 MB.`; clearSelectedResourceFile(); return; }
    selectedResourceFile = file;
    if (!$('resourceNameInput').value.trim()) $('resourceNameInput').value = file.name.replace(/\.[^.]+$/, '').slice(0, 240);
    renderSelectedFile();
  }
  function openResourceModal(type) {
    editingResourceId = '';
    editingResourceItem = null;
    activeResourceType = type;
    const config = TYPES[type];
    resetResourceUploadUi();
    $('resourceNameInput').value = '';
    $('resourceNotesInput').value = '';
    $('resourceModalKicker').textContent = `NEW ${config.label.toUpperCase()}`;
    $('resourceModalTitle').textContent = `Add ${config.label}`;
    $('resourceModal').hidden = false;
    $('resourceModalError').textContent = '';
    setTimeout(() => $('resourceFileInput').focus(), 20);
  }
  function openResourceEditModal(item) {
    editingResourceId = String(item?.id || '');
    editingResourceItem = item || null;
    activeResourceType = String(item?.resource_type || '');
    const config = TYPES[activeResourceType] || { label: 'File', icon: 'file-text' };
    resetResourceUploadUi();
    editingResourceId = String(item?.id || '');
    editingResourceItem = item || null;
    $('resourceNameInput').value = item?.name || '';
    $('resourceNotesInput').value = item?.notes || '';
    $('resourceModalKicker').textContent = `EDIT ${config.label.toUpperCase()}`;
    $('resourceModalTitle').textContent = `Edit ${config.label}`;
    $('resourceUploadLabel').textContent = 'Replace file (optional)';
    $('resourceUploadHint').textContent = 'Choose a new file only if you want to replace the current one.';
    $('saveResourceBtn').textContent = 'Save Changes';
    $('resourceCurrentFile').hidden = false;
    $('resourceCurrentFile').innerHTML = `<span><i data-feather="${config.icon}"></i></span><div><b>${esc(item?.file_name || item?.name || 'Current file')}</b><small>Current protected file · ${esc([resourceFormat(item), formatBytes(item?.file_size)].filter(Boolean).join(' · '))}</small></div>`;
    $('resourceModal').hidden = false;
    $('resourceModalError').textContent = '';
    icons();
    setTimeout(() => { $('resourceNameInput').focus(); $('resourceNameInput').select(); }, 20);
  }
  function closeResourceModal() {
    if (resourceUploadPending) return;
    $('resourceModal').hidden = true;
    $('resourceModalError').textContent = '';
    activeResourceType = '';
    editingResourceId = '';
    editingResourceItem = null;
    resetResourceUploadUi();
  }

  function uploadFileToSignedUrl(signedUrl, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl, true);
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      });
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          let message = `Upload failed with status ${xhr.status}.`;
          try { const body = JSON.parse(xhr.responseText || '{}'); message = body.message || body.error || message; } catch {}
          reject(storageUploadError(new Error(message)));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('Network error while uploading the file.')));
      xhr.addEventListener('abort', () => reject(new Error('File upload was cancelled.')));
      const form = new FormData();
      form.append('cacheControl', '3600');
      form.append('', file);
      xhr.send(form);
    });
  }

  function storageUploadError(error) {
    let message = String(error?.message || 'The resumable upload failed.').trim();
    try {
      const body = error?.originalResponse?.getBody?.();
      if (body) {
        const parsed = JSON.parse(body);
        message = String(parsed?.message || parsed?.error || message).trim();
      }
    } catch {}
    if (/maximum size exceeded|maximum allowed size|file size (?:exceeds|limit)|entity too large/i.test(message)) {
      return new Error('Supabase Storage is still globally limited below 500 MB. On the self-hosted server, apply the included Storage override, recreate the storage service, then try again.');
    }
    if (/response code:\s*413|status\s*413|http\s*413/i.test(message)) {
      return new Error('The upload was rejected with HTTP 413. Verify the 500 MB global limit in the self-hosted Storage service and any reverse proxy in front of it.');
    }
    return new Error(message || 'The resumable upload failed.');
  }

  function uploadFileResumable(uploadTicket, file, onProgress) {
    return new Promise((resolve, reject) => {
      const TusUpload = window.tus?.Upload;
      const endpoint = String(uploadTicket?.resumableUrl || '').trim();
      const signature = String(uploadTicket?.token || '').trim();
      if (!TusUpload || !endpoint || !signature) {
        reject(new Error('Resumable upload is not available.'));
        return;
      }
      const headers = {
        'x-signature': signature,
        'x-upsert': 'false',
      };
      const apiKey = String(uploadTicket?.resumableApiKey || '').trim();
      if (apiKey) headers.apikey = apiKey;
      const uploader = new TusUpload(file, {
        endpoint,
        headers,
        retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
        uploadDataDuringCreation: true,
        chunkSize: 6 * 1024 * 1024,
        storeFingerprintForResuming: false,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: String(uploadTicket?.bucket || ''),
          objectName: String(uploadTicket?.path || ''),
          contentType: file.type || 'application/octet-stream',
          cacheControl: '3600',
        },
        onProgress(bytesUploaded, bytesTotal) {
          const percent = bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
          onProgress(Math.max(0, Math.min(100, percent)));
        },
        onError(error) {
          activeResourceUpload = null;
          reject(storageUploadError(error));
        },
        onSuccess() {
          activeResourceUpload = null;
          onProgress(100);
          resolve();
        },
      });
      activeResourceUpload = uploader;
      uploader.start();
    });
  }

  async function uploadResourceFile(uploadTicket, file, onProgress) {
    const useResumable = uploadTicket?.mode === 'resumable'
      && Boolean(window.tus?.Upload)
      && Boolean(uploadTicket?.resumableUrl)
      && Boolean(uploadTicket?.token);
    if (useResumable) {
      await uploadFileResumable(uploadTicket, file, onProgress);
      return;
    }
    await uploadFileToSignedUrl(uploadTicket?.signedUrl, file, onProgress);
  }

  function isPdfUploadFile(file) {
    return String(file?.type || '').toLowerCase() === 'application/pdf' || fileExtension(file?.name) === 'PDF';
  }

  function canvasToJpegFile(canvas, pageNumber) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Could not create the fast page preview.'));
          return;
        }
        resolve(new File([blob], `page-${pageNumber}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
      }, 'image/jpeg', .82);
    });
  }

  async function createPdfFastPreviewFiles(file) {
    if (!isPdfUploadFile(file) || Number(file?.size || 0) > 250 * 1024 * 1024) return [];
    const pdfjs = await loadPdfJs();
    const objectUrl = URL.createObjectURL(file);
    let loadingTask = null;
    try {
      loadingTask = pdfjs.getDocument({
        url: objectUrl,
        disableAutoFetch: true,
        disableRange: false,
        disableStream: false,
        isEvalSupported: false,
      });
      const documentRef = await loadingTask.promise;
      const previews = [];
      const pageCount = Math.min(2, documentRef.numPages);
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await documentRef.getPage(pageNumber);
        const natural = page.getViewport({ scale: 1 });
        const scale = Math.max(.25, Math.min(1.65, 1200 / natural.width, 1600 / natural.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        previews.push({ pageNumber, file: await canvasToJpegFile(canvas, pageNumber) });
        canvas.width = 1;
        canvas.height = 1;
        try { page.cleanup?.(); } catch {}
      }
      return previews;
    } finally {
      try { await loadingTask?.destroy?.(); } catch {}
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function saveCurriculum() {
    const name = $('curriculumNameInput').value.trim();
    const editId = editingCurriculumGroupId;
    if (!name) { $('curriculumModalError').textContent = 'Curriculum name is required.'; return; }
    const button = $('saveCurriculumBtn');
    button.disabled = true;
    try {
      const url = editId ? `/api/lms/curriculum/groups/${encodeURIComponent(editId)}` : '/api/lms/curriculum/groups';
      await jsonFetch(url, { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: $('curriculumDescriptionInput').value.trim() }) });
      closeCurriculumModal();
      await loadCurriculumGroups();
    } catch (error) { $('curriculumModalError').textContent = error.message; } finally { button.disabled = false; }
  }
  async function saveTheme() {
    const name = $('themeNameInput').value.trim();
    const editId = editingThemeId;
    if (!editId && !activeCurriculumGroupId) { $('themeModalError').textContent = 'Choose a curriculum group first.'; return; }
    if (!name) { $('themeModalError').textContent = 'Theme name is required.'; return; }
    const button = $('saveThemeBtn');
    button.disabled = true;
    try {
      if (editId) {
        await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(editId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: $('themeDescriptionInput').value.trim() }) });
        closeThemeModal();
        await loadCurriculumGroups();
        return;
      }
      const data = await jsonFetch(`/api/lms/curriculum/groups/${encodeURIComponent(activeCurriculumGroupId)}/themes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: $('themeDescriptionInput').value.trim() }) });
      $('themeNameInput').value = ''; $('themeDescriptionInput').value = ''; closeThemeModal(); await loadCurriculumGroups(); if (data.theme?.id) await openTheme(data.theme.id);
    } catch (error) { $('themeModalError').textContent = error.message; } finally { button.disabled = false; }
  }
  async function saveGrade() {
    const name = $('gradeNameInput').value.trim();
    const editId = editingGradeId;
    if (!name) { $('gradeModalError').textContent = 'Grade name is required.'; return; }
    const button = $('saveGradeBtn');
    button.disabled = true;
    try {
      if (editId) {
        await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades/${encodeURIComponent(editId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: $('gradeDescriptionInput').value.trim() }) });
        closeGradeModal();
        await loadTheme();
        return;
      }
      const data = await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: $('gradeDescriptionInput').value.trim() }) });
      $('gradeNameInput').value = ''; $('gradeDescriptionInput').value = ''; closeGradeModal(); await loadTheme(); if (data.grade?.id) await openGrade(data.grade.id);
    } catch (error) { $('gradeModalError').textContent = error.message; } finally { button.disabled = false; }
  }
  async function saveResource() {
    const name = $('resourceNameInput').value.trim();
    const editId = editingResourceId;
    if (!name) { $('resourceModalError').textContent = 'File name is required.'; return; }
    if (!editId && !selectedResourceFile) { $('resourceModalError').textContent = 'Choose a file to upload.'; return; }
    if (selectedResourceFile && selectedResourceFile.size > MAX_FILE_BYTES) { $('resourceModalError').textContent = 'The file must be 500 MB or less.'; return; }
    const button = $('saveResourceBtn');
    resourceUploadPending = true;
    button.disabled = true;
    $('resourceFileInput').disabled = true;
    $('resourceModalError').textContent = '';
    if (selectedResourceFile) {
      setUploadStatus('uploading', `Preparing ${selectedResourceFile.name}`, 0);
      button.textContent = editId ? 'Replacing…' : 'Uploading…';
    } else {
      button.textContent = 'Saving…';
    }
    try {
      const payload = { name, notes: $('resourceNotesInput').value.trim() };
      const uploadedFileName = selectedResourceFile?.name || '';
      if (selectedResourceFile) {
        const ticketData = await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades/${encodeURIComponent(currentGradeId)}/upload-ticket`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resourceType: activeResourceType, fileName: selectedResourceFile.name, fileSize: selectedResourceFile.size, mimeType: selectedResourceFile.type || 'application/octet-stream' }),
        });
        const upload = ticketData.upload || {};
        const fastPreviewPromise = isPdfUploadFile(selectedResourceFile)
          ? createPdfFastPreviewFiles(selectedResourceFile).catch((error) => {
            console.warn('Fast PDF preview creation skipped:', error?.message || error);
            return [];
          })
          : Promise.resolve([]);
        await uploadResourceFile(upload, selectedResourceFile, (percent) => {
          setUploadStatus('uploading', percent < 100 ? `Uploading ${selectedResourceFile.name}` : 'Finalizing upload…', percent);
        });
        try {
          const previewFiles = await fastPreviewPromise;
          const previewUploads = Array.isArray(upload.previewUploads) ? upload.previewUploads : [];
          if (previewFiles.length && previewUploads.length) {
            setUploadStatus('uploading', 'Optimizing the first two pages for instant opening…', 100);
            for (const preview of previewFiles) {
              const previewUpload = previewUploads.find((item) => Number(item?.pageNumber) === preview.pageNumber);
              if (previewUpload?.signedUrl) await uploadFileToSignedUrl(previewUpload.signedUrl, preview.file, () => {});
            }
          }
        } catch (previewError) {
          console.warn('Fast PDF preview upload skipped:', previewError?.message || previewError);
        }
        Object.assign(payload, {
          resourceUrl: upload.publicUrl,
          storagePath: upload.path,
          storageBucket: upload.bucket,
          fileName: selectedResourceFile.name,
          fileSize: selectedResourceFile.size,
          mimeType: selectedResourceFile.type || 'application/octet-stream',
        });
      }
      if (editId) {
        await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades/${encodeURIComponent(currentGradeId)}/resources/${encodeURIComponent(editId)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      } else {
        await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades/${encodeURIComponent(currentGradeId)}/resources`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resourceType: activeResourceType, ...payload }),
        });
      }
      if (uploadedFileName) {
        setUploadStatus('success', `${uploadedFileName} ${editId ? 'replaced' : 'uploaded'} successfully`, 100);
        button.textContent = editId ? 'Updated' : 'Uploaded';
        await wait(700);
      }
      resourceUploadPending = false;
      closeResourceModal();
      await loadGrade();
    } catch (error) {
      const message = error.message || (editId ? 'Failed to update the file.' : 'Failed to upload the file.');
      $('resourceModalError').textContent = message;
      resourceUploadPending = false;
      button.disabled = false;
      button.textContent = editId ? 'Try Saving Again' : 'Try Upload Again';
      $('resourceFileInput').disabled = false;
      if (selectedResourceFile) setUploadStatus('failed', message, 100);
    }
  }
  function setViewerStatus(message, state = 'loading') {
    const status = $('resourceViewerLoading');
    status.hidden = false;
    status.classList.toggle('is-error', state === 'error');
    status.innerHTML = state === 'error'
      ? '<i data-feather="alert-triangle"></i><b></b>'
      : '<span class="curriculum-viewer__spinner"></span><b></b>';
    status.querySelector('b').textContent = message;
    icons();
  }
  function fillViewerWatermark(label) {
    const watermark = $('resourceViewerWatermark');
    watermark.innerHTML = '';
    const text = String(label || 'Authorized preview · Confidential').trim();
    for (let index = 0; index < 24; index += 1) {
      const item = document.createElement('span');
      item.textContent = text;
      watermark.appendChild(item);
    }
  }
  function clearViewerContent() {
    pdfRenderToken += 1;
    window.cancelAnimationFrame(pdfTurnFrame);
    window.clearTimeout(pdfResizeTimer);
    window.clearTimeout(pdfZoomTimer);
    pdfTurnFrame = 0;
    pdfTurnState = null;
    pdfTurnPreparing = false;
    pdfPageCache.clear();
    const loadingTask = activePdfLoadingTask;
    activePdfLoadingTask = null;
    activePdfDocument = null;
    try { loadingTask?.destroy?.().catch?.(() => {}); } catch {}
    activePdfSpreadStart = 1;
    activePdfZoom = 1;
    $('resourceViewerContent').innerHTML = '';
    $('resourceViewerLoading').hidden = true;
  }
  function closeResourceViewer() {
    viewerLoadToken += 1;
    const panel = $('resourceViewerModal').querySelector('.curriculum-viewer__panel');
    if (pdfFullscreenElement() === panel) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      try { exit?.call(document)?.catch?.(() => {}); } catch {}
    }
    $('resourceViewerModal').classList.remove('is-fullscreen-fallback');
    $('resourceViewerModal').hidden = true;
    document.body.classList.remove('curriculum-viewer-open');
    clearViewerContent();
    $('resourceViewerWatermark').innerHTML = '';
  }
  function loadPdfJs() {
    if (!pdfJsPromise) {
      pdfJsPromise = import('/js/vendor/pdfjs/pdf.min.mjs?v=legacy-6.2.108-1').then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = '/js/vendor/pdfjs/pdf.worker.min.mjs?v=legacy-6.2.108-1';
        return pdfjs;
      });
    }
    return pdfJsPromise;
  }
  function pdfSpreadRange(documentRef = activePdfDocument) {
    if (!documentRef) return '';
    const end = Math.min(activePdfSpreadStart + 1, documentRef.numPages);
    return end === activePdfSpreadStart ? `${end}` : `${activePdfSpreadStart}–${end}`;
  }
  function normalisePdfSpreadStart(value, documentRef = activePdfDocument) {
    if (!documentRef) return 1;
    const lastStart = Math.max(1, (Math.ceil(documentRef.numPages / 2) * 2) - 1);
    const clean = Math.max(1, Math.min(lastStart, Math.round(Number(value) || 1)));
    return clean % 2 === 0 ? Math.max(1, clean - 1) : clean;
  }
  function clampPdfZoom(value) {
    return Math.min(PDF_MAX_ZOOM, Math.max(PDF_MIN_ZOOM, Number(value) || 1));
  }
  function activePdfRoot() {
    return $('resourceViewerContent').querySelector('.curriculum-pdf-reader');
  }
  function sizePdfBook(root) {
    const viewport = root?.querySelector('.curriculum-pdf-reader__viewport');
    const canvasArea = root?.querySelector('.curriculum-pdf-reader__canvas');
    const book = root?.querySelector('.curriculum-pdf-book');
    if (!viewport || !canvasArea || !book) return null;
    const viewportWidth = Math.max(320, viewport.clientWidth);
    const viewportHeight = Math.max(280, viewport.clientHeight);
    const fitWidth = Math.max(340, viewportWidth - (viewportWidth < 720 ? 28 : 150));
    const fitHeight = Math.max(250, viewportHeight - (viewportWidth < 720 ? 62 : 86));
    const baseWidth = Math.max(340, Math.min(1180, fitWidth, fitHeight * 1.46));
    const width = Math.max(280, Math.floor(baseWidth * activePdfZoom));
    const height = Math.max(204, Math.floor((baseWidth / 1.46) * activePdfZoom));
    book.style.width = `${width}px`;
    book.style.height = `${height}px`;
    canvasArea.style.width = `${Math.max(viewportWidth, width + (viewportWidth < 720 ? 28 : 154))}px`;
    canvasArea.style.height = `${Math.max(viewportHeight, height + (viewportWidth < 720 ? 56 : 96))}px`;
    return {
      width,
      height,
      pageWidth: width / 2,
      pageHeight: height,
      density: Math.min(1.6, Math.max(1, window.devicePixelRatio || 1)),
      signature: `${Math.round(width / 8) * 8}x${Math.round(height / 8) * 8}`,
    };
  }
  function centerPdfStage(root = activePdfRoot()) {
    const stage = root?.querySelector('.curriculum-pdf-reader__stage');
    if (!stage) return;
    stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
    stage.scrollTop = Math.max(0, (stage.scrollHeight - stage.clientHeight) / 2);
  }
  function touchPdfCache(pageNumber, value) {
    pdfPageCache.delete(pageNumber);
    pdfPageCache.set(pageNumber, value);
  }
  function trimPdfPageCache(protectedPages = []) {
    const keep = new Set(protectedPages.filter((page) => Number.isFinite(page)));
    while (pdfPageCache.size > PDF_PAGE_CACHE_LIMIT) {
      const removable = [...pdfPageCache.keys()].find((page) => !keep.has(page));
      if (!removable) break;
      pdfPageCache.delete(removable);
    }
  }
  async function cachedPdfPageCanvas(documentRef, pageNumber, metrics, renderToken) {
    if (!documentRef || pageNumber < 1 || pageNumber > documentRef.numPages) return null;
    const cached = pdfPageCache.get(pageNumber);
    if (cached?.signature === metrics.signature) {
      touchPdfCache(pageNumber, cached);
      return cached.canvas;
    }
    if (cached) pdfPageCache.delete(pageNumber);
    const page = await documentRef.getPage(pageNumber);
    if (renderToken !== pdfRenderToken || documentRef !== activePdfDocument) return null;
    const natural = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(120, metrics.pageWidth - 26);
    const availableHeight = Math.max(170, metrics.pageHeight - 26);
    const cssScale = Math.max(.08, Math.min(availableWidth / natural.width, availableHeight / natural.height));
    const viewport = page.getViewport({ scale: cssScale * metrics.density });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    canvas.dataset.cssWidth = String(Math.max(1, Math.floor(viewport.width / metrics.density)));
    canvas.dataset.cssHeight = String(Math.max(1, Math.floor(viewport.height / metrics.density)));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    try {
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      if (renderToken !== pdfRenderToken || documentRef !== activePdfDocument) return null;
      touchPdfCache(pageNumber, { canvas, signature: metrics.signature });
      trimPdfPageCache([activePdfSpreadStart, activePdfSpreadStart + 1, pageNumber]);
      try { page.cleanup?.(); } catch {}
      return canvas;
    } catch (error) {
      if (renderToken === pdfRenderToken && documentRef === activePdfDocument) throw error;
      return null;
    }
  }
  function paintPdfSurface(surface, source, pageNumber, documentRef = activePdfDocument) {
    const canvas = surface?.querySelector('canvas');
    const pageLabel = surface?.querySelector('.curriculum-pdf-page__number');
    if (!surface || !canvas || !pageLabel) return;
    const isBlank = !source || !documentRef || pageNumber < 1 || pageNumber > documentRef.numPages;
    surface.classList.toggle('is-blank', isBlank);
    pageLabel.textContent = isBlank ? '' : String(pageNumber);
    if (isBlank) {
      canvas.width = 1;
      canvas.height = 1;
      canvas.style.width = '1px';
      canvas.style.height = '1px';
      return;
    }
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.style.width = `${Number(source.dataset.cssWidth || source.width)}px`;
    canvas.style.height = `${Number(source.dataset.cssHeight || source.height)}px`;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0);
  }
  function updatePdfControls(root = activePdfRoot()) {
    const documentRef = activePdfDocument;
    if (!root || !documentRef) return;
    root.querySelectorAll('[data-pdf-range]').forEach((item) => { item.textContent = pdfSpreadRange(documentRef); });
    root.querySelectorAll('[data-pdf-total]').forEach((item) => { item.textContent = String(documentRef.numPages); });
    root.querySelectorAll('[data-pdf-zoom-value]').forEach((item) => { item.textContent = `${Math.round(activePdfZoom * 100)}%`; });
    const controlsBusy = Boolean(pdfTurnState || pdfTurnPreparing);
    root.querySelectorAll('[data-pdf-prev]').forEach((button) => { button.disabled = controlsBusy || activePdfSpreadStart <= 1; });
    root.querySelectorAll('[data-pdf-next]').forEach((button) => { button.disabled = controlsBusy || activePdfSpreadStart + 1 >= documentRef.numPages; });
    root.querySelectorAll('[data-pdf-zoom-out]').forEach((button) => { button.disabled = controlsBusy || activePdfZoom <= PDF_MIN_ZOOM + .001; });
    root.querySelectorAll('[data-pdf-zoom-in]').forEach((button) => { button.disabled = controlsBusy || activePdfZoom >= PDF_MAX_ZOOM - .001; });
    root.classList.toggle('can-turn-backward', activePdfSpreadStart > 1);
    root.classList.toggle('can-turn-forward', activePdfSpreadStart + 1 < documentRef.numPages);
  }
  async function primePdfAdjacentPages(documentRef, metrics, renderToken) {
    const candidates = [
      activePdfSpreadStart + 2,
      activePdfSpreadStart + 3,
      activePdfSpreadStart - 2,
      activePdfSpreadStart - 1,
    ].filter((page, index, pages) => page >= 1 && page <= documentRef.numPages && pages.indexOf(page) === index);
    const run = async () => {
      for (const pageNumber of candidates) {
        if (renderToken !== pdfRenderToken || documentRef !== activePdfDocument || pdfTurnState) return;
        try { await cachedPdfPageCanvas(documentRef, pageNumber, metrics, renderToken); } catch {}
      }
      trimPdfPageCache([
        activePdfSpreadStart - 2,
        activePdfSpreadStart - 1,
        activePdfSpreadStart,
        activePdfSpreadStart + 1,
        activePdfSpreadStart + 2,
        activePdfSpreadStart + 3,
      ]);
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => run(), { timeout: 900 });
    else window.setTimeout(run, 120);
  }
  async function renderPdfSpread() {
    const documentRef = activePdfDocument;
    const root = activePdfRoot();
    if (!documentRef || !root || pdfTurnState || pdfTurnPreparing) return;
    activePdfSpreadStart = normalisePdfSpreadStart(activePdfSpreadStart, documentRef);
    const renderToken = ++pdfRenderToken;
    const metrics = sizePdfBook(root);
    const slots = root.querySelectorAll('.curriculum-pdf-page--base');
    if (!metrics || slots.length < 2) return;
    root.classList.add('is-rendering-pages');
    updatePdfControls(root);
    const [leftCanvas, rightCanvas] = await Promise.all([
      cachedPdfPageCanvas(documentRef, activePdfSpreadStart, metrics, renderToken),
      cachedPdfPageCanvas(documentRef, activePdfSpreadStart + 1, metrics, renderToken),
    ]);
    if (renderToken !== pdfRenderToken || documentRef !== activePdfDocument) return;
    paintPdfSurface(slots[0], leftCanvas, activePdfSpreadStart, documentRef);
    paintPdfSurface(slots[1], rightCanvas, activePdfSpreadStart + 1, documentRef);
    const sheet = root.querySelector('.curriculum-pdf-sheet');
    if (sheet) {
      sheet.hidden = true;
      sheet.style.transform = '';
    }
    root.classList.remove('is-rendering-pages', 'is-turning-forward', 'is-turning-backward', 'is-dragging-page');
    root.style.removeProperty('--pdf-turn-progress');
    root.style.removeProperty('--pdf-turn-shadow');
    updatePdfControls(root);
    $('resourceViewerLoading').hidden = true;
    centerPdfStage(root);
    primePdfAdjacentPages(documentRef, metrics, renderToken);
  }
  function setPdfTurnProgress(progress) {
    const root = activePdfRoot();
    const sheet = root?.querySelector('.curriculum-pdf-sheet');
    if (!root || !sheet || !pdfTurnState || pdfTurnState.pending) return;
    const clean = Math.min(1, Math.max(0, Number(progress) || 0));
    pdfTurnState.progress = clean;
    const degrees = (pdfTurnState.direction > 0 ? -180 : 180) * clean;
    sheet.style.transform = `rotateY(${degrees}deg)`;
    root.style.setProperty('--pdf-turn-progress', clean.toFixed(3));
    root.style.setProperty('--pdf-turn-shadow', Math.sin(Math.PI * clean).toFixed(3));
  }
  async function preparePdfTurn(direction, seedState = null) {
    const documentRef = activePdfDocument;
    const root = activePdfRoot();
    if (!documentRef || !root || pdfTurnPreparing) return false;
    if (pdfTurnState && seedState && pdfTurnState !== seedState) return false;
    if (pdfTurnState && !seedState) return false;
    const destinationStart = normalisePdfSpreadStart(activePdfSpreadStart + (direction * 2), documentRef);
    if (destinationStart === activePdfSpreadStart) return false;
    const state = seedState || {
      pending: true,
      direction,
      isDown: false,
      pointerId: null,
      startX: 0,
      lastX: 0,
      startedAt: performance.now(),
      progress: 0,
    };
    state.direction = direction;
    state.destinationStart = destinationStart;
    state.pending = true;
    pdfTurnState = state;
    pdfTurnPreparing = true;
    root.classList.add('is-preparing-turn');
    updatePdfControls(root);
    const renderToken = pdfRenderToken;
    const metrics = sizePdfBook(root);
    if (!metrics) {
      pdfTurnPreparing = false;
      pdfTurnState = null;
      root.classList.remove('is-preparing-turn');
      updatePdfControls(root);
      return false;
    }
    const currentPages = [activePdfSpreadStart, activePdfSpreadStart + 1];
    const destinationPages = [destinationStart, destinationStart + 1];
    const neededPages = [...new Set([...currentPages, ...destinationPages])];
    const canvases = new Map();
    try {
      await Promise.all(neededPages.map(async (pageNumber) => {
        canvases.set(pageNumber, await cachedPdfPageCanvas(documentRef, pageNumber, metrics, renderToken));
      }));
    } catch (error) {
      if (pdfTurnState === state) pdfTurnState = null;
      pdfTurnPreparing = false;
      root.classList.remove('is-preparing-turn');
      updatePdfControls(root);
      throw error;
    }
    if (renderToken !== pdfRenderToken || documentRef !== activePdfDocument || pdfTurnState !== state) {
      pdfTurnPreparing = false;
      root.classList.remove('is-preparing-turn');
      return false;
    }
    const basePages = root.querySelectorAll('.curriculum-pdf-page--base');
    const sheet = root.querySelector('.curriculum-pdf-sheet');
    const front = sheet?.querySelector('.curriculum-pdf-sheet__front');
    const back = sheet?.querySelector('.curriculum-pdf-sheet__back');
    if (basePages.length < 2 || !sheet || !front || !back) {
      pdfTurnState = null;
      pdfTurnPreparing = false;
      root.classList.remove('is-preparing-turn');
      updatePdfControls(root);
      return false;
    }
    root.classList.remove('is-preparing-turn', 'is-turning-forward', 'is-turning-backward');
    root.classList.add(direction > 0 ? 'is-turning-forward' : 'is-turning-backward');
    sheet.classList.toggle('curriculum-pdf-sheet--forward', direction > 0);
    sheet.classList.toggle('curriculum-pdf-sheet--backward', direction < 0);
    if (direction > 0) {
      paintPdfSurface(basePages[0], canvases.get(currentPages[0]), currentPages[0], documentRef);
      paintPdfSurface(basePages[1], canvases.get(destinationPages[1]), destinationPages[1], documentRef);
      paintPdfSurface(front, canvases.get(currentPages[1]), currentPages[1], documentRef);
      paintPdfSurface(back, canvases.get(destinationPages[0]), destinationPages[0], documentRef);
    } else {
      paintPdfSurface(basePages[0], canvases.get(destinationPages[0]), destinationPages[0], documentRef);
      paintPdfSurface(basePages[1], canvases.get(currentPages[1]), currentPages[1], documentRef);
      paintPdfSurface(front, canvases.get(currentPages[0]), currentPages[0], documentRef);
      paintPdfSurface(back, canvases.get(destinationPages[1]), destinationPages[1], documentRef);
    }
    sheet.hidden = false;
    state.pending = false;
    state.metrics = metrics;
    state.canvases = canvases;
    pdfTurnPreparing = false;
    updatePdfControls(root);
    setPdfTurnProgress(state.progress || 0);
    return true;
  }
  function finishPdfTurn(commit) {
    const state = pdfTurnState;
    const documentRef = activePdfDocument;
    const root = activePdfRoot();
    if (!state || state.pending || !documentRef || !root) return;
    const destinationStart = commit ? state.destinationStart : activePdfSpreadStart;
    const basePages = root.querySelectorAll('.curriculum-pdf-page--base');
    paintPdfSurface(basePages[0], state.canvases.get(destinationStart), destinationStart, documentRef);
    paintPdfSurface(basePages[1], state.canvases.get(destinationStart + 1), destinationStart + 1, documentRef);
    if (commit) activePdfSpreadStart = destinationStart;
    const sheet = root.querySelector('.curriculum-pdf-sheet');
    if (sheet) {
      sheet.hidden = true;
      sheet.style.transform = '';
    }
    root.classList.remove('is-preparing-turn', 'is-turning-forward', 'is-turning-backward', 'is-dragging-page');
    root.style.removeProperty('--pdf-turn-progress');
    root.style.removeProperty('--pdf-turn-shadow');
    pdfTurnState = null;
    pdfTurnPreparing = false;
    updatePdfControls(root);
    const metrics = sizePdfBook(root);
    if (metrics) primePdfAdjacentPages(documentRef, metrics, pdfRenderToken);
  }
  function animatePdfTurn(target, forceCommit = target > .5) {
    const state = pdfTurnState;
    if (!state || state.pending) return;
    window.cancelAnimationFrame(pdfTurnFrame);
    const from = Number(state.progress || 0);
    const to = Math.min(1, Math.max(0, target));
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const duration = reduceMotion ? 0 : Math.max(120, Math.abs(to - from) * 430);
    const startedAt = performance.now();
    const tick = (now) => {
      if (pdfTurnState !== state) return;
      const elapsed = duration ? Math.min(1, (now - startedAt) / duration) : 1;
      const eased = 1 - ((1 - elapsed) ** 3);
      setPdfTurnProgress(from + ((to - from) * eased));
      if (elapsed < 1) pdfTurnFrame = window.requestAnimationFrame(tick);
      else {
        pdfTurnFrame = 0;
        finishPdfTurn(forceCommit);
      }
    };
    pdfTurnFrame = window.requestAnimationFrame(tick);
  }
  async function turnPdfSpread(direction) {
    if (!activePdfDocument || pdfTurnState || pdfTurnPreparing) return;
    const prepared = await preparePdfTurn(direction);
    if (prepared) animatePdfTurn(1, true);
  }
  function updatePdfDrag(clientX) {
    const state = pdfTurnState;
    const root = activePdfRoot();
    const book = root?.querySelector('.curriculum-pdf-book');
    if (!state || !book) return;
    state.lastX = clientX;
    if (state.pending) return;
    const width = Math.max(260, book.getBoundingClientRect().width);
    const distance = state.direction > 0 ? state.startX - clientX : clientX - state.startX;
    setPdfTurnProgress(distance / (width * .52));
  }
  function shouldCommitPdfGesture(state) {
    if (!state) return false;
    const releasedAt = Number(state.releasedAt || performance.now());
    const elapsed = Math.max(1, releasedAt - state.startedAt);
    const directionDistance = state.direction > 0 ? state.startX - state.lastX : state.lastX - state.startX;
    const fastFlick = elapsed < 420 && directionDistance > 46;
    const pageClick = elapsed < 360 && Math.abs(state.lastX - state.startX) < 12;
    return state.progress >= .18 || fastFlick || pageClick;
  }
  async function handlePdfPointerDown(event) {
    if (event.button !== 0 || event.isPrimary === false || pdfTurnState || pdfTurnPreparing || !activePdfDocument) return;
    const root = activePdfRoot();
    const book = root?.querySelector('.curriculum-pdf-book');
    if (!root || !book) return;
    const rect = book.getBoundingClientRect();
    const direction = event.clientX >= rect.left + (rect.width / 2) ? 1 : -1;
    if ((direction > 0 && activePdfSpreadStart + 1 >= activePdfDocument.numPages) || (direction < 0 && activePdfSpreadStart <= 1)) return;
    event.preventDefault();
    try { book.setPointerCapture(event.pointerId); } catch {}
    const seedState = {
      pending: true,
      direction,
      isDown: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      startedAt: performance.now(),
      progress: 0,
    };
    pdfTurnState = seedState;
    root.classList.add('is-dragging-page');
    try {
      const prepared = await preparePdfTurn(direction, seedState);
      if (!prepared || pdfTurnState !== seedState) return;
      updatePdfDrag(seedState.lastX);
      if (!seedState.isDown) {
        const commit = shouldCommitPdfGesture(seedState);
        animatePdfTurn(commit ? 1 : 0, commit);
      }
    } catch (error) {
      console.error('PDF page turn preparation failed:', error);
      if (pdfTurnState === seedState) pdfTurnState = null;
      pdfTurnPreparing = false;
      root.classList.remove('is-dragging-page', 'is-preparing-turn');
      updatePdfControls(root);
    }
  }
  function handlePdfPointerMove(event) {
    const state = pdfTurnState;
    if (!state || state.pointerId !== event.pointerId || !state.isDown) return;
    event.preventDefault();
    updatePdfDrag(event.clientX);
  }
  function handlePdfPointerEnd(event) {
    const state = pdfTurnState;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    state.lastX = event.clientX;
    state.isDown = false;
    state.releasedAt = performance.now();
    updatePdfDrag(event.clientX);
    if (state.pending) return;
    const commit = shouldCommitPdfGesture(state);
    animatePdfTurn(commit ? 1 : 0, commit);
  }
  function setPdfZoom(value) {
    if (!activePdfDocument || pdfTurnState || pdfTurnPreparing) return;
    const next = Math.round(clampPdfZoom(value) * 100) / 100;
    if (Math.abs(next - activePdfZoom) < .001) return;
    activePdfZoom = next;
    updatePdfControls();
    window.clearTimeout(pdfZoomTimer);
    pdfZoomTimer = window.setTimeout(() => {
      pdfPageCache.clear();
      renderPdfSpread().catch((error) => console.error('PDF zoom render failed:', error));
    }, 90);
  }
  function pdfFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }
  function updatePdfFullscreenButton() {
    const root = activePdfRoot();
    const button = root?.querySelector('[data-pdf-fullscreen]');
    if (!button) return;
    const panel = $('resourceViewerModal').querySelector('.curriculum-viewer__panel');
    const active = pdfFullscreenElement() === panel || $('resourceViewerModal').classList.contains('is-fullscreen-fallback');
    button.setAttribute('aria-label', active ? 'Exit full screen' : 'Enter full screen');
    button.setAttribute('title', active ? 'Exit full screen' : 'Full screen');
    button.innerHTML = `<i data-feather="${active ? 'minimize' : 'maximize'}"></i>`;
    icons();
  }
  async function togglePdfFullscreen() {
    const modal = $('resourceViewerModal');
    const panel = modal.querySelector('.curriculum-viewer__panel');
    const active = pdfFullscreenElement();
    const fallbackActive = modal.classList.contains('is-fullscreen-fallback');
    try {
      if (active) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
      } else if (fallbackActive) {
        modal.classList.remove('is-fullscreen-fallback');
      } else {
        const request = panel.requestFullscreen || panel.webkitRequestFullscreen;
        if (request) await request.call(panel);
        else modal.classList.toggle('is-fullscreen-fallback');
      }
    } catch {
      modal.classList.toggle('is-fullscreen-fallback');
    }
    updatePdfFullscreenButton();
    window.setTimeout(() => renderPdfSpread().catch(() => {}), 120);
  }
  async function loadPdfDocument(pdfjs, streamUrl, token) {
    let networkError = null;
    let networkTask = null;
    try {
      networkTask = pdfjs.getDocument({
        url: streamUrl,
        withCredentials: true,
        rangeChunkSize: 1024 * 1024,
        disableAutoFetch: true,
        disableRange: false,
        disableStream: true,
        isEvalSupported: false,
      });
      networkTask.onProgress = () => {
        if (token !== viewerLoadToken || activePdfDocument) return;
        const label = $('resourceViewerLoading').querySelector('b');
        if (label) label.textContent = 'Opening the first two pages…';
      };
      activePdfLoadingTask = networkTask;
      return { documentRef: await networkTask.promise, loadingTask: networkTask };
    } catch (error) {
      networkError = error;
      if (activePdfLoadingTask === networkTask) activePdfLoadingTask = null;
      try { await networkTask?.destroy?.(); } catch {}
    }
    if (token !== viewerLoadToken) throw networkError;
    const response = await fetch(streamUrl, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/pdf' },
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw networkError || new Error(`PDF request failed with status ${response.status}.`);
    const data = new Uint8Array(await response.arrayBuffer());
    if (!data.length) throw networkError || new Error('The PDF is empty.');
    const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false });
    activePdfLoadingTask = loadingTask;
    try {
      return { documentRef: await loadingTask.promise, loadingTask };
    } catch (error) {
      if (activePdfLoadingTask === loadingTask) activePdfLoadingTask = null;
      try { await loadingTask.destroy?.(); } catch {}
      throw error || networkError;
    }
  }

  function loadFastPreviewImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.alt = 'Fast PDF page preview';
      image.draggable = false;
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('load', () => resolve(image), { once: true });
      image.addEventListener('error', () => reject(new Error('Fast preview page is not available.')), { once: true });
      image.src = url;
    });
  }

  async function showPdfFastPreview(ticket, token) {
    const urls = Array.isArray(ticket?.previewUrls) ? ticket.previewUrls.slice(0, 2).filter(Boolean) : [];
    if (!urls.length) return false;
    const results = await Promise.allSettled(urls.map((url) => loadFastPreviewImage(url)));
    if (token !== viewerLoadToken || activePdfDocument) return false;
    const images = results.map((result) => result.status === 'fulfilled' ? result.value : null);
    if (!images.some(Boolean)) return false;
    const content = $('resourceViewerContent');
    content.innerHTML = `<section class="curriculum-pdf-reader curriculum-pdf-reader--fast-preview" aria-label="Fast preview of the first two PDF pages" aria-busy="true">
      <div class="curriculum-pdf-reader__viewport">
        <div class="curriculum-pdf-reader__stage">
          <div class="curriculum-pdf-reader__canvas">
            <div class="curriculum-pdf-book" role="img" aria-label="First two pages of the book">
              <div class="curriculum-pdf-page curriculum-pdf-page--left" data-fast-preview-page="1"><span class="curriculum-pdf-page__number">1</span></div>
              <div class="curriculum-pdf-page curriculum-pdf-page--right" data-fast-preview-page="2"><span class="curriculum-pdf-page__number">2</span></div>
              <span class="curriculum-pdf-book__spine" aria-hidden="true"></span>
            </div>
          </div>
        </div>
      </div>
      <div class="curriculum-pdf-quick-status"><span class="curriculum-pdf-quick-status__spinner"></span><b>First pages ready</b><span>Loading the interactive book in the background…</span></div>
    </section>`;
    const root = content.querySelector('.curriculum-pdf-reader');
    root.querySelectorAll('[data-fast-preview-page]').forEach((slot, index) => {
      const image = images[index];
      if (image) slot.insertBefore(image, slot.firstChild);
      else slot.classList.add('is-blank');
    });
    activePdfZoom = 1;
    sizePdfBook(root);
    window.requestAnimationFrame(() => centerPdfStage(root));
    $('resourceViewerLoading').hidden = true;
    return true;
  }

  async function renderPdfBook(streamUrl, ticket, token) {
    const content = $('resourceViewerContent');
    setViewerStatus('Opening the first two pages…');
    showPdfFastPreview(ticket, token).catch(() => false);
    const pdfjs = await loadPdfJs();
    if (token !== viewerLoadToken) return;
    const { documentRef, loadingTask } = await loadPdfDocument(pdfjs, streamUrl, token);
    if (token !== viewerLoadToken) {
      if (activePdfLoadingTask === loadingTask) activePdfLoadingTask = null;
      try { await loadingTask?.destroy?.(); } catch {}
      return;
    }
    activePdfDocument = documentRef;
    activePdfSpreadStart = 1;
    activePdfZoom = 1;
    pdfPageCache.clear();
    const fastPreviewRoot = content.querySelector('.curriculum-pdf-reader--fast-preview');
    if (fastPreviewRoot) {
      const fastMetrics = sizePdfBook(fastPreviewRoot);
      const warmToken = ++pdfRenderToken;
      if (fastMetrics) {
        try {
          await Promise.all([
            cachedPdfPageCanvas(documentRef, 1, fastMetrics, warmToken),
            cachedPdfPageCanvas(documentRef, 2, fastMetrics, warmToken),
          ]);
        } catch {}
      }
      if (token !== viewerLoadToken || documentRef !== activePdfDocument) return;
    }
    content.innerHTML = `<section class="curriculum-pdf-reader" aria-label="Open book PDF viewer">
      <div class="curriculum-pdf-reader__viewport">
        <div class="curriculum-pdf-reader__stage">
          <div class="curriculum-pdf-reader__canvas">
            <div class="curriculum-pdf-book" role="group" aria-label="Two-page PDF spread. Drag a page with the mouse to turn it.">
              <div class="curriculum-pdf-page curriculum-pdf-page--base curriculum-pdf-page--left"><canvas aria-label="Left PDF page"></canvas><span class="curriculum-pdf-page__number"></span></div>
              <div class="curriculum-pdf-page curriculum-pdf-page--base curriculum-pdf-page--right"><canvas aria-label="Right PDF page"></canvas><span class="curriculum-pdf-page__number"></span></div>
              <div class="curriculum-pdf-sheet" hidden aria-hidden="true">
                <div class="curriculum-pdf-sheet__face curriculum-pdf-sheet__front"><canvas></canvas><span class="curriculum-pdf-page__number"></span></div>
                <div class="curriculum-pdf-sheet__face curriculum-pdf-sheet__back"><canvas></canvas><span class="curriculum-pdf-page__number"></span></div>
                <span class="curriculum-pdf-sheet__shade"></span>
              </div>
              <span class="curriculum-pdf-book__spine" aria-hidden="true"></span>
            </div>
          </div>
        </div>
        <button type="button" class="curriculum-pdf-edge-turn curriculum-pdf-edge-turn--previous" data-pdf-prev aria-label="Previous two pages"><i data-feather="chevron-left"></i></button>
        <button type="button" class="curriculum-pdf-edge-turn curriculum-pdf-edge-turn--next" data-pdf-next aria-label="Next two pages"><i data-feather="chevron-right"></i></button>
        <span class="curriculum-pdf-drag-hint"><i data-feather="move"></i> Drag a page to turn</span>
      </div>
      <div class="curriculum-pdf-tools" role="toolbar" aria-label="Book controls">
        <div class="curriculum-pdf-tools__group" aria-label="Zoom controls">
          <button type="button" data-pdf-zoom-out aria-label="Zoom out" title="Zoom out"><i data-feather="zoom-out"></i></button>
          <span class="curriculum-pdf-tools__zoom" data-pdf-zoom-value>100%</span>
          <button type="button" data-pdf-zoom-in aria-label="Zoom in" title="Zoom in"><i data-feather="zoom-in"></i></button>
        </div>
        <div class="curriculum-pdf-tools__group curriculum-pdf-tools__navigation" aria-label="Page navigation">
          <button type="button" data-pdf-prev aria-label="Previous two pages" title="Previous pages"><i data-feather="arrow-left"></i></button>
          <span class="curriculum-pdf-tools__counter"><strong data-pdf-range>1–2</strong><span>/</span><strong data-pdf-total>${documentRef.numPages}</strong></span>
          <button type="button" data-pdf-next aria-label="Next two pages" title="Next pages"><i data-feather="arrow-right"></i></button>
        </div>
        <button type="button" class="curriculum-pdf-tools__fullscreen" data-pdf-fullscreen aria-label="Enter full screen" title="Full screen"><i data-feather="maximize"></i></button>
      </div>
    </section>`;
    const root = content.querySelector('.curriculum-pdf-reader');
    root.querySelectorAll('[data-pdf-prev]').forEach((button) => button.addEventListener('click', () => turnPdfSpread(-1)));
    root.querySelectorAll('[data-pdf-next]').forEach((button) => button.addEventListener('click', () => turnPdfSpread(1)));
    root.querySelector('[data-pdf-zoom-out]').addEventListener('click', () => setPdfZoom(activePdfZoom - PDF_ZOOM_STEP));
    root.querySelector('[data-pdf-zoom-in]').addEventListener('click', () => setPdfZoom(activePdfZoom + PDF_ZOOM_STEP));
    root.querySelector('[data-pdf-fullscreen]').addEventListener('click', togglePdfFullscreen);
    const book = root.querySelector('.curriculum-pdf-book');
    book.addEventListener('pointerdown', handlePdfPointerDown);
    book.addEventListener('pointermove', handlePdfPointerMove);
    book.addEventListener('pointerup', handlePdfPointerEnd);
    book.addEventListener('pointercancel', handlePdfPointerEnd);
    icons();
    await renderPdfSpread();
  }
  async function renderProtectedPreview(ticket, token) {
    if (token !== viewerLoadToken) return;
    const content = $('resourceViewerContent');
    const kind = String(ticket?.previewKind || 'unsupported');
    const streamUrl = String(ticket?.streamUrl || '');
    content.innerHTML = '';
    if (kind === 'unsupported' || !streamUrl) {
      setViewerStatus(ticket?.message || 'This file format cannot be previewed safely in the browser. Replace it with PDF, image, video, audio, or text to keep it view-only.', 'error');
      return;
    }

    const markReady = () => {
      if (token === viewerLoadToken) $('resourceViewerLoading').hidden = true;
    };
    const markFailed = () => {
      if (token === viewerLoadToken) setViewerStatus('The protected preview could not be loaded. Please try again.', 'error');
    };

    if (kind === 'image') {
      const image = document.createElement('img');
      image.alt = ticket.name || 'Protected curriculum file';
      image.draggable = false;
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('load', markReady, { once: true });
      image.addEventListener('error', markFailed, { once: true });
      image.src = streamUrl;
      content.appendChild(image);
      return;
    }
    if (kind === 'video') {
      const video = document.createElement('video');
      video.controls = true;
      video.autoplay = false;
      video.preload = 'metadata';
      video.disablePictureInPicture = true;
      video.setAttribute('controlsList', 'nodownload noremoteplayback nofullscreen');
      video.setAttribute('disableRemotePlayback', '');
      video.addEventListener('loadedmetadata', markReady, { once: true });
      video.addEventListener('error', markFailed, { once: true });
      video.src = streamUrl;
      content.appendChild(video);
      return;
    }
    if (kind === 'audio') {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'metadata';
      audio.setAttribute('controlsList', 'nodownload noremoteplayback');
      audio.setAttribute('disableRemotePlayback', '');
      audio.addEventListener('loadedmetadata', markReady, { once: true });
      audio.addEventListener('error', markFailed, { once: true });
      audio.src = streamUrl;
      content.appendChild(audio);
      return;
    }
    if (kind === 'text') {
      try {
        const response = await fetch(streamUrl, { credentials: 'include', cache: 'no-store', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error('Preview request failed.');
        const body = await response.text();
        if (token !== viewerLoadToken) return;
        const pre = document.createElement('pre');
        pre.className = 'curriculum-viewer__text';
        pre.textContent = body;
        content.appendChild(pre);
        markReady();
      } catch {
        markFailed();
      }
      return;
    }
    if (kind === 'pdf') {
      try {
        await renderPdfBook(streamUrl, ticket, token);
      } catch (error) {
        console.error('PDF preview failed:', error);
        markFailed();
      }
      return;
    }
    markFailed();
  }
  async function openResourceViewer(id) {
    const cleanId = String(id || '');
    const item = resourceItems.get(cleanId);
    if (!item) return;
    closeActionMenus();
    const config = TYPES[item.resource_type] || { label: 'File', icon: 'file-text' };
    const token = ++viewerLoadToken;
    $('resourceViewerTitle').textContent = item.name || item.file_name || 'File preview';
    $('resourceViewerType').textContent = `${config.label} · Protected preview`;
    $('resourceViewerIcon').innerHTML = `<i data-feather="${config.icon}"></i>`;
    $('resourceViewerModal').hidden = false;
    document.body.classList.add('curriculum-viewer-open');
    $('resourceViewerContent').innerHTML = '';
    fillViewerWatermark('Confidential · Authorized preview');
    setViewerStatus('Preparing protected preview…');
    icons();
    try {
      const data = await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades/${encodeURIComponent(currentGradeId)}/resources/${encodeURIComponent(cleanId)}/view-ticket`);
      if (token !== viewerLoadToken) return;
      const ticket = data.preview || {};
      fillViewerWatermark(`${ticket.viewerName || 'Authorized user'} · Confidential`);
      await renderProtectedPreview(ticket, token);
    } catch (error) {
      if (token === viewerLoadToken) setViewerStatus(error.message || 'Unable to prepare the protected preview.', 'error');
    }
  }
  async function deleteResource(id) {
    const item = resourceItems.get(String(id || ''));
    const name = item?.name || 'this curriculum file';
    const message = `You’re going to permanently delete “${name}”. The uploaded file will also be removed from protected storage.`;
    const confirmed = window.OpsDeleteConfirm
      ? await window.OpsDeleteConfirm.confirm({ title: 'Delete curriculum file?', itemType: 'curriculum file', itemName: name, message })
      : window.confirm(`Delete “${name}”? This action cannot be undone.`);
    if (!confirmed) return;
    try { await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades/${encodeURIComponent(currentGradeId)}/resources/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadGrade(); }
    catch (error) { alert(error.message); }
  }
  async function requestCurriculumGroupDeleteConfirmation(item) {
    const name = item?.name || 'this curriculum';
    const message = `You’re going to permanently delete “${name}”, including every theme, grade, and file inside it. Uploaded files will also be removed from Supabase Storage.`;
    return window.OpsDeleteConfirm
      ? window.OpsDeleteConfirm.confirm({ title: 'Delete curriculum?', itemType: 'curriculum', itemName: name, message })
      : window.confirm(`Delete “${name}” and everything inside it? This action cannot be undone.`);
  }
  async function deleteCurriculumGroup(id) {
    const cleanId = String(id || '');
    const item = curriculumGroupItems.get(cleanId);
    if (!cleanId || !item) return;
    const confirmed = await requestCurriculumGroupDeleteConfirmation(item);
    if (!confirmed) return;
    try {
      await jsonFetch(`/api/lms/curriculum/groups/${encodeURIComponent(cleanId)}`, { method: 'DELETE' });
      await loadCurriculumGroups();
    } catch (error) {
      alert(error.message);
    }
  }
  async function requestFolderDeleteConfirmation(kind, item) {
    const isTheme = kind === 'theme';
    const label = isTheme ? 'theme' : 'grade';
    const name = item?.name || `this ${label}`;
    const message = isTheme
      ? `You’re going to permanently delete “${name}”, including every grade and file inside it. Uploaded files will also be removed from Supabase Storage.`
      : `You’re going to permanently delete “${name}” and every file inside it. Uploaded files will also be removed from Supabase Storage.`;
    return window.OpsDeleteConfirm
      ? window.OpsDeleteConfirm.confirm({ title: `Delete ${label} folder?`, itemType: `${label} folder`, itemName: name, message })
      : window.confirm(`Delete “${name}”? This action cannot be undone.`);
  }
  async function deleteFolder(kind, id) {
    const cleanKind = kind === 'theme' ? 'theme' : kind === 'grade' ? 'grade' : '';
    const cleanId = String(id || '');
    const item = folderItems[cleanKind]?.get(cleanId);
    if (!cleanKind || !cleanId || !item) return;
    const confirmed = await requestFolderDeleteConfirmation(cleanKind, item);
    if (!confirmed) return;
    try {
      if (cleanKind === 'theme') {
        await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(cleanId)}`, { method: 'DELETE' });
        await loadCurriculumGroups();
      } else {
        await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades/${encodeURIComponent(cleanId)}`, { method: 'DELETE' });
        await loadTheme();
      }
    } catch (error) {
      alert(error.message);
    }
  }
  function parseRoute() {
    const parts = location.pathname.split('/').filter(Boolean);
    currentThemeId = parts[2] || '';
    currentGradeId = parts[3] === 'grade' ? (parts[4] || '') : '';
  }

  $('addCurriculumBtn').addEventListener('click', openCurriculumModal);
  $('addGradeBtn').addEventListener('click', openGradeModal);
  $('saveCurriculumBtn').addEventListener('click', saveCurriculum);
  $('saveThemeBtn').addEventListener('click', saveTheme);
  $('saveGradeBtn').addEventListener('click', saveGrade);
  $('saveResourceBtn').addEventListener('click', saveResource);
  $('resourceFileInput').addEventListener('change', (event) => chooseResourceFile(event.target.files?.[0] || null));
  $('backToCurriculaBtn').addEventListener('click', backToThemes);
  $('backToGradesBtn').addEventListener('click', backToGrades);
  document.querySelectorAll('[data-curriculum-close]').forEach((item) => item.addEventListener('click', closeCurriculumModal));
  document.querySelectorAll('[data-theme-close]').forEach((item) => item.addEventListener('click', closeThemeModal));
  document.querySelectorAll('[data-grade-close]').forEach((item) => item.addEventListener('click', closeGradeModal));
  document.querySelectorAll('[data-resource-close]').forEach((item) => item.addEventListener('click', closeResourceModal));
  document.querySelectorAll('[data-viewer-close]').forEach((item) => item.addEventListener('click', closeResourceViewer));
  $('closeResourceViewerBtn').addEventListener('click', closeResourceViewer);
  $('resourceViewerStage').addEventListener('contextmenu', (event) => event.preventDefault());
  $('resourceViewerStage').addEventListener('dragstart', (event) => event.preventDefault());
  $('resourceViewerStage').addEventListener('copy', (event) => event.preventDefault());
  window.addEventListener('resize', () => {
    if (!activePdfDocument || $('resourceViewerModal').hidden) return;
    window.clearTimeout(pdfResizeTimer);
    pdfResizeTimer = window.setTimeout(() => renderPdfSpread().catch(() => {}), 140);
  });
  document.addEventListener('fullscreenchange', () => {
    updatePdfFullscreenButton();
    if (!activePdfDocument || $('resourceViewerModal').hidden) return;
    window.clearTimeout(pdfResizeTimer);
    pdfResizeTimer = window.setTimeout(() => renderPdfSpread().catch(() => {}), 140);
  });
  document.addEventListener('webkitfullscreenchange', () => {
    updatePdfFullscreenButton();
    if (!activePdfDocument || $('resourceViewerModal').hidden) return;
    window.clearTimeout(pdfResizeTimer);
    pdfResizeTimer = window.setTimeout(() => renderPdfSpread().catch(() => {}), 140);
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.curriculum-folder-actions') && !event.target.closest('.curriculum-catalog-actions') && !event.target.closest('.curriculum-resource-actions')) closeActionMenus();
  });
  document.addEventListener('keydown', (event) => {
    const viewerOpen = !$('resourceViewerModal').hidden;
    if (event.key === 'Escape') {
      closeActionMenus();
      if (viewerOpen) closeResourceViewer();
      return;
    }
    if (viewerOpen && (event.ctrlKey || event.metaKey) && ['s', 'p', 'u', 'c'].includes(String(event.key || '').toLowerCase())) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (viewerOpen && activePdfDocument && event.key === 'ArrowLeft') {
      event.preventDefault();
      turnPdfSpread(-1);
    }
    if (viewerOpen && activePdfDocument && event.key === 'ArrowRight') {
      event.preventDefault();
      turnPdfSpread(1);
    }
    if (viewerOpen && activePdfDocument && ['+', '='].includes(event.key)) {
      event.preventDefault();
      setPdfZoom(activePdfZoom + PDF_ZOOM_STEP);
    }
    if (viewerOpen && activePdfDocument && event.key === '-') {
      event.preventDefault();
      setPdfZoom(activePdfZoom - PDF_ZOOM_STEP);
    }
    if (viewerOpen && activePdfDocument && event.key === '0') {
      event.preventDefault();
      setPdfZoom(1);
    }
  });
  window.addEventListener('popstate', () => {
    if (!$('resourceViewerModal').hidden) closeResourceViewer();
    parseRoute();
    currentGradeId ? loadGrade().catch((error) => alert(error.message)) : currentThemeId ? loadTheme().catch((error) => alert(error.message)) : backToThemes();
  });

  parseRoute();
  currentGradeId ? loadGrade().catch((error) => { alert(error.message); backToGrades(); }) : currentThemeId ? loadTheme().catch((error) => { alert(error.message); backToThemes(); }) : loadCurriculumGroups().catch(showListError);
  icons();
})();
