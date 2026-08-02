(() => {
  'use strict';

  const TYPES = {
    teacher_guide: { label: 'Teacher Guide', icon: 'book' },
    lesson_plan: { label: 'Lesson Plan', icon: 'clipboard' },
    presentation: { label: 'Presentation', icon: 'monitor' },
    materials: { label: 'Materials', icon: 'package' },
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

  function icons() { if (window.feather) window.feather.replace(); }
  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (!value) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
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
  function folderCard(item, kind) {
    const fallback = kind === 'theme' ? 'Theme folder' : 'Grade folder';
    return `<button class="curriculum-folder-card" data-${kind}-id="${esc(item.id)}"><div class="curriculum-folder-card__visual"><i data-feather="folder"></i></div><div class="curriculum-folder-card__body"><h3>${esc(item.name)}</h3><p>${esc(item.description || fallback)}</p><span><i data-feather="folder-open"></i> Open ${kind}</span></div></button>`;
  }
  function curriculumGroupCard(group) {
    const themes = Array.isArray(group.themes) ? group.themes : [];
    const themeCount = themes.length;
    return `<article class="curriculum-catalog-card" data-curriculum-group-id="${esc(group.id)}">
      <header class="curriculum-catalog-card__header">
        <div class="curriculum-catalog-card__identity">
          <span class="curriculum-catalog-card__icon"><i data-feather="layers"></i></span>
          <div><span class="curriculum-catalog-card__eyebrow">CURRICULUM GROUP</span><h2>${esc(group.name)}</h2><p>${esc(group.description || 'Curriculum group')}</p><span class="curriculum-catalog-card__count">${themeCount} theme${themeCount === 1 ? '' : 's'}</span></div>
        </div>
        <button type="button" class="curriculum-primary-btn curriculum-add-theme-btn" data-add-theme-group-id="${esc(group.id)}" data-add-theme-group-name="${esc(group.name)}"><i data-feather="folder-plus"></i><span>Add New Theme</span></button>
      </header>
      <div class="curriculum-theme-grid">${themes.length ? themes.map((item) => folderCard(item, 'theme')).join('') : `<div class="curriculum-theme-empty"><i data-feather="folder"></i><div><b>No themes yet</b><span>Use Add New Theme to create the first theme in this curriculum.</span></div></div>`}</div>
    </article>`;
  }
  function renderCurriculumGroups(items) {
    const grid = $('curriculumFolderGrid');
    if (!items.length) {
      grid.innerHTML = emptyFolders('No curricula yet', 'Use Add New Curriculum to create the first curriculum group.');
      icons();
      return;
    }
    grid.innerHTML = items.map(curriculumGroupCard).join('');
    grid.querySelectorAll('[data-add-theme-group-id]').forEach((button) => button.addEventListener('click', () => openThemeModal(button.dataset.addThemeGroupId, button.dataset.addThemeGroupName)));
    grid.querySelectorAll('[data-theme-id]').forEach((item) => item.addEventListener('click', () => openTheme(item.dataset.themeId)));
    icons();
  }
  function renderGrades(items) {
    const grid = $('curriculumGradeGrid');
    if (!items.length) {
      grid.innerHTML = emptyFolders('No grades yet', 'Use Add New Grade to create the first grade inside this theme.');
      icons();
      return;
    }
    grid.innerHTML = items.map((item) => folderCard(item, 'grade')).join('');
    grid.querySelectorAll('[data-grade-id]').forEach((item) => item.addEventListener('click', () => openGrade(item.dataset.gradeId)));
    icons();
  }
  async function loadCurriculumGroups() {
    const data = await jsonFetch('/api/lms/curriculum');
    renderCurriculumGroups(data.groups || []);
  }
  function renderGroups(resources) {
    const grouped = {};
    Object.keys(TYPES).forEach((key) => { grouped[key] = []; });
    (resources || []).forEach((item) => { if (grouped[item.resource_type]) grouped[item.resource_type].push(item); });
    $('curriculumGroups').innerHTML = Object.entries(TYPES).map(([key, config]) => `
      <article class="curriculum-group-card">
        <header>
          <div class="curriculum-group-card__title"><span><i data-feather="${config.icon}"></i></span><div><h2>${config.label}</h2><p>${grouped[key].length} file${grouped[key].length === 1 ? '' : 's'}</p></div></div>
          <button class="curriculum-add-file-btn" data-resource-type="${key}"><i data-feather="plus"></i><span>Add ${config.label}</span></button>
        </header>
        <div class="curriculum-file-grid">${grouped[key].length ? grouped[key].map((file) => `
          <article class="curriculum-file-card">
            <div class="curriculum-file-card__icon"><i data-feather="file"></i></div>
            <div class="curriculum-file-card__content"><h3>${esc(file.name)}</h3><p>${esc(file.notes || [file.mime_type, formatBytes(file.file_size)].filter(Boolean).join(' · ') || config.label)}</p><div>${file.resource_url ? `<a href="${esc(file.resource_url)}" target="_blank" rel="noopener"><i data-feather="external-link"></i> Open</a>` : ''}<button data-delete-resource="${esc(file.id)}" aria-label="Delete ${esc(file.name)}"><i data-feather="trash-2"></i></button></div></div>
          </article>`).join('') : `<div class="curriculum-group-empty"><i data-feather="folder"></i><span>No ${config.label.toLowerCase()} files yet</span></div>`}</div>
      </article>`).join('');
    $('curriculumGroups').querySelectorAll('[data-resource-type]').forEach((button) => button.addEventListener('click', () => openResourceModal(button.dataset.resourceType)));
    $('curriculumGroups').querySelectorAll('[data-delete-resource]').forEach((button) => button.addEventListener('click', () => deleteResource(button.dataset.deleteResource)));
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
    $('curriculumThemeDescription').textContent = currentTheme.description || 'Add grades inside this theme.';
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
    $('curriculumGradeDescription').textContent = data.grade.description || `Learning files for ${data.curriculum.name || 'this theme'}.`;
    renderGroups(data.resources || []);
  }
  function backToThemes() { currentThemeId = ''; currentGradeId = ''; history.pushState({}, '', '/lms/curriculum'); showView('list'); $('curriculumPageTitle').textContent = 'Curriculum'; loadCurriculumGroups().catch(showListError); }
  function backToGrades() { currentGradeId = ''; history.pushState({}, '', `/lms/curriculum/${encodeURIComponent(currentThemeId)}`); loadTheme().catch((error) => alert(error.message)); }
  function showListError(error) { $('curriculumFolderGrid').innerHTML = emptyFolders('Unable to load curricula', error.message); icons(); }

  function openCurriculumModal() { $('curriculumModal').hidden = false; $('curriculumModalError').textContent = ''; setTimeout(() => $('curriculumNameInput').focus(), 20); }
  function closeCurriculumModal() { $('curriculumModal').hidden = true; $('curriculumModalError').textContent = ''; }
  function openThemeModal(groupId, groupName) {
    activeCurriculumGroupId = String(groupId || '');
    activeCurriculumGroupName = String(groupName || 'Curriculum');
    $('themeNameInput').value = '';
    $('themeDescriptionInput').value = '';
    $('themeCurriculumTarget').textContent = `Curriculum: ${activeCurriculumGroupName}`;
    $('themeModalError').textContent = '';
    $('themeModal').hidden = false;
    setTimeout(() => $('themeNameInput').focus(), 20);
  }
  function closeThemeModal() {
    $('themeModal').hidden = true;
    $('themeModalError').textContent = '';
    activeCurriculumGroupId = '';
    activeCurriculumGroupName = '';
  }
  function openGradeModal() { $('gradeModal').hidden = false; $('gradeModalError').textContent = ''; setTimeout(() => $('gradeNameInput').focus(), 20); }
  function closeGradeModal() { $('gradeModal').hidden = true; $('gradeModalError').textContent = ''; }

  function resetResourceUploadUi() {
    selectedResourceFile = null;
    resourceUploadPending = false;
    $('resourceFileInput').value = '';
    $('resourceFileInput').disabled = false;
    $('resourceFilePreview').hidden = true;
    $('resourceFilePreview').innerHTML = '';
    $('resourceUploadProgress').hidden = true;
    $('resourceUploadProgress').classList.remove('is-uploading', 'is-success', 'is-failed');
    $('resourceUploadProgressBar').style.width = '0%';
    $('resourceUploadProgressPercent').textContent = '0%';
    $('resourceUploadProgressLabel').innerHTML = '<span class="curriculum-upload-status-icon"><i data-feather="upload-cloud"></i></span><span>Uploading…</span>';
    $('saveResourceBtn').disabled = false;
    $('saveResourceBtn').textContent = 'Upload & Add File';
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
  function renderSelectedFile() {
    const preview = $('resourceFilePreview');
    if (!selectedResourceFile) { preview.hidden = true; preview.innerHTML = ''; return; }
    preview.hidden = false;
    preview.innerHTML = `<span class="curriculum-upload-file__icon"><i data-feather="file-text"></i></span><span class="curriculum-upload-file__info"><b>${esc(selectedResourceFile.name)}</b><small>${esc([selectedResourceFile.type || 'File', formatBytes(selectedResourceFile.size)].filter(Boolean).join(' · '))}</small></span><button id="removeResourceFileBtn" type="button" aria-label="Remove selected file"><i data-feather="trash-2"></i></button>`;
    $('removeResourceFileBtn').addEventListener('click', () => { resetResourceUploadUi(); $('resourceNameInput').value = ''; });
    icons();
  }
  function chooseResourceFile(file) {
    $('resourceModalError').textContent = '';
    $('resourceUploadProgress').hidden = true;
    $('resourceUploadProgress').classList.remove('is-uploading', 'is-success', 'is-failed');
    $('saveResourceBtn').disabled = false;
    $('resourceFileInput').disabled = false;
    if (!file) { resetResourceUploadUi(); return; }
    if (!file.size) { $('resourceModalError').textContent = 'The selected file is empty.'; resetResourceUploadUi(); return; }
    if (file.size > MAX_FILE_BYTES) { $('resourceModalError').textContent = `“${file.name}” is larger than 500 MB.`; resetResourceUploadUi(); return; }
    selectedResourceFile = file;
    if (!$('resourceNameInput').value.trim()) $('resourceNameInput').value = file.name.replace(/\.[^.]+$/, '').slice(0, 240);
    renderSelectedFile();
  }
  function openResourceModal(type) {
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
  function closeResourceModal() {
    if (resourceUploadPending) return;
    $('resourceModal').hidden = true;
    $('resourceModalError').textContent = '';
    activeResourceType = '';
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
          reject(new Error(message));
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

  async function saveCurriculum() {
    const name = $('curriculumNameInput').value.trim();
    if (!name) { $('curriculumModalError').textContent = 'Curriculum name is required.'; return; }
    const button = $('saveCurriculumBtn');
    button.disabled = true;
    try {
      await jsonFetch('/api/lms/curriculum/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: $('curriculumDescriptionInput').value.trim() }) });
      $('curriculumNameInput').value = ''; $('curriculumDescriptionInput').value = ''; closeCurriculumModal(); await loadCurriculumGroups();
    } catch (error) { $('curriculumModalError').textContent = error.message; } finally { button.disabled = false; }
  }
  async function saveTheme() {
    const name = $('themeNameInput').value.trim();
    if (!activeCurriculumGroupId) { $('themeModalError').textContent = 'Choose a curriculum group first.'; return; }
    if (!name) { $('themeModalError').textContent = 'Theme name is required.'; return; }
    const button = $('saveThemeBtn');
    button.disabled = true;
    try {
      const data = await jsonFetch(`/api/lms/curriculum/groups/${encodeURIComponent(activeCurriculumGroupId)}/themes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: $('themeDescriptionInput').value.trim() }) });
      $('themeNameInput').value = ''; $('themeDescriptionInput').value = ''; closeThemeModal(); await loadCurriculumGroups(); if (data.theme?.id) await openTheme(data.theme.id);
    } catch (error) { $('themeModalError').textContent = error.message; } finally { button.disabled = false; }
  }
  async function saveGrade() {
    const name = $('gradeNameInput').value.trim();
    if (!name) { $('gradeModalError').textContent = 'Grade name is required.'; return; }
    const button = $('saveGradeBtn');
    button.disabled = true;
    try {
      const data = await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: $('gradeDescriptionInput').value.trim() }) });
      $('gradeNameInput').value = ''; $('gradeDescriptionInput').value = ''; closeGradeModal(); await loadTheme(); if (data.grade?.id) await openGrade(data.grade.id);
    } catch (error) { $('gradeModalError').textContent = error.message; } finally { button.disabled = false; }
  }
  async function saveResource() {
    const name = $('resourceNameInput').value.trim();
    if (!name) { $('resourceModalError').textContent = 'File name is required.'; return; }
    if (!selectedResourceFile) { $('resourceModalError').textContent = 'Choose a file to upload.'; return; }
    if (selectedResourceFile.size > MAX_FILE_BYTES) { $('resourceModalError').textContent = 'The file must be 500 MB or less.'; return; }
    const button = $('saveResourceBtn');
    resourceUploadPending = true;
    button.disabled = true;
    $('resourceFileInput').disabled = true;
    $('resourceModalError').textContent = '';
    setUploadStatus('uploading', `Preparing ${selectedResourceFile.name}`, 0);
    button.textContent = 'Uploading…';
    try {
      const ticketData = await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades/${encodeURIComponent(currentGradeId)}/upload-ticket`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resourceType: activeResourceType, fileName: selectedResourceFile.name, fileSize: selectedResourceFile.size, mimeType: selectedResourceFile.type || 'application/octet-stream' }),
      });
      const upload = ticketData.upload || {};
      await uploadFileToSignedUrl(upload.signedUrl, selectedResourceFile, (percent) => {
        setUploadStatus('uploading', percent < 100 ? `Uploading ${selectedResourceFile.name}` : 'Finalizing upload…', percent);
      });
      await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades/${encodeURIComponent(currentGradeId)}/resources`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resourceType: activeResourceType, name, resourceUrl: upload.publicUrl, storagePath: upload.path, storageBucket: upload.bucket, fileName: selectedResourceFile.name, fileSize: selectedResourceFile.size, mimeType: selectedResourceFile.type || 'application/octet-stream', notes: $('resourceNotesInput').value.trim() }),
      });
      setUploadStatus('success', `${selectedResourceFile.name} uploaded successfully`, 100);
      button.textContent = 'Uploaded';
      await wait(900);
      resourceUploadPending = false;
      $('resourceModal').hidden = true;
      resetResourceUploadUi();
      $('resourceNameInput').value = '';
      $('resourceNotesInput').value = '';
      activeResourceType = '';
      await loadGrade();
    } catch (error) {
      const message = error.message || 'Failed to upload the file.';
      $('resourceModalError').textContent = message;
      resourceUploadPending = false;
      button.disabled = false;
      button.textContent = 'Try Upload Again';
      $('resourceFileInput').disabled = false;
      setUploadStatus('failed', message, 100);
    }
  }
  async function deleteResource(id) {
    if (!confirm('Delete this curriculum file? This also removes it from Supabase Storage.')) return;
    try { await jsonFetch(`/api/lms/curriculum/${encodeURIComponent(currentThemeId)}/grades/${encodeURIComponent(currentGradeId)}/resources/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadGrade(); }
    catch (error) { alert(error.message); }
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
  window.addEventListener('popstate', () => { parseRoute(); currentGradeId ? loadGrade().catch((error) => alert(error.message)) : currentThemeId ? loadTheme().catch((error) => alert(error.message)) : backToThemes(); });

  parseRoute();
  currentGradeId ? loadGrade().catch((error) => { alert(error.message); backToGrades(); }) : currentThemeId ? loadTheme().catch((error) => { alert(error.message); backToThemes(); }) : loadCurriculumGroups().catch(showListError);
  icons();
})();
