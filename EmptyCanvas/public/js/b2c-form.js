(() => {
  'use strict';

  const state = { fields: [] };
  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function refreshIcons() { try { window.feather?.replace?.(); } catch (_) {} }
  function message(text, kind = 'info') { if (window.OpsSafeMessage?.show) return window.OpsSafeMessage.show(text, kind); window.alert(text); }
  async function api(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }, ...options });
    let payload = null; try { payload = await response.json(); } catch (_) {}
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `Request failed (${response.status}).`);
    return payload || {};
  }
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error(`Could not read ${file.name}.`)); reader.readAsDataURL(file); });
  }
  async function uploadFiles(files) {
    const out = [];
    for (const file of Array.from(files || [])) {
      if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
      const dataUrl = await fileToDataUrl(file);
      const payload = await api('/api/b2c/upload', { method: 'POST', body: JSON.stringify({ dataUrl, filename: file.name, contentType: file.type }) });
      if (payload.file) out.push(payload.file);
    }
    return out;
  }
  function renderFields() {
    const wrap = $('#b2cCustomerFormFields');
    const noFields = $('#b2cNoFields');
    const form = $('#b2cCustomerForm');
    if (!wrap || !noFields || !form) return;
    if (!state.fields.length) {
      form.hidden = true; noFields.hidden = false; refreshIcons(); return;
    }
    form.hidden = false; noFields.hidden = true;
    wrap.innerHTML = state.fields.map((field) => {
      const required = field.required ? '<em>*</em>' : '';
      const help = field.type === 'files' ? '<small>You can upload photos, PDFs, or other files. Maximum 10 MB per file.</small>' : '';
      if (field.type === 'files') return `<div class="b2c-form-control b2c-form-control--wide"><label>${escapeHtml(field.label)}${required}</label><input class="b2c-file-input" type="file" data-form-field="${escapeHtml(field.key)}" multiple ${field.required ? 'required' : ''} />${help}<div class="b2c-current-files" data-form-files="${escapeHtml(field.key)}"></div></div>`;
      const type = field.type === 'number' ? 'number' : field.type === 'phone' ? 'tel' : 'text';
      return `<div class="b2c-form-control"><label>${escapeHtml(field.label)}${required}</label><input type="${type}" ${field.type === 'number' ? 'step="any" inputmode="decimal"' : ''} ${field.type === 'phone' ? 'inputmode="tel"' : ''} data-form-field="${escapeHtml(field.key)}" ${field.required ? 'required' : ''} /></div>`;
    }).join('');
    refreshIcons();
  }
  async function loadFields() {
    try {
      const payload = await api('/api/b2c/fields');
      state.fields = Array.isArray(payload.fields) ? payload.fields : [];
      renderFields();
    } catch (error) {
      const wrap = $('#b2cCustomerFormFields');
      if (wrap) wrap.innerHTML = `<div class="b2c-form-loading">${escapeHtml(error.message || 'Could not load the customer form.')}</div>`;
      message(error.message || 'Could not load the customer form.', 'error');
    }
  }
  function errorText(text = '') {
    const box = $('#b2cCustomerFormError'); if (!box) return;
    if (!text) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false; box.textContent = text;
  }
  function previewFiles(input) {
    const target = document.querySelector(`[data-form-files="${CSS.escape(input.dataset.formField || '')}"]`);
    if (!target) return;
    const files = Array.from(input.files || []);
    target.innerHTML = files.length ? files.map((file) => `<span class="b2c-file-pill"><i data-feather="paperclip"></i><span>${escapeHtml(file.name)}</span></span>`).join('') : '';
    refreshIcons();
  }
  async function submitForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const error = $('#b2cCustomerFormError');
    errorText('');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const button = $('#b2cSubmitCustomerBtn'); const original = button?.innerHTML;
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      const values = {};
      for (const field of state.fields) {
        const input = document.querySelector(`[data-form-field="${CSS.escape(field.key)}"]`);
        if (field.type === 'files') values[field.key] = await uploadFiles(input?.files);
        else values[field.key] = input?.value ?? '';
      }
      await api('/api/b2c/customers', { method: 'POST', body: JSON.stringify({ values }) });
      form.reset();
      document.querySelectorAll('[data-form-files]').forEach((node) => { node.innerHTML = ''; });
      $('#b2cFormProgress').hidden = false;
      message('Customer record saved successfully.', 'success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      errorText(err.message || 'Could not save this customer record.');
    } finally {
      if (button) { button.disabled = false; button.innerHTML = original; refreshIcons(); }
    }
  }
  function bindEvents() {
    $('#b2cCustomerForm')?.addEventListener('submit', submitForm);
    $('#b2cCustomerForm')?.addEventListener('change', (event) => { if (event.target.matches('input[type="file"][data-form-field]')) previewFiles(event.target); });
    $('#b2cResetFormBtn')?.addEventListener('click', () => { setTimeout(() => document.querySelectorAll('[data-form-files]').forEach((node) => { node.innerHTML = ''; }), 0); errorText(''); });
    $('#b2cAddAnotherBtn')?.addEventListener('click', () => { $('#b2cFormProgress').hidden = true; $('#b2cCustomerForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  document.addEventListener('DOMContentLoaded', () => { bindEvents(); refreshIcons(); loadFields(); });
})();
