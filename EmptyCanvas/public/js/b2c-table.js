(() => {
  'use strict';

  const FIELD_TYPES = [
    ['text', 'Text'], ['number', 'Number'], ['select', 'Select'], ['multi_select', 'Multi-select'],
    ['date', 'Date'], ['files', 'Files & media'], ['checkbox', 'Checkbox'], ['url', 'URL'],
    ['email', 'Email'], ['phone', 'Phone'], ['formula', 'Formula'], ['place', 'Place'],
  ];
  const TYPE_LABELS = Object.fromEntries(FIELD_TYPES);
  const TYPE_ICONS = {
    text: 'type', number: 'hash', select: 'list', multi_select: 'layers', date: 'calendar',
    files: 'paperclip', checkbox: 'check-square', url: 'link', email: 'mail', phone: 'phone',
    formula: 'divide', place: 'map-pin',
  };
  const SELECT_TYPES = new Set(['select', 'multi_select']);
  const READ_ONLY = new Set(['formula']);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clean = (value) => String(value ?? '').trim();
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const formulaEngine = () => window.B2CFormulaEngine || null;

  const state = {
    databaseId: '', database: null, fields: [], records: [], databases: [], draft: [],
    activeRecord: null, currentFiles: {}, activeFormulaIndex: -1, formulaFunctionCategory: 'All',
  };
  let builderDrag = null;

  function icon(type) { return TYPE_ICONS[type] || 'type'; }
  function typeLabel(type) { return TYPE_LABELS[type] || 'Text'; }
  function fieldOptions(field) { return field?.options && typeof field.options === 'object' ? field.options : {}; }
  function icons() { try { window.feather?.replace?.(); } catch (_) {} }
  function toast(text, kind = 'info') {
    if (!clean(text)) return;
    if (window.OpsSafeMessage?.show) return window.OpsSafeMessage.show(text, kind);
    window.alert(text);
  }
  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
      ...options,
    });
    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `Request failed (${response.status}).`);
    return payload || {};
  }
  function pageId() {
    const match = String(location.pathname || '').match(/^\/b2c\/database\/([^/]+)\/?$/i);
    return match ? decodeURIComponent(match[1]) : '';
  }
  function open(kind) {
    const node = $(`#b2c${kind}Overlay`);
    if (!node) return;
    node.hidden = false;
    node.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    icons();
  }
  function close(kind) {
    const node = $(`#b2c${kind}Overlay`);
    if (!node) return;
    node.hidden = true;
    node.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
  function isImage(file) {
    return /^image\//i.test(String(file?.type || '')) || /\.(png|jpe?g|gif|webp|svg)$/i.test(String(file?.name || ''));
  }
  function recordText(record) {
    const values = record?.values || {};
    const formulas = record?.formulaValues || {};
    return [record?.customerCode, record?.createdByName, ...state.fields.map((field) => {
      const value = field.type === 'formula' ? formulas[field.key] : values[field.key];
      if (Array.isArray(value)) return value.map((item) => item?.name || item?.url || item).join(' ');
      return value ?? '';
    })].join(' ').toLowerCase();
  }
  function computeFormulaValues(record) {
    if (record?.formulaValues && typeof record.formulaValues === 'object') {
      return { values: record.formulaValues, errors: record.formulaErrors || {} };
    }
    const engine = formulaEngine();
    if (!engine?.calculateFormulaValues) return { values: {}, errors: {} };
    return engine.calculateFormulaValues(state.fields, record?.values || {});
  }
  function displayFormulaValue(record, field) {
    const formula = clean(fieldOptions(field).formula);
    if (!formula) return '<span class="b2c-cell-muted">No formula</span>';
    const calculated = computeFormulaValues(record);
    const error = clean(calculated?.errors?.[field.key]);
    if (error) return `<span class="b2c-formula-cell b2c-formula-cell--error" title="${escapeHtml(error)}"><i data-feather="alert-circle"></i><span>Formula error</span></span>`;
    const value = calculated?.values?.[field.key];
    const engine = formulaEngine();
    const output = engine?.display ? engine.display(value) : (value == null || value === '' ? '—' : String(value));
    return `<span class="b2c-formula-cell" title="${escapeHtml(formula)}"><i data-feather="divide"></i><span>${escapeHtml(output)}</span></span>`;
  }
  function displayValue(value, field, record) {
    if (field.type === 'formula') return displayFormulaValue(record, field);
    if (field.type === 'files') {
      const files = Array.isArray(value) ? value : [];
      return files.length ? `<div class="b2c-file-pills">${files.slice(0, 4).map((file) => `<a class="b2c-file-pill" target="_blank" rel="noopener" href="${escapeHtml(file.url || '#')}"><i data-feather="${isImage(file) ? 'image' : 'paperclip'}"></i><span>${escapeHtml(file.name || 'Attachment')}</span></a>`).join('')}${files.length > 4 ? `<span class="b2c-cell-muted">+${files.length - 4}</span>` : ''}</div>` : '<span class="b2c-cell-muted">—</span>';
    }
    if (field.type === 'checkbox') return value ? '<span class="b2c-check-yes"><i data-feather="check-circle"></i> Yes</span>' : '<span class="b2c-cell-muted">—</span>';
    if (field.type === 'multi_select') {
      const list = Array.isArray(value) ? value : [];
      return list.length ? `<div class="b2c-tag-list">${list.map((item) => `<span class="b2c-tag">${escapeHtml(item)}</span>`).join('')}</div>` : '<span class="b2c-cell-muted">—</span>';
    }
    if (value == null || value === '') return '<span class="b2c-cell-muted">—</span>';
    if (field.type === 'number' && Number.isFinite(Number(value))) return `<span class="b2c-cell-text">${escapeHtml(new Intl.NumberFormat().format(Number(value)))}</span>`;
    if (field.type === 'phone') return `<a class="b2c-cell-text" href="tel:${escapeHtml(String(value).replace(/[^+0-9]/g, ''))}">${escapeHtml(value)}</a>`;
    if (field.type === 'email') return `<a class="b2c-cell-text" href="mailto:${escapeHtml(value)}">${escapeHtml(value)}</a>`;
    if (field.type === 'url') return `<a class="b2c-cell-text" target="_blank" rel="noopener" href="${escapeHtml(value)}">${escapeHtml(value)}</a>`;
    return `<span class="b2c-cell-text" title="${escapeHtml(String(value))}">${escapeHtml(value)}</span>`;
  }

  function renderHeader() {
    const db = state.database;
    document.title = `${db?.name || 'Table'} | B2C`;
    const title = $('#b2cDetailTitle');
    const description = $('#b2cDetailDescription');
    if (title) title.textContent = db?.name || 'Table not found';
    if (description) description.textContent = db?.description || 'Manage this table’s properties, records, linked form, and Excel export.';
    if ($('#b2cFieldCount')) $('#b2cFieldCount').textContent = String(state.fields.length);
    if ($('#b2cRecordCount')) $('#b2cRecordCount').textContent = String(state.records.length);
    if ($('#b2cFormName')) $('#b2cFormName').textContent = db?.defaultFormId ? 'Available' : '—';
  }
  function renderTable() {
    const head = $('#b2cCustomerTableHead');
    const body = $('#b2cCustomerTableBody');
    if (!head || !body) return;
    const search = clean($('#b2cRecordSearch')?.value).toLowerCase();
    const records = search ? state.records.filter((record) => recordText(record).includes(search)) : state.records;
    head.innerHTML = `<tr><th>Record ID</th>${state.fields.map((field) => `<th>${escapeHtml(field.label)}</th>`).join('')}<th>Submitted by</th><th>Created</th><th aria-label="Actions"></th></tr>`;
    if (!state.fields.length) {
      body.innerHTML = '<tr><td class="b2c-table-empty" colspan="5">This table has no properties yet. Select <strong>Configure Table</strong> to build its schema.</td></tr>';
      icons(); return;
    }
    if (!records.length) {
      body.innerHTML = `<tr><td class="b2c-table-empty" colspan="${state.fields.length + 4}">${search ? 'No records match this search.' : 'No records yet. Open the linked form to create the first record.'}</td></tr>`;
      icons(); return;
    }
    body.innerHTML = records.map((record) => `<tr>
      <td><span class="b2c-customer-code">${escapeHtml(record.customerCode || `REC-${record.id}`)}</span></td>
      ${state.fields.map((field) => `<td>${displayValue((record.values || {})[field.key], field, record)}</td>`).join('')}
      <td>${escapeHtml(record.createdByName || '—')}</td>
      <td class="b2c-cell-muted">${escapeHtml(formatDate(record.createdAt))}</td>
      <td><div class="b2c-table-actions">
        <button type="button" class="b2c-icon-btn" data-record-action="edit" data-record-id="${escapeHtml(record.id)}" title="Edit record"><i data-feather="edit-2"></i></button>
        <button type="button" class="b2c-icon-btn b2c-icon-btn--danger" data-record-action="delete" data-record-id="${escapeHtml(record.id)}" title="Delete record"><i data-feather="trash-2"></i></button>
      </div></td>
    </tr>`).join('');
    icons();
  }
  function render() { renderHeader(); renderTable(); }
  async function load() {
    const refresh = $('#b2cRefreshBtn');
    try {
      if (refresh) refresh.disabled = true;
      const [bundle, library] = await Promise.all([
        api(`/api/b2c/databases/${encodeURIComponent(state.databaseId)}/records`),
        api('/api/b2c/databases'),
      ]);
      state.database = bundle.database;
      state.fields = Array.isArray(bundle.fields) ? bundle.fields : [];
      state.records = Array.isArray(bundle.records) ? bundle.records : [];
      state.databases = Array.isArray(library.databases) ? library.databases : [];
      render();
    } catch (error) {
      if ($('#b2cDetailTitle')) $('#b2cDetailTitle').textContent = 'Table unavailable';
      if ($('#b2cDetailDescription')) $('#b2cDetailDescription').textContent = error.message || 'Unable to load this B2C table.';
      if ($('#b2cCustomerTableBody')) $('#b2cCustomerTableBody').innerHTML = `<tr><td class="b2c-table-empty" colspan="5">${escapeHtml(error.message || 'Could not load table.')}</td></tr>`;
      toast(error.message || 'Could not load B2C table.', 'error');
    } finally { if (refresh) refresh.disabled = false; }
  }

  function builderError(message = '') {
    const box = $('#b2cBuilderError');
    if (!box) return;
    box.hidden = !message; box.textContent = message;
  }
  function normalizeField(field, index) {
    return {
      id: field?.id || '', key: field?.key || '', label: field?.label || '', type: field?.type || 'text',
      required: !!field?.required, options: { ...(field?.options || {}) }, sortOrder: index + 1,
    };
  }
  function typePicker(item, index) {
    const label = typeLabel(item.type);
    return `<div class="b2c-type-picker" data-type-picker-index="${index}">
      <input type="hidden" data-draft-type="${index}" value="${escapeHtml(item.type)}">
      <button type="button" class="b2c-type-picker__trigger" data-type-picker-trigger="${index}" aria-haspopup="listbox" aria-expanded="false">
        <span class="b2c-type-picker__value"><i data-feather="${icon(item.type)}"></i><span>${escapeHtml(label)}</span></span><i class="b2c-type-picker__chevron" data-feather="chevron-down"></i>
      </button>
      <div class="b2c-type-picker__menu" role="listbox" aria-label="Property type">
        ${FIELD_TYPES.map(([value, text]) => `<button type="button" class="b2c-type-picker__option ${value === item.type ? 'is-selected' : ''}" data-type-choice="${value}" data-draft-index="${index}" role="option" aria-selected="${value === item.type ? 'true' : 'false'}"><i data-feather="${icon(value)}"></i><span>${escapeHtml(text)}</span>${value === item.type ? '<i class="b2c-type-picker__check" data-feather="check"></i>' : ''}</button>`).join('')}
      </div>
    </div>`;
  }
  function optionRows(item, index) {
    const saved = Array.isArray(item?.options?.options) ? item.options.options : [];
    const choices = saved.length ? saved : [''];
    return `<div class="b2c-option-builder" data-option-builder="${index}">
      ${choices.map((choice, position) => `<div class="b2c-option-builder__row"><input data-draft-option-value="${index}" data-draft-option-position="${position}" value="${escapeHtml(choice)}" placeholder="Option ${position + 1}" aria-label="Option ${position + 1}"><button type="button" data-draft-option-remove="${index}" data-draft-option-position="${position}" aria-label="Delete option ${position + 1}" title="Delete option"><i data-feather="x"></i></button></div>`).join('')}
      <button type="button" class="b2c-option-builder__add" data-draft-option-add="${index}"><i data-feather="plus"></i><span>Add option</span></button>
    </div>`;
  }
  function optionsConfig(item, index) {
    if (SELECT_TYPES.has(item.type)) return `<div class="b2c-field-config b2c-field-config--choices"><label>Choices</label>${optionRows(item, index)}<small>Add each option as a separate choice. The form will use exactly this list.</small></div>`;
    if (item.type === 'formula') {
      const formula = clean(item.options?.formula);
      return `<div class="b2c-field-config b2c-field-config--formula"><div class="b2c-formula-summary"><div><label>Formula</label><p>${formula ? escapeHtml(formula) : 'No formula configured yet.'}</p></div><button type="button" class="b2c-formula-builder-trigger" data-draft-formula-builder="${index}"><i data-feather="divide"></i><span>Open equation builder</span></button></div><input type="hidden" data-draft-formula="${index}" value="${escapeHtml(formula)}"><small>Formula fields are read-only in forms and calculate automatically in the table.</small></div>`;
    }
    return '';
  }
  function renderBuilder() {
    const wrap = $('#b2cBuilderList');
    if (!wrap) return;
    if (!state.draft.length) { wrap.innerHTML = '<div class="b2c-builder-empty">No properties in this table yet. Add the first property below.</div>'; icons(); return; }
    wrap.innerHTML = state.draft.map((item, index) => `<article class="b2c-column-card" data-draft-index="${index}" tabindex="0" aria-label="Property ${index + 1}">
      <span class="b2c-column-order" aria-hidden="true">${index + 1}</span>
      <div class="b2c-field-control"><label>Property name</label><input data-draft-label="${index}" value="${escapeHtml(item.label)}" placeholder="Property name"></div>
      <div class="b2c-field-control"><label>Type</label>${typePicker(item, index)}</div>
      <label class="b2c-field-required"><input class="b2c-switch-input" type="checkbox" data-draft-required="${index}" ${item.required ? 'checked' : ''}><span class="b2c-switch-ui" aria-hidden="true"></span><span class="b2c-field-required__label">Required</span></label>
      <div class="b2c-column-actions"><button type="button" class="b2c-column-drag-handle" data-builder-drag-handle="${index}" title="Drag to reorder" aria-label="Drag property ${index + 1} to reorder"><span class="b2c-drag-dots" aria-hidden="true"></span></button><button type="button" data-draft-delete="${index}" title="Delete property" aria-label="Delete property"><i data-feather="trash-2"></i></button></div>
      ${optionsConfig(item, index)}
    </article>`).join('');
    icons();
  }
  function readBuilder() {
    state.draft.forEach((item, index) => {
      item.label = clean($(`[data-draft-label="${index}"]`)?.value);
      item.type = $(`[data-draft-type="${index}"]`)?.value || 'text';
      item.required = !!$(`[data-draft-required="${index}"]`)?.checked;
      const current = item.options || {};
      const configuredOptions = $$(`[data-draft-option-value="${index}"]`).map((input) => clean(input.value)).filter(Boolean);
      item.options = {
        ...current,
        options: SELECT_TYPES.has(item.type) ? [...new Set(configuredOptions)].slice(0, 100) : [],
        formula: clean($(`[data-draft-formula="${index}"]`)?.value) || null,
      };
      if (item.type !== 'formula') item.options.formula = null;
    });
  }
  function closeTypePickers(except = null) {
    $$('.b2c-type-picker.is-open').forEach((picker) => {
      if (picker === except) return;
      picker.classList.remove('is-open');
      $('[data-type-picker-trigger]', picker)?.setAttribute('aria-expanded', 'false');
    });
  }
  function setTypePicker(index, type) {
    readBuilder();
    if (!state.draft[index]) return;
    state.draft[index].type = type;
    if (!SELECT_TYPES.has(type)) state.draft[index].options.options = [];
    if (type !== 'formula') state.draft[index].options.formula = null;
    renderBuilder();
  }

  function formulaPropertyToken(field) { return `prop(${JSON.stringify(clean(field?.label) || 'Property name')})`; }
  function sampleValues(fields = []) {
    const values = {};
    fields.forEach((field, index) => {
      if (!field?.key) return;
      const choices = fieldOptions(field).options || [];
      if (field.type === 'number') values[field.key] = (index + 1) * 10;
      else if (field.type === 'checkbox') values[field.key] = true;
      else if (field.type === 'date') values[field.key] = new Date().toISOString().slice(0, 10);
      else if (field.type === 'select') values[field.key] = choices[0] || 'Sample';
      else if (field.type === 'multi_select') values[field.key] = choices.length ? [choices[0]] : ['Sample'];
      else if (field.type === 'email') values[field.key] = 'sample@example.com';
      else if (field.type === 'phone') values[field.key] = '01000000000';
      else values[field.key] = `Sample ${field.label || index + 1}`;
    });
    return values;
  }
  function formulaDraftFields(expression = null) {
    const fields = state.draft.map((item, index) => ({
      ...item,
      // New, unsaved properties do not have a database key yet. A stable local
      // key keeps the live preview useful before the table is saved.
      key: clean(item.key) || `draft_property_${index + 1}`,
      options: { ...(item.options || {}) },
    }));
    const active = fields[state.activeFormulaIndex];
    if (active && expression !== null) active.options.formula = expression;
    return fields;
  }
  function activeFormulaTestValues() {
    const selected = clean($('#b2cFormulaTestRecord')?.value);
    const record = state.records.find((item) => String(item.id) === selected) || state.records[0];
    return record?.values || sampleValues(formulaDraftFields());
  }
  function updateFormulaPreview() {
    const expression = clean($('#b2cFormulaExpression')?.value);
    const code = $('#b2cFormulaPreview');
    const result = $('#b2cFormulaResult');
    const stateNode = $('#b2cFormulaResultState');
    if (code) code.textContent = expression || 'Build your equation by inserting properties, operators, or a recipe.';
    if (!result || !stateNode) return;
    if (!expression) { result.textContent = '—'; stateNode.textContent = 'Add a formula to see a live preview.'; stateNode.className = 'b2c-formula-result__hint'; return; }
    const engine = formulaEngine();
    if (!engine?.calculateFormulaValues) { result.textContent = '—'; stateNode.textContent = 'The formula engine is loading.'; return; }
    const fields = formulaDraftFields(expression);
    const active = fields[state.activeFormulaIndex];
    const calculation = engine.calculateFormulaValues(fields, activeFormulaTestValues());
    const error = clean(calculation.errors?.[active?.key]);
    if (error) {
      result.textContent = 'Formula error'; stateNode.textContent = error; stateNode.className = 'b2c-formula-result__hint is-error'; return;
    }
    result.textContent = engine.display(calculation.values?.[active?.key]);
    stateNode.textContent = state.records.length ? 'Preview uses the selected saved record.' : 'Preview uses sample values until the table has records.';
    stateNode.className = 'b2c-formula-result__hint is-valid';
  }
  function insertFormulaText(value) {
    const input = $('#b2cFormulaExpression');
    if (!input) return;
    const start = Number.isFinite(input.selectionStart) ? input.selectionStart : input.value.length;
    const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : start;
    input.value = `${input.value.slice(0, start)}${value}${input.value.slice(end)}`;
    const cursor = start + value.length;
    input.focus(); input.setSelectionRange(cursor, cursor); updateFormulaPreview();
  }
  function formulaLiteral(value, preferredType = '') {
    const raw = clean(value);
    if (!raw) return 'null';
    if (/^(true|false|null)$/i.test(raw)) return raw.toLowerCase();
    if (preferredType === 'number' && Number.isFinite(Number(raw))) return String(Number(raw));
    if (preferredType === 'date') return JSON.stringify(raw);
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return raw;
    return JSON.stringify(raw);
  }
  function conditionExpression() {
    const fieldKey = clean($('#b2cFormulaConditionField')?.value);
    const operator = clean($('#b2cFormulaConditionOperator')?.value) || 'equals';
    const rawValue = $('#b2cFormulaConditionValue')?.value ?? '';
    const field = state.draft.find((item) => item.key === fieldKey) || state.draft.find((item) => item.label === fieldKey);
    const left = formulaPropertyToken(field || { label: fieldKey || 'Property name' });
    const right = formulaLiteral(rawValue, field?.type === 'number' ? 'number' : field?.type);
    if (operator === 'has_value') return `!empty(${left})`;
    if (operator === 'is_empty') return `empty(${left})`;
    if (operator === 'contains') return `contains(${left}, ${right})`;
    const symbols = { equals: '==', not_equals: '!=', greater_than: '>', greater_or_equal: '>=', less_than: '<', less_or_equal: '<=' };
    return `${left} ${symbols[operator] || '=='} ${right}`;
  }
  function addConditionToFormula() {
    const trueValue = $('#b2cFormulaConditionTrue')?.value ?? '';
    const falseValue = $('#b2cFormulaConditionFalse')?.value ?? '';
    insertFormulaText(`if(${conditionExpression()}, ${formulaLiteral(trueValue)}, ${formulaLiteral(falseValue)})`);
  }
  function setFormulaRecipe(expression) {
    const input = $('#b2cFormulaExpression');
    if (!input) return;
    input.value = expression;
    input.focus(); input.setSelectionRange(input.value.length, input.value.length); updateFormulaPreview();
  }
  function renderFormulaBuilder() {
    const index = state.activeFormulaIndex;
    const item = state.draft[index];
    if (!item) return;
    const expression = clean(item.options?.formula);
    const input = $('#b2cFormulaExpression');
    if (input) input.value = expression;
    if ($('#b2cFormulaFieldName')) $('#b2cFormulaFieldName').textContent = item.label || `Property ${index + 1}`;
    const available = state.draft.filter((field, fieldIndex) => fieldIndex !== index);
    const properties = $('#b2cFormulaProperties');
    if (properties) properties.innerHTML = available.length
      ? available.map((field) => `<button type="button" class="b2c-formula-insert" data-formula-property="${escapeHtml(formulaPropertyToken(field))}" title="Insert ${escapeHtml(field.label || 'Property')}"><i data-feather="columns"></i><span>${escapeHtml(field.label || 'Untitled property')}</span><small>${escapeHtml(typeLabel(field.type))}</small></button>`).join('')
      : '<p class="b2c-formula-empty">Add another property to reference it in this equation.</p>';
    const testSelect = $('#b2cFormulaTestRecord');
    if (testSelect) {
      const current = clean(testSelect.value);
      testSelect.innerHTML = state.records.length
        ? state.records.map((record) => `<option value="${escapeHtml(record.id)}">${escapeHtml(record.customerCode || `Record ${record.id}`)}</option>`).join('')
        : '<option value="">Sample values</option>';
      if (current && state.records.some((record) => String(record.id) === current)) testSelect.value = current;
    }
    const conditionField = $('#b2cFormulaConditionField');
    if (conditionField) conditionField.innerHTML = available.length
      ? available.map((field) => `<option value="${escapeHtml(field.key || field.label)}">${escapeHtml(field.label || 'Untitled property')}</option>`).join('')
      : '<option value="">Add a property first</option>';
    const engine = formulaEngine();
    const functions = $('#b2cFormulaFunctions');
    if (functions && engine?.FUNCTIONS) {
      const category = state.formulaFunctionCategory || 'All';
      const helpers = engine.FUNCTIONS.filter((helper) => category === 'All' || helper.category === category);
      functions.innerHTML = helpers.map((helper) => `<button type="button" class="b2c-formula-insert" data-formula-helper="${escapeHtml(helper.insert)}" title="${escapeHtml(helper.hint)}"><strong>${escapeHtml(helper.label)}</strong><span>${escapeHtml(helper.hint)}</span></button>`).join('') || '<p class="b2c-formula-empty">No functions in this category.</p>';
    }
    const recipes = $('#b2cFormulaRecipes');
    if (recipes && engine?.RECIPES) recipes.innerHTML = engine.RECIPES.map((recipe) => `<button type="button" class="b2c-formula-recipe" data-formula-recipe="${escapeHtml(recipe.expression)}" title="${escapeHtml(recipe.hint)}"><strong>${escapeHtml(recipe.label)}</strong><span>${escapeHtml(recipe.hint)}</span></button>`).join('');
    const categories = $('#b2cFormulaFunctionCategories');
    if (categories) categories.innerHTML = ['All', 'Logic', 'Math', 'Text', 'Date'].map((category) => `<button type="button" data-formula-function-category="${category}" class="${category === state.formulaFunctionCategory ? 'is-active' : ''}">${category}</button>`).join('');
    updateFormulaPreview(); icons();
  }
  function openFormulaBuilder(index) {
    readBuilder();
    if (!state.draft[index]) return;
    state.activeFormulaIndex = index;
    state.formulaFunctionCategory = 'All';
    renderFormulaBuilder(); open('Formula');
  }
  function saveFormulaBuilder() {
    const index = state.activeFormulaIndex;
    const item = state.draft[index];
    if (!item) return;
    const expression = clean($('#b2cFormulaExpression')?.value);
    const engine = formulaEngine();
    const validation = engine?.expressionInfo ? engine.expressionInfo(expression) : { ok: true };
    if (expression && !validation.ok) { toast(validation.error || 'Check the formula expression.', 'error'); return; }
    item.options = { ...(item.options || {}), formula: expression || null };
    state.activeFormulaIndex = -1; close('Formula'); renderBuilder();
  }

  function clearDragTarget() { if (builderDrag?.dropTarget) builderDrag.dropTarget.classList.remove('is-drop-before', 'is-drop-after'); }
  function beginBuilderDrag({ card, wrap, handle, pointerId, startX, startY }) {
    if (!card || !wrap || !handle || builderDrag || !card.isConnected || !wrap.contains(card)) return;
    readBuilder();
    const rect = card.getBoundingClientRect();
    const placeholder = document.createElement('div');
    placeholder.className = 'b2c-column-card-placeholder'; placeholder.style.height = `${rect.height}px`;
    card.parentNode.insertBefore(placeholder, card);
    try { handle.setPointerCapture?.(pointerId); } catch (_) {}
    document.body.appendChild(card);
    card.classList.add('is-dragging');
    Object.assign(card.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, zIndex: '1700', margin: '0', pointerEvents: 'none' });
    builderDrag = { card, wrap, handle, placeholder, fromIndex: Number(card.dataset.draftIndex), pointerId, offsetX: startX - rect.left, offsetY: startY - rect.top, dropTarget: null };
    document.body.classList.add('b2c-builder-reordering');
  }
  function getDropTarget(event, drag) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.b2c-column-card');
    return !target || target === drag.card || !drag.wrap.contains(target) ? null : target;
  }
  function moveBuilderDrag(event) {
    if (!builderDrag || event.pointerId !== builderDrag.pointerId) return;
    event.preventDefault();
    const drag = builderDrag;
    drag.card.style.left = `${event.clientX - drag.offsetX}px`; drag.card.style.top = `${event.clientY - drag.offsetY}px`;
    clearDragTarget();
    const target = getDropTarget(event, drag);
    if (target) {
      drag.dropTarget = target;
      drag.dropAfter = event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
      target.classList.add(drag.dropAfter ? 'is-drop-after' : 'is-drop-before');
    }
  }
  function finishBuilderDrag(event) {
    if (!builderDrag || event.pointerId !== builderDrag.pointerId) return;
    const drag = builderDrag; clearDragTarget(); builderDrag = null;
    document.body.classList.remove('b2c-builder-reordering');
    const target = getDropTarget(event, drag);
    let targetIndex = -1; let dropAfter = false;
    if (target) { targetIndex = Number(target.dataset.draftIndex); dropAfter = event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2; }
    try { drag.handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
    drag.card.classList.remove('is-dragging');
    ['position', 'left', 'top', 'width', 'z-index', 'margin', 'pointer-events'].forEach((property) => drag.card.style.removeProperty(property));
    if (drag.placeholder.parentNode) drag.placeholder.replaceWith(drag.card);
    if (Number.isFinite(targetIndex) && targetIndex !== drag.fromIndex) {
      const [moved] = state.draft.splice(drag.fromIndex, 1);
      const requested = targetIndex + (dropAfter ? 1 : 0);
      const insertAt = Math.max(0, Math.min(state.draft.length, drag.fromIndex < requested ? requested - 1 : requested));
      state.draft.splice(insertAt, 0, moved);
    }
    renderBuilder();
  }
  function bindBuilderDrag() {
    const wrap = $('#b2cBuilderList');
    if (!wrap || wrap.dataset.dragBound) return;
    wrap.dataset.dragBound = 'true';
    wrap.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest('[data-builder-drag-handle]');
      if (!handle || !wrap.contains(handle) || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const card = handle.closest('.b2c-column-card'); if (!card) return;
      event.preventDefault(); event.stopPropagation();
      beginBuilderDrag({ card, wrap, handle, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY });
    });
    wrap.addEventListener('contextmenu', (event) => { if (event.target.closest('[data-builder-drag-handle]')) event.preventDefault(); });
    window.addEventListener('pointermove', moveBuilderDrag, { passive: false });
    window.addEventListener('pointerup', finishBuilderDrag); window.addEventListener('pointercancel', finishBuilderDrag);
  }
  function openBuilder() { state.draft = state.fields.map(normalizeField); builderError(''); renderBuilder(); open('Builder'); }
  async function saveBuilder() {
    readBuilder();
    if (state.draft.some((item) => !item.label)) return builderError('Every property needs a name.');
    const engine = formulaEngine();
    for (const item of state.draft) {
      if (item.type === 'formula' && item.options?.formula && engine?.expressionInfo) {
        const check = engine.expressionInfo(item.options.formula);
        if (!check.ok) return builderError(`Formula in “${item.label}” is invalid: ${check.error}`);
      }
    }
    const button = $('#b2cSaveBuilderBtn'); const original = button?.innerHTML;
    try {
      if (button) { button.disabled = true; button.textContent = 'Saving…'; }
      await api(`/api/b2c/databases/${encodeURIComponent(state.databaseId)}/fields`, { method: 'PUT', body: JSON.stringify({ fields: state.draft }) });
      close('Builder'); await load(); toast('Table properties saved.', 'success');
    } catch (error) { builderError(error.message || 'Could not save table properties.'); }
    finally { if (button) { button.disabled = false; button.innerHTML = original; icons(); } }
  }

  function inputHtml(field, record) {
    const value = (record?.values || {})[field.key];
    const required = field.required ? 'required' : '';
    if (READ_ONLY.has(field.type)) return `<div class="b2c-form-control"><span>${escapeHtml(field.label)}</span><div class="b2c-readonly-field">This property is calculated by the database.</div></div>`;
    if (field.type === 'files') return `<label class="b2c-form-control b2c-form-control--wide"><span>${escapeHtml(field.label)}${field.required ? ' <em>*</em>' : ''}</span><input class="b2c-file-input" data-record-field="${escapeHtml(field.key)}" type="file" multiple><small>Upload photos, PDFs, or files up to 10 MB each.</small><div class="b2c-current-files" data-record-files="${escapeHtml(field.key)}">${renderCurrentFiles(Array.isArray(value) ? value : [])}</div></label>`;
    if (field.type === 'checkbox') return `<label class="b2c-form-control"><span>${escapeHtml(field.label)}</span><label class="b2c-checkbox-control"><input data-record-field="${escapeHtml(field.key)}" type="checkbox" ${value ? 'checked' : ''}><span>Yes</span></label></label>`;
    if (field.type === 'multi_select') return `<label class="b2c-form-control"><span>${escapeHtml(field.label)}${field.required ? ' <em>*</em>' : ''}</span><div class="b2c-select-wrap"><select class="b2c-multi-select" data-record-field="${escapeHtml(field.key)}" multiple ${required}>${(fieldOptions(field).options || []).map((option) => `<option value="${escapeHtml(option)}" ${(Array.isArray(value) ? value : []).includes(option) ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></div></label>`;
    if (field.type === 'select') return `<label class="b2c-form-control"><span>${escapeHtml(field.label)}${field.required ? ' <em>*</em>' : ''}</span><div class="b2c-select-wrap"><select data-record-field="${escapeHtml(field.key)}" ${required}><option value="">Select…</option>${(fieldOptions(field).options || []).map((option) => `<option value="${escapeHtml(option)}" ${String(value || '') === String(option) ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></div></label>`;
    const type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text';
    return `<label class="b2c-form-control"><span>${escapeHtml(field.label)}${field.required ? ' <em>*</em>' : ''}</span><input data-record-field="${escapeHtml(field.key)}" type="${type}" value="${escapeHtml(value ?? '')}" ${field.type === 'number' ? 'step="any" inputmode="decimal"' : ''} ${field.type === 'phone' ? 'inputmode="tel"' : ''} ${required}></label>`;
  }
  function renderCurrentFiles(files = []) { return files.map((file) => `<a class="b2c-file-pill" href="${escapeHtml(file.url || '#')}" target="_blank" rel="noopener"><i data-feather="${isImage(file) ? 'image' : 'paperclip'}"></i><span>${escapeHtml(file.name || 'Attachment')}</span></a>`).join(''); }
  function recordError(message = '') { const box = $('#b2cRecordError'); if (!box) return; box.hidden = !message; box.textContent = message; }
  function showRecord(record) {
    if (!record) return;
    state.activeRecord = record; state.currentFiles = {};
    state.fields.forEach((field) => { if (field.type === 'files') state.currentFiles[field.key] = Array.isArray(record.values?.[field.key]) ? [...record.values[field.key]] : []; });
    $('#b2cRecordEditTitle').textContent = `Edit ${record.customerCode || 'record'}`;
    $('#b2cRecordEditFields').innerHTML = state.fields.map((field) => inputHtml(field, record)).join('') || '<div class="b2c-conditional-note">This table has no editable properties yet.</div>';
    recordError(''); open('Record'); icons();
  }
  function fileToDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Could not read file.')); reader.onload = () => resolve(String(reader.result || '')); reader.readAsDataURL(file); }); }
  async function uploadFiles(files = []) {
    const output = [];
    for (const file of Array.from(files || [])) {
      if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
      const dataUrl = await fileToDataUrl(file);
      const payload = await api('/api/b2c/upload', { method: 'POST', body: JSON.stringify({ dataUrl, filename: file.name, mime: file.type }) });
      if (payload.file) output.push(payload.file);
    }
    return output;
  }
  async function handleFileChange(input) {
    const key = input?.dataset.recordField; if (!key) return;
    try {
      const uploads = await uploadFiles(input.files); state.currentFiles[key] = [...(state.currentFiles[key] || []), ...uploads];
      const slot = $(`[data-record-files="${CSS.escape(key)}"]`);
      if (slot) { slot.innerHTML = renderCurrentFiles(state.currentFiles[key]); icons(); }
    } catch (error) { recordError(error.message || 'Could not upload file.'); }
  }
  async function saveRecord(event) {
    event.preventDefault(); if (!state.activeRecord) return; recordError('');
    const form = event.currentTarget; if (!form.checkValidity()) { form.reportValidity(); return; }
    const values = {};
    for (const field of state.fields) {
      if (READ_ONLY.has(field.type)) continue;
      const input = $(`[data-record-field="${CSS.escape(field.key)}"]`, form);
      if (field.type === 'files') values[field.key] = state.currentFiles[field.key] || [];
      else if (field.type === 'checkbox') values[field.key] = !!input?.checked;
      else if (field.type === 'multi_select') values[field.key] = Array.from(input?.selectedOptions || []).map((option) => option.value);
      else values[field.key] = input?.value ?? '';
    }
    const button = form.querySelector('button[type="submit"]'); const original = button?.innerHTML;
    try {
      if (button) { button.disabled = true; button.textContent = 'Saving…'; }
      await api(`/api/b2c/records/${encodeURIComponent(state.activeRecord.id)}`, { method: 'PATCH', body: JSON.stringify({ databaseId: state.databaseId, values }) });
      close('Record'); await load(); toast('Record updated.', 'success');
    } catch (error) { recordError(error.message || 'Could not update record.'); }
    finally { if (button) { button.disabled = false; button.innerHTML = original; icons(); } }
  }
  async function deleteRecord(id) {
    const record = state.records.find((row) => String(row.id) === String(id)); if (!record) return;
    if (!window.confirm(`Delete ${record.customerCode || 'this record'}? This cannot be undone.`)) return;
    try { await api(`/api/b2c/records/${encodeURIComponent(id)}?databaseId=${encodeURIComponent(state.databaseId)}`, { method: 'DELETE' }); await load(); toast('Record deleted.', 'success'); }
    catch (error) { toast(error.message || 'Could not delete record.', 'error'); }
  }

  function bind() {
    $('#b2cDownloadExcelBtn')?.addEventListener('click', () => { if (state.databaseId) window.location.assign(`/api/b2c/databases/${encodeURIComponent(state.databaseId)}/export.xlsx`); });
    $('#b2cConfigureTableBtn')?.addEventListener('click', openBuilder);
    $('#b2cAddColumnBtn')?.addEventListener('click', () => { readBuilder(); state.draft.push(normalizeField({ label: 'New property', type: 'text', required: false, options: {} }, state.draft.length)); renderBuilder(); });
    $('#b2cSaveBuilderBtn')?.addEventListener('click', saveBuilder);
    $('#b2cFormulaSaveBtn')?.addEventListener('click', saveFormulaBuilder);
    $('#b2cFormulaExpression')?.addEventListener('input', updateFormulaPreview);
    $('#b2cFormulaTestRecord')?.addEventListener('change', updateFormulaPreview);
    $('#b2cFormulaAddConditionBtn')?.addEventListener('click', addConditionToFormula);
    $('#b2cFormulaToolbar')?.addEventListener('click', (event) => { const button = event.target.closest('[data-formula-token]'); if (button) insertFormulaText(button.dataset.formulaToken || ''); });
    bindBuilderDrag();

    $('#b2cBuilderList')?.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-type-choice]');
      if (choice) { event.preventDefault(); setTypePicker(Number(choice.dataset.draftIndex), choice.dataset.typeChoice || 'text'); return; }
      const trigger = event.target.closest('[data-type-picker-trigger]');
      if (trigger) { event.preventDefault(); const picker = trigger.closest('.b2c-type-picker'); const opening = !picker.classList.contains('is-open'); closeTypePickers(picker); picker.classList.toggle('is-open', opening); trigger.setAttribute('aria-expanded', opening ? 'true' : 'false'); return; }
      const formulaButton = event.target.closest('[data-draft-formula-builder]');
      if (formulaButton) { event.preventDefault(); openFormulaBuilder(Number(formulaButton.dataset.draftFormulaBuilder)); return; }
      const addOption = event.target.closest('[data-draft-option-add]');
      if (addOption) { event.preventDefault(); readBuilder(); const index = Number(addOption.dataset.draftOptionAdd); if (state.draft[index]) { const options = Array.isArray(state.draft[index].options?.options) ? state.draft[index].options.options : []; state.draft[index].options = { ...(state.draft[index].options || {}), options: [...options, ''] }; renderBuilder(); } return; }
      const removeOption = event.target.closest('[data-draft-option-remove]');
      if (removeOption) { event.preventDefault(); readBuilder(); const index = Number(removeOption.dataset.draftOptionRemove); const position = Number(removeOption.dataset.draftOptionPosition); if (state.draft[index]) { const options = [...(state.draft[index].options?.options || [])]; options.splice(position, 1); state.draft[index].options = { ...(state.draft[index].options || {}), options }; renderBuilder(); } return; }
      const button = event.target.closest('button');
      if (button?.dataset.draftDelete !== undefined) { readBuilder(); state.draft.splice(Number(button.dataset.draftDelete), 1); renderBuilder(); }
    });

    $('#b2cFormulaOverlay')?.addEventListener('click', (event) => {
      const property = event.target.closest('[data-formula-property]');
      if (property) { event.preventDefault(); insertFormulaText(property.dataset.formulaProperty || ''); return; }
      const helper = event.target.closest('[data-formula-helper]');
      if (helper) { event.preventDefault(); insertFormulaText(helper.dataset.formulaHelper || ''); return; }
      const recipe = event.target.closest('[data-formula-recipe]');
      if (recipe) { event.preventDefault(); setFormulaRecipe(recipe.dataset.formulaRecipe || ''); return; }
      const category = event.target.closest('[data-formula-function-category]');
      if (category) {
        event.preventDefault();
        const active = state.draft[state.activeFormulaIndex];
        if (active) active.options = { ...(active.options || {}), formula: clean($('#b2cFormulaExpression')?.value) || null };
        state.formulaFunctionCategory = category.dataset.formulaFunctionCategory || 'All';
        renderFormulaBuilder();
      }
    });
    $('#b2cCustomerTableBody')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-record-action]'); if (!button) return;
      const record = state.records.find((row) => String(row.id) === String(button.dataset.recordId));
      if (button.dataset.recordAction === 'edit') showRecord(record);
      if (button.dataset.recordAction === 'delete') deleteRecord(button.dataset.recordId);
    });
    $('#b2cRecordEditForm')?.addEventListener('submit', saveRecord);
    $('#b2cRecordEditForm')?.addEventListener('change', (event) => { if (event.target.matches('input[type="file"][data-record-field]')) handleFileChange(event.target); });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.b2c-type-picker')) closeTypePickers();
      const closeButton = event.target.closest('[data-b2c-close]'); if (!closeButton) return;
      const key = closeButton.dataset.b2cClose.replace(/(^|-)([a-z])/g, (_, prefix, letter) => letter.toUpperCase());
      if (key === 'Formula') state.activeFormulaIndex = -1;
      close(key);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      closeTypePickers(); state.activeFormulaIndex = -1; close('Formula'); close('Builder'); close('Record');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    state.databaseId = pageId();
    if (!state.databaseId) { location.replace('/b2c/database'); return; }
    icons(); bind(); load();
  });
})();
