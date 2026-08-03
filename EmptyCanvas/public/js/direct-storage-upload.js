(function initDirectStorageUpload(global) {
  'use strict';

  class DirectStorageError extends Error {
    constructor(message, options = {}) {
      super(message || 'Direct file upload failed.');
      this.name = 'DirectStorageError';
      this.code = options.code || 'DIRECT_STORAGE_ERROR';
      this.status = Number(options.status || 0);
      this.fallbackAllowed = Boolean(options.fallbackAllowed);
      this.stage = options.stage || '';
    }
  }

  async function responseJson(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { error: text.slice(0, 500) }; }
  }

  async function createTicket(scope, file) {
    let response;
    try {
      response = await fetch('/api/storage/upload-ticket', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          filename: file.name || 'attachment',
          mime: file.type || 'application/octet-stream',
          size: Number(file.size || 0),
        }),
      });
    } catch (error) {
      throw new DirectStorageError(error?.message || 'Could not reach the direct upload service.', {
        code: 'DIRECT_STORAGE_TICKET_NETWORK_ERROR',
        fallbackAllowed: true,
        stage: 'ticket',
      });
    }
    const payload = await responseJson(response);
    if (!response.ok || payload?.ok === false || !payload?.upload?.signedUrl || !payload?.uploadRef) {
      throw new DirectStorageError(payload?.error || 'Could not prepare the direct upload.', {
        code: payload?.code || (response.status === 404 ? 'DIRECT_STORAGE_UNAVAILABLE' : 'DIRECT_STORAGE_TICKET_FAILED'),
        status: response.status,
        fallbackAllowed: Boolean(payload?.fallbackAllowed || response.status === 404 || response.status >= 500),
        stage: 'ticket',
      });
    }
    return payload;
  }

  function putFile(ticket, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const method = String(ticket?.upload?.method || 'PUT').toUpperCase();
      xhr.open(method, ticket.upload.signedUrl, true);
      xhr.withCredentials = false;
      const headers = ticket?.upload?.headers && typeof ticket.upload.headers === 'object'
        ? ticket.upload.headers
        : {};
      Object.entries(headers).forEach(([name, value]) => {
        if (value !== null && typeof value !== 'undefined') xhr.setRequestHeader(name, String(value));
      });
      xhr.upload.onprogress = (event) => {
        if (typeof onProgress !== 'function') return;
        const total = event.lengthComputable ? event.total : Number(file.size || 0);
        const percent = total > 0 ? Math.min(100, Math.round((event.loaded / total) * 100)) : 0;
        onProgress({ loaded: event.loaded, total, percent, stage: 'upload' });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (typeof onProgress === 'function') onProgress({ loaded: file.size, total: file.size, percent: 100, stage: 'verify' });
          resolve();
          return;
        }
        reject(new DirectStorageError(`Storage upload failed with status ${xhr.status}.`, {
          code: 'DIRECT_STORAGE_PUT_FAILED',
          status: xhr.status,
          fallbackAllowed: xhr.status === 0 || xhr.status >= 500,
          stage: 'upload',
        }));
      };
      xhr.onerror = () => reject(new DirectStorageError('The browser could not upload directly to storage.', {
        code: 'DIRECT_STORAGE_PUT_NETWORK_ERROR',
        status: xhr.status,
        fallbackAllowed: true,
        stage: 'upload',
      }));
      xhr.onabort = () => reject(new DirectStorageError('The direct upload was cancelled.', {
        code: 'DIRECT_STORAGE_PUT_ABORTED',
        status: xhr.status,
        fallbackAllowed: false,
        stage: 'upload',
      }));
      xhr.send(file);
    });
  }

  async function completeUpload(uploadRef) {
    let response;
    try {
      response = await fetch('/api/storage/upload-complete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadRef }),
      });
    } catch (error) {
      throw new DirectStorageError(error?.message || 'Could not verify the uploaded file.', {
        code: 'DIRECT_STORAGE_COMPLETE_NETWORK_ERROR',
        fallbackAllowed: false,
        stage: 'verify',
      });
    }
    const payload = await responseJson(response);
    if (!response.ok || payload?.ok === false || !payload?.file?.url) {
      throw new DirectStorageError(payload?.error || 'The uploaded file could not be verified.', {
        code: payload?.code || 'DIRECT_STORAGE_COMPLETE_FAILED',
        status: response.status,
        fallbackAllowed: false,
        stage: 'verify',
      });
    }
    return payload.file;
  }

  async function uploadFile(options = {}) {
    const scope = String(options.scope || '').trim();
    const file = options.file;
    if (!scope) throw new DirectStorageError('Direct upload scope is required.', { code: 'DIRECT_STORAGE_SCOPE_REQUIRED' });
    if (!file || typeof file.size === 'undefined') throw new DirectStorageError('Choose a valid file first.', { code: 'DIRECT_STORAGE_FILE_REQUIRED' });

    try {
      const ticket = await createTicket(scope, file);
      await putFile(ticket, file, options.onProgress);
      const uploaded = await completeUpload(ticket.uploadRef);
      if (typeof options.onProgress === 'function') {
        options.onProgress({ loaded: file.size, total: file.size, percent: 100, stage: 'complete' });
      }
      return uploaded;
    } catch (error) {
      if (typeof options.fallback === 'function' && error?.fallbackAllowed) {
        return await options.fallback(error);
      }
      throw error;
    }
  }

  global.ERPDirectStorage = Object.freeze({
    uploadFile,
    DirectStorageError,
  });
})(window);
