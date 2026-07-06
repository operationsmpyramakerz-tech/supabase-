(() => {
  'use strict';

  const state = {
    fields: [],
    customers: [],
    draft: [],
    activeCustomer: null,
    currentFiles: {},
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function refreshIcons() {
    try { window.feather?.replace?.(); } catch (_) {}
  }

  function message(text, kind = 'info') {
    const safe = String(text || '').trim();
    if (!safe) return;
    if (window.OpsSafeMessage?.show) {
      window.OpsSafeMessage.show(safe, kind);
      return;
    }
    window.alert(safe);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
      ...options,
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || `Request failed (${response.status}).`);
    }
    return payload || {};
  }

  function openOverlay(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    refreshIcons();
  }

  function closeOverlay(kind) {
    const id = kind === 'builder' ? 'b2cBuilderOverlay' : 'b2cCustomerOverlay';
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function fieldTypeLabel(type) {
    return ({ text: 'Text', number: 'Number', phone: 'Phone', files: 'Photos & Files' })[type] || 'Text';
  }

  function setLoading(isLoading) {
    const note = $('#b2cTableNote');
    if (note) note.textContent = isLoading ? 'Loading customer records…' : `${state.customers.length} customer${state.customers.length === 1 ? '' : 's'} in database`;
  }

  function normalizeDraftField(field, index) {
    return {
      id: field.id || '',
      key: field.key || '',
      label: String(field.label || '').trim(),
      type: ['text', 'number', 'phone', 'files'].includes(field.type) ? field.type : 'text',
      required: !!field.required,
      sortOrder: index + 1,
      original: field.original || null,
    };
  }

  function currentSearch() {
    return String($('#b2cCustomerSearch')?.value || '').trim().toLowerCase();
  }

  function isImageFile(file) {
    return /^image\//i.test(String(file?.type || '')) || /\.(png|jpe?g|gif|webp|svg)$/i.test(String(file?.name || ''));
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function stringifyCustomer(customer) {
    const values = customer?.values || {};
    return [customer?.customerCode, customer?.createdByName, ...state.fields.flatMap((field) => {
      const value = values[field.key];
      if (Array.isArray(value)) return value.map((file) => `${file.name || ''} ${file.url || ''}`);
      return value == null ? '' : String(value);
    })].join(' ').toLowerCase();
  }

  function displayValue(value, field) {
    if (field.type === 'files') {
      const files = Array.isArray(value) ? value : [];
      if (!files.length) return '<span class="b2c-cell-muted">—</span>';
      return `<div class="b2c-file-pills">${files.slice(0, 4).map((file) => `
        <a class="b2c-file-pill" target="_blank" rel="noopener" href="${escapeHtml(file.url || '#')}">
          <i data-feather="${isImageFile(file) ? 'image' : 'paperclip'}"></i><span>${escapeHtml(file.name || 'Attachment')}</span>
        </a>`).join('')}${files.length > 4 ? `<span class="b2c-cell-muted">+${files.length - 4}</span>` : ''}</div>`;
    }
    if (value === '' || value == null) return '<span class="b2c-cell-muted">—</span>';
    if (field.type === 'number' && Number.isFinite(Number(value))) return `<span class="b2c-cell-text">${escapeHtml(new Intl.NumberFormat().format(Number(value)))}</span>`;
    if (field.type === 'phone') {
      const phone = String(value);
      return `<a class="b2c-cell-text" href="tel:${escapeHtml(phone.replace(/[^+0-9]/g, ''))}">${escapeHtml(phone)}</a>`;
    }
    return `<span class="b2c-cell-text" title="${escapeHtml(String(value))}">${escapeHtml(value)}</span>`;
  }

  function renderTable() {
    const head = $('#b2cCustomerTableHead');
    const body = $('#b2cCustomerTableBody');
    const note = $('#b2cTableNote');
    if (!head || !body) return;

    const search = currentSearch();
    const customers = search ? state.customers.filter((customer) => stringifyCustomer(customer).includes(search)) : state.customers;
    head.innerHTML = `<tr><th>Customer</th>${state.fields.map((field) => `<th>${escapeHtml(field.label)}</th>`).join('')}<th>Submitted by</th><th>Created</th><th aria-label="Actions"></th></tr>`;

    if (!state.fields.length) {
      body.innerHTML = '<tr><td class="b2c-table-empty" colspan="5">No database columns have been configured. Select <strong>Configure Database</strong> to build the customer table.</td></tr>';
      if (note) note.textContent = 'Configure columns to start';
      refreshIcons();
      return;
    }
    if (!customers.length) {
      body.innerHTML = `<tr><td class="b2c-table-empty" colspan="${state.fields.length + 4}">${search ? 'No customers match your search.' : 'No customer records yet. Customer Care can use the Customer Form to add the first record.'}</td></tr>`;
      if (note) note.textContent = search ? '0 matching customers' : '0 customers in database';
      refreshIcons();
      return;
    }

    body.innerHTML = customers.map((customer) => `
      <tr>
        <td><span class="b2c-customer-code">${escapeHtml(customer.customerCode || `CUS-${customer.id}`)}</span></td>
        ${state.fields.map((field) => `<td>${displayValue((customer.values || {})[field.key], field)}</td>`).join('')}
        <td>${escapeHtml(customer.createdByName || '—')}</td>
        <td class="b2c-cell-muted">${escapeHtml(formatDate(customer.createdAt))}</td>
        <td><div class="b2c-table-actions">
          <button class="b2c-icon-btn" type="button" data-customer-action="edit" data-customer-id="${escapeHtml(customer.id)}" title="Edit customer"><i data-feather="edit-2"></i></button>
          <button class="b2c-icon-btn b2c-icon-btn--danger" type="button" data-customer-action="delete" data-customer-id="${escapeHtml(customer.id)}" title="Delete customer"><i data-feather="trash-2"></i></button>
        </div></td>
      </tr>`).join('');
    if (note) note.textContent = `${customers.length}${search ? ` of ${state.customers.length}` : ''} customer${customers.length === 1 ? '' : 's'} shown`;
    refreshIcons();
  }

  function renderStats() {
    $('#b2cCustomerCount')?.replaceChildren(document.createTextNode(String(state.customers.length)));
    $('#b2cFieldCount')?.replaceChildren(document.createTextNode(String(state.fields.length)));
    $('#b2cFileFieldCount')?.replaceChildren(document.createTextNode(String(state.fields.filter((field) => field.type === 'files').length)));
  }

  async function loadDatabase() {
    let loaded = false;
    setLoading(true);
    try {
      const payload = await api('/api/b2c/customers');
      state.fields = Array.isArray(payload.fields) ? payload.fields : [];
      state.customers = Array.isArray(payload.customers) ? payload.customers : [];
      renderStats();
      renderTable();
      loaded = true;
    } catch (error) {
      const body = $('#b2cCustomerTableBody');
      if (body) body.innerHTML = `<tr><td class="b2c-table-empty" colspan="4">${escapeHtml(error.message || 'Failed to load customer database.')}</td></tr>`;
      $('#b2cTableNote')?.replaceChildren(document.createTextNode('Could not load database'));
      message(error.message || 'Failed to load customer database.', 'error');
    } finally {
      if (loaded) setLoading(false);
      refreshIcons();
    }
  }

  function renderBuilder() {
    const list = $('#b2cBuilderList');
    if (!list) return;
    if (!state.draft.length) {
      list.innerHTML = '<div class="b2c-builder-empty">No columns yet. Add your first customer field below.</div>';
      refreshIcons();
      return;
    }
    list.innerHTML = state.draft.map((field, index) => `
      <article class="b2c-column-card" data-draft-index="${index}">
        <span class="b2c-column-order">${index + 1}</span>
        <div class="b2c-field-control"><label>Column name</label><input type="text" data-draft-label="${index}" maxlength="120" value="${escapeHtml(field.label)}" placeholder="e.g. Customer name" /></div>
        <div class="b2c-field-control"><label>Type</label><select data-draft-type="${index}">
          ${['text', 'number', 'phone', 'files'].map((type) => `<option value="${type}" ${field.type === type ? 'selected' : ''}>${fieldTypeLabel(type)}</option>`).join('')}
        </select></div>
        <label class="b2c-field-required"><input type="checkbox" data-draft-required="${index}" ${field.required ? 'checked' : ''} /> Required</label>
        <div class="b2c-column-move"><button type="button" data-draft-move="up" data-draft-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="Move up"><i data-feather="arrow-up"></i></button><button type="button" data-draft-move="down" data-draft-index="${index}" ${index === state.draft.length - 1 ? 'disabled' : ''} aria-label="Move down"><i data-feather="arrow-down"></i></button></div>
        <button type="button" class="b2c-column-delete" data-draft-delete="${index}" aria-label="Remove column"><i data-feather="trash-2"></i></button>
      </article>`).join('');
    refreshIcons();
  }

  function readBuilderControls() {
    $$('.b2c-column-card').forEach((card) => {
      const index = Number(card.dataset.draftIndex);
      if (!Number.isInteger(index) || !state.draft[index]) return;
      const label = $(`[data-draft-label="${index}"]`, card);
      const type = $(`[data-draft-type="${index}"]`, card);
      const required = $(`[data-draft-required="${index}"]`, card);
      state.draft[index].label = String(label?.value || '').trim();
      state.draft[index].type = String(type?.value || 'text');
      state.draft[index].required = !!required?.checked;
    });
  }

  function openBuilder() {
    state.draft = state.fields.map((field, index) => normalizeDraftField({ ...field, original: { ...field } }, index));
    $('#b2cBuilderError')?.setAttribute('hidden', '');
    renderBuilder();
    openOverlay('b2cBuilderOverlay');
  }

  function builderError(text = '') {
    const box = $('#b2cBuilderError');
    if (!box) return;
    if (!text) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    box.textContent = text;
  }

  async function saveBuilder() {
    readBuilderControls();
    const normalized = state.draft.map((field, index) => normalizeDraftField(field, index));
    const labels = normalized.map((field) => field.label.toLowerCase());
    if (normalized.some((field) => !field.label)) return builderError('Every column needs a name.');
    if (new Set(labels).size !== labels.length) return builderError('Column names must be unique.');
    builderError('');

    const button = $('#b2cSaveBuilderBtn');
    const oldHtml = button?.innerHTML;
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      const oldById = new Map(state.fields.filter((field) => field.id).map((field) => [String(field.id), field]));
      const draftIds = new Set(normalized.filter((field) => field.id).map((field) => String(field.id)));
      for (const field of state.fields) {
        if (field.id && !draftIds.has(String(field.id))) await api(`/api/b2c/fields/${encodeURIComponent(field.id)}`, { method: 'DELETE' });
      }
      for (const [index, field] of normalized.entries()) {
        const payload = { label: field.label, type: field.type, required: field.required, sortOrder: index + 1 };
        const old = oldById.get(String(field.id));
        if (!field.id) {
          await api('/api/b2c/fields', { method: 'POST', body: JSON.stringify(payload) });
        } else if (!old || old.label !== field.label || old.type !== field.type || !!old.required !== !!field.required || Number(old.sortOrder) !== index + 1) {
          await api(`/api/b2c/fields/${encodeURIComponent(field.id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
        }
      }
      closeOverlay('builder');
      await loadDatabase();
      message('Customer database layout saved.', 'success');
    } catch (error) {
      builderError(error.message || 'Could not save customer columns.');
    } finally {
      if (button) { button.disabled = false; button.innerHTML = oldHtml; refreshIcons(); }
    }
  }

  function fileEntryHtml(file) {
    return `<a class="b2c-file-pill" target="_blank" rel="noopener" href="${escapeHtml(file.url || '#')}"><i data-feather="${isImageFile(file) ? 'image' : 'paperclip'}"></i><span>${escapeHtml(file.name || 'Attachment')}</span></a>`;
  }

  function renderCustomerEditor(customer) {
    const container = $('#b2cCustomerEditFields');
    const meta = $('#b2cCustomerEditMeta');
    if (!container) return;
    state.activeCustomer = customer;
    state.currentFiles = {};
    const values = customer.values || {};
    if (meta) meta.textContent = `${customer.customerCode || 'Customer record'} · Created ${formatDate(customer.createdAt)}`;
    container.innerHTML = state.fields.map((field) => {
      const value = values[field.key];
      const required = field.required ? '<em>*</em>' : '';
      if (field.type === 'files') {
        state.currentFiles[field.key] = Array.isArray(value) ? value : [];
        return `<div class="b2c-form-control b2c-form-control--wide"><label>${escapeHtml(field.label)}${required}</label><input class="b2c-file-input" type="file" data-customer-field="${escapeHtml(field.key)}" data-customer-files="${escapeHtml(field.key)}" multiple /><small>Choose new photos or files to add. Existing attachments remain unless you remove them.</small><div class="b2c-current-files" data-existing-files="${escapeHtml(field.key)}">${state.currentFiles[field.key].map(fileEntryHtml).join('') || '<span class="b2c-cell-muted">No attachments</span>'}</div></div>`;
      }
      const type = field.type === 'number' ? 'number' : field.type === 'phone' ? 'tel' : 'text';
      const inputMode = field.type === 'number' ? 'decimal' : field.type === 'phone' ? 'tel' : '';
      return `<div class="b2c-form-control"><label>${escapeHtml(field.label)}${required}</label><input type="${type}" ${field.type === 'number' ? 'step="any"' : ''} inputmode="${inputMode}" data-customer-field="${escapeHtml(field.key)}" value="${escapeHtml(value ?? '')}" ${field.required ? 'required' : ''} /></div>`;
    }).join('');
    refreshIcons();
  }

  function showCustomer(customer) {
    if (!customer) return;
    $('#b2cCustomerEditError')?.setAttribute('hidden', '');
    renderCustomerEditor(customer);
    openOverlay('b2cCustomerOverlay');
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  async function uploadFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return [];
    const outputs = [];
    for (const file of list) {
      if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
      const dataUrl = await fileToDataUrl(file);
      const result = await api('/api/b2c/upload', { method: 'POST', body: JSON.stringify({ dataUrl, filename: file.name, contentType: file.type }) });
      if (result.file) outputs.push(result.file);
    }
    return outputs;
  }

  async function saveCustomer(event) {
    event.preventDefault();
    const customer = state.activeCustomer;
    if (!customer) return;
    const errorBox = $('#b2cCustomerEditError');
    if (errorBox) errorBox.hidden = true;
    const values = { ...(customer.values || {}) };
    const form = $('#b2cCustomerEditForm');
    const button = $('#b2cSaveCustomerBtn');
    const oldHtml = button?.innerHTML;
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      for (const field of state.fields) {
        const input = $(`[data-customer-field="${CSS.escape(field.key)}"]`, form);
        if (field.type === 'files') {
          const uploads = await uploadFiles(input?.files);
          values[field.key] = [...(state.currentFiles[field.key] || []), ...uploads];
        } else {
          values[field.key] = input?.value ?? '';
        }
      }
      await api(`/api/b2c/customers/${encodeURIComponent(customer.id)}`, { method: 'PATCH', body: JSON.stringify({ values }) });
      closeOverlay('customer');
      await loadDatabase();
      message('Customer record updated.', 'success');
    } catch (error) {
      if (errorBox) { errorBox.hidden = false; errorBox.textContent = error.message || 'Could not save customer record.'; }
    } finally {
      if (button) { button.disabled = false; button.innerHTML = oldHtml; refreshIcons(); }
    }
  }

  async function deleteCustomer(id) {
    const customer = state.customers.find((item) => String(item.id) === String(id));
    if (!customer) return;
    if (!window.confirm(`Delete ${customer.customerCode || 'this customer record'}? This cannot be undone.`)) return;
    try {
      await api(`/api/b2c/customers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadDatabase();
      message('Customer record deleted.', 'success');
    } catch (error) {
      message(error.message || 'Could not delete customer record.', 'error');
    }
  }

  function bindEvents() {
    $('#b2cRefreshBtn')?.addEventListener('click', loadDatabase);
    $('#b2cConfigureBtn')?.addEventListener('click', openBuilder);
    $('#b2cCustomerSearch')?.addEventListener('input', renderTable);
    $('#b2cAddColumnBtn')?.addEventListener('click', () => {
      readBuilderControls();
      state.draft.push(normalizeDraftField({ label: '', type: 'text', required: false }, state.draft.length));
      renderBuilder();
      setTimeout(() => $(`[data-draft-label="${state.draft.length - 1}"]`)?.focus(), 0);
    });
    $('#b2cSaveBuilderBtn')?.addEventListener('click', saveBuilder);
    $('#b2cBuilderList')?.addEventListener('click', (event) => {
      const target = event.target.closest('button');
      if (!target) return;
      readBuilderControls();
      const index = Number(target.dataset.draftIndex ?? target.dataset.draftDelete);
      if (target.dataset.draftDelete !== undefined) {
        state.draft.splice(index, 1);
        renderBuilder();
        return;
      }
      const direction = target.dataset.draftMove;
      if (direction === 'up' && index > 0) [state.draft[index - 1], state.draft[index]] = [state.draft[index], state.draft[index - 1]];
      if (direction === 'down' && index < state.draft.length - 1) [state.draft[index + 1], state.draft[index]] = [state.draft[index], state.draft[index + 1]];
      renderBuilder();
    });
    document.addEventListener('click', (event) => {
      const close = event.target.closest('[data-b2c-close]');
      if (close) closeOverlay(close.dataset.b2cClose);
      const action = event.target.closest('[data-customer-action]');
      if (!action) return;
      const customer = state.customers.find((item) => String(item.id) === String(action.dataset.customerId));
      if (action.dataset.customerAction === 'edit') showCustomer(customer);
      if (action.dataset.customerAction === 'delete') deleteCustomer(action.dataset.customerId);
    });
    $('#b2cCustomerEditForm')?.addEventListener('submit', saveCustomer);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { closeOverlay('builder'); closeOverlay('customer'); }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    refreshIcons();
    loadDatabase();
  });
})();
