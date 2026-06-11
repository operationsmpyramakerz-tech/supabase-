document.addEventListener('DOMContentLoaded', function() {
  const groupsContainer = document.getElementById('stock-groups');
  const searchInput     = document.getElementById('stockSearch');

  // Modern download modal (same UX as B2B live stock)
  const stockDownloadBtn = document.getElementById('stockDownloadBtn');

  let allStock = [];

  const norm = (s) => String(s || '').toLowerCase().trim();

  const normalizeUrl = (url) => {
    const s = String(url || '').trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('www.')) return `https://${s}`;
    return null;
  };

  const hasStockQty = (item) => {
    const n = Number(item?.quantity);
    return Number.isFinite(n) && n !== 0;
  };

  // ألوان Notion للـ select
  const stockMovementTagColor = (name = '', fallback = 'default') => {
    const canon = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (canon === 'requestproducts' || canon === 'requestproduct') return 'green';
    if (canon === 'withdrawproducts' || canon === 'withdrawproduct' || canon === 'withdrawalproducts' || canon === 'withdrawalproduct') return 'red';
    return fallback || 'default';
  };

  const colorVars = (color = 'default') => {
    switch (color) {
      case 'gray':   return { bg:'#F3F4F6', text:'#374151', border:'#E5E7EB' };
      case 'brown':  return { bg:'#EFEBE9', text:'#4E342E', border:'#D7CCC8' };
      case 'orange': return { bg:'#FFF7ED', text:'#9A3412', border:'#FED7AA' };
      case 'yellow': return { bg:'#FEFCE8', text:'#854D0E', border:'#FDE68A' };
      case 'green':  return { bg:'#ECFDF5', text:'#065F46', border:'#A7F3D0' };
      case 'blue':   return { bg:'#EFF6FF', text:'#1E40AF', border:'#BFDBFE' };
      case 'purple': return { bg:'#F5F3FF', text:'#5B21B6', border:'#DDD6FE' };
      case 'pink':   return { bg:'#FDF2F8', text:'#9D174D', border:'#FBCFE8' };
      case 'red':    return { bg:'#FEF2F2', text:'#991B1B', border:'#FECACA' };
      default:       return { bg:'#F3F4F6', text:'#111827', border:'#E5E7EB' };
    }
  };

  const makeTagPill = (tag) => {
    const span = document.createElement('span');
    const name = (tag && tag.name) || 'Untagged';
    const color = stockMovementTagColor(name, (tag && tag.color) || 'default');
    span.className = `tag-pill tag--${color}`;
    span.textContent = name;
    span.title = name;
    return span;
  };

  const makeQtyPill = (value) => {
    const span = document.createElement('span');
    span.className = 'qty-pill';
    const shown =
      typeof value === 'number' && Number.isFinite(value) ? value : '—';
    span.textContent = String(shown);
    return span;
  };

  const groupByTag = (rows) => {
    const map = new Map();
    rows.forEach(item => {
      const name  = item?.tag?.name || 'Untagged';
      const color = stockMovementTagColor(name, item?.tag?.color || 'default');
      const key = `${name.toLowerCase()}|${color}`;
      if (!map.has(key)) map.set(key, { name, color, items: [] });
      map.get(key).items.push(item);
    });

    // ترتيب أبجدي وUntagged في الآخر
    let arr = Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name));
    const untagged = arr.filter(g => g.name.toLowerCase() === 'untagged' || g.name === '-');
    arr = arr.filter(g => !(g.name.toLowerCase() === 'untagged' || g.name === '-'));
    return arr.concat(untagged);
  };

  const renderGroups = (rows) => {
    groupsContainer.innerHTML = '';

    const visibleRows = (rows || []).filter(hasStockQty);

    if (!visibleRows || visibleRows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-block empty-block--no-data';
      empty.innerHTML = window.OpsNoData?.html() || 'Sorry, No data available';
      groupsContainer.appendChild(empty);
      return;
    }

    const groups = groupByTag(visibleRows);
    const frag = document.createDocumentFragment();

    groups.forEach(group => {
      const card = document.createElement('section');
      card.className = 'card card--elevated group-card';

      const cv = colorVars(group.color);
      card.style.setProperty('--group-accent-bg', cv.bg);
      card.style.setProperty('--group-accent-text', cv.text);
      card.style.setProperty('--group-accent-border', cv.border);

      // Header: Tag فقط هنا
      const head = document.createElement('div');
      head.className = 'group-card__head';
      head.innerHTML = `
        <div class="group-head-left">
          <span class="group-title">Tag</span>
          <span class="group-tag">${makeTagPill(group).outerHTML}</span>
        </div>
        <div class="group-head-right">
          <span class="group-count">${group.items.length} items</span>
        </div>
      `;

      // Table
      const tableWrap = document.createElement('div');
      tableWrap.className = 'group-table-wrap';

      const table = document.createElement('table');
      table.className = 'group-table';

      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Component</th>
          <th class="col-num">In Stock</th>
        </tr>
      `;


      const tbody = document.createElement('tbody');
      group.items
        .sort((a,b) => (a.name || '').localeCompare(b.name || ''))
        .forEach(item => {
          const tr = document.createElement('tr');          const tdName = document.createElement('td');
          tdName.style.fontWeight = '600';

          const link = normalizeUrl(item?.url);
          if (link) {
            const a = document.createElement('a');
            a.href = link;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'component-link';
            a.textContent = item.name || '-';
            tdName.appendChild(a);
          } else {
            tdName.textContent = item.name || '-';
          }

          const tdInStock = document.createElement('td');
          tdInStock.className = 'col-num';
          tdInStock.textContent = (item.quantity ?? 0).toString();

          tr.appendChild(tdName);
          tr.appendChild(tdInStock);
          tbody.appendChild(tr);
        });

      table.appendChild(thead);
      table.appendChild(tbody);
      tableWrap.appendChild(table);

      card.appendChild(head);
      card.appendChild(tableWrap);
      frag.appendChild(card);
    });

    groupsContainer.appendChild(frag);
    if (window.feather) feather.replace();
  };

  const applyFilter = () => {
    const q = norm(searchInput ? searchInput.value : '');
    if (!q) { renderGroups(allStock); return; }
    const filtered = allStock.filter(x => {
      const name = norm(x.name);
      const tag  = norm(x.tag?.name);
      return name.includes(q) || tag.includes(q);
    });
    renderGroups(filtered);
  };

  const fetchStockData = async () => {
    groupsContainer.innerHTML = `
      <div class="modern-loading" role="status" aria-live="polite">
        <div class="modern-loading__spinner" aria-hidden="true"></div>
        <div class="modern-loading__text">
          Loading stock data
          <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
      </div>
    `;
    try {
      const response = await fetch('/api/stock', { credentials: 'include' });
      if (response.status === 401 || response.redirected) {
        window.location.href = '/login';
        return;
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch stock data');
      }
      const data = await response.json();
      // متوقع: [{ id, name, quantity, oneKitQuantity, tag }]
      allStock = Array.isArray(data) ? data : [];
      // Filter: show all non-zero stock movements, including withdrawal quantities.
      allStock = allStock.filter(hasStockQty);
      renderGroups(allStock);
    } catch (error) {
      console.error('Error fetching stock data:', error);
      const safeError = window.OpsSafeMessage?.sanitize ? window.OpsSafeMessage.sanitize(error.message) : (error.message || 'Failed to fetch stock data');
      const safeErrorHtml = String(safeError || 'Failed to fetch stock data')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      groupsContainer.innerHTML = `<div class="error-block">Error: ${safeErrorHtml}</div>`;
    }
  };

  fetchStockData();

  if (searchInput) {
    searchInput.addEventListener('input', applyFilter);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchInput.value) {
        searchInput.value = '';
        applyFilter();
      }
    });
  }

  // ---------- Modern export modal (PDF / Excel) ----------
  const STOCK_EXPORT_COLUMNS = [
    { value: 'stock', label: 'Stock', checked: true },
    { value: 'receiptNumber', label: 'Receipt number', checked: false },
    { value: 'unityPrice', label: 'Unity price', checked: true },
    { value: 'totalPrice', label: 'Total price', checked: true },
    { value: 'inventory', label: 'Inventory', checked: false },
    { value: 'defected', label: 'Defected', checked: false },
  ];

  const StockExportModal = (() => {
    let ui = null;
    let resolver = null;

    const ensure = () => {
      if (ui) return ui;
      const modal = document.createElement('div');
      modal.className = 'b2b-export-modal hidden';
      modal.id = 'stockExportModal';
      modal.innerHTML = `
        <div class="b2b-export-modal__backdrop" data-export-cancel></div>
        <div class="b2b-export-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="stockExportTitle">
          <div class="b2b-export-modal__header">
            <div class="b2b-export-modal__icon" aria-hidden="true"><i data-feather="download"></i></div>
            <div>
              <h3 class="b2b-export-modal__title" id="stockExportTitle">Download stock file</h3>
              <p class="b2b-export-modal__hint">Choose the file type and the columns that should appear in the file.</p>
            </div>
            <button class="b2b-export-modal__close" type="button" aria-label="Close" data-export-cancel>&times;</button>
          </div>
          <div class="b2b-export-modal__body">
            <div class="b2b-export-field b2b-export-filetype" data-export-filetype-picker>
              <span class="b2b-export-field__label">File type</span>
              <input type="hidden" data-export-filetype value="pdf" />
              <button class="b2b-export-picker-button" type="button" data-export-filetype-toggle aria-haspopup="listbox" aria-expanded="false">
                <span data-export-filetype-summary>PDF</span>
                <i data-feather="chevron-down" aria-hidden="true"></i>
              </button>
              <div class="b2b-export-filetype__panel b2b-export-floating-panel" data-export-filetype-panel role="listbox" aria-label="File type" hidden>
                <button class="b2b-export-option is-selected" type="button" data-export-filetype-option="pdf" role="option" aria-selected="true">
                  <span>PDF</span>
                  <i data-feather="check" aria-hidden="true"></i>
                </button>
                <button class="b2b-export-option" type="button" data-export-filetype-option="excel" role="option" aria-selected="false">
                  <span>Excel</span>
                  <i data-feather="check" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div class="b2b-export-field b2b-export-multiselect" data-export-column-picker>
              <span class="b2b-export-field__label">Columns</span>
              <button class="b2b-export-multiselect__button" type="button" data-export-column-toggle aria-haspopup="listbox" aria-expanded="false">
                <span data-export-column-summary>Columns selected</span>
                <i data-feather="chevron-down" aria-hidden="true"></i>
              </button>
              <div class="b2b-export-multiselect__panel b2b-export-floating-panel" data-export-column-panel role="listbox" aria-label="Columns" hidden>
                <div class="b2b-export-columns" data-export-columns>
                  ${STOCK_EXPORT_COLUMNS.map((col) => `
                    <label class="b2b-export-check" role="option">
                      <input type="checkbox" value="${col.value}" ${col.checked ? 'checked' : ''} />
                      <span>${col.label}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
            </div>
            <div class="b2b-export-modal__error" data-export-error>Please choose at least one column.</div>
          </div>
          <div class="b2b-export-modal__footer">
            <button class="btn btn--light" type="button" data-export-cancel>Cancel</button>
            <button class="btn b2b-export-confirm" type="button" data-export-confirm>
              <i data-feather="download"></i>
              <span>Download</span>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const fileType = modal.querySelector('[data-export-filetype]');
      const checks = Array.from(modal.querySelectorAll('[data-export-columns] input[type="checkbox"]'));
      const err = modal.querySelector('[data-export-error]');
      const confirm = modal.querySelector('[data-export-confirm]');
      const cancelEls = Array.from(modal.querySelectorAll('[data-export-cancel]'));
      const columnPicker = modal.querySelector('[data-export-column-picker]');
      const columnToggle = modal.querySelector('[data-export-column-toggle]');
      const columnPanel = modal.querySelector('[data-export-column-panel]');
      const columnSummary = modal.querySelector('[data-export-column-summary]');
      const fileTypePicker = modal.querySelector('[data-export-filetype-picker]');
      const fileTypeToggle = modal.querySelector('[data-export-filetype-toggle]');
      const fileTypePanel = modal.querySelector('[data-export-filetype-panel]');
      const fileTypeSummary = modal.querySelector('[data-export-filetype-summary]');
      const fileTypeOptions = Array.from(modal.querySelectorAll('[data-export-filetype-option]'));

      const positionFloatingPanel = (toggle, panel) => {
        if (!toggle || !panel || panel.hidden) return;
        if (panel.parentElement !== document.body) document.body.appendChild(panel);

        const rect = toggle.getBoundingClientRect();
        const margin = 12;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const panelWidth = Math.min(rect.width, Math.max(0, viewportWidth - (margin * 2)));
        const left = Math.min(Math.max(rect.left, margin), Math.max(margin, viewportWidth - panelWidth - margin));
        const belowSpace = viewportHeight - rect.bottom - margin;
        const aboveSpace = rect.top - margin;
        const shouldOpenUp = belowSpace < 230 && aboveSpace > belowSpace;
        const maxHeight = Math.max(160, Math.min(340, (shouldOpenUp ? aboveSpace : belowSpace) - 8));

        panel.style.width = `${panelWidth}px`;
        panel.style.left = `${left}px`;
        panel.style.maxHeight = `${maxHeight}px`;

        if (shouldOpenUp) {
          panel.style.top = 'auto';
          panel.style.bottom = `${Math.max(margin, viewportHeight - rect.top + 8)}px`;
        } else {
          panel.style.top = `${Math.min(rect.bottom + 8, viewportHeight - margin)}px`;
          panel.style.bottom = 'auto';
        }
      };

      const setFloatingPanelOpen = (toggle, panel, open) => {
        if (!toggle || !panel) return;
        if (panel.parentElement !== document.body) document.body.appendChild(panel);
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.classList.toggle('is-open', !!open);
        if (open) {
          positionFloatingPanel(toggle, panel);
          requestAnimationFrame(() => positionFloatingPanel(toggle, panel));
        }
      };

      const updateFileTypeSummary = () => {
        const value = String(fileType?.value || 'pdf').toLowerCase();
        const label = value === 'excel' ? 'Excel' : 'PDF';
        if (fileTypeSummary) fileTypeSummary.textContent = label;
        fileTypeOptions.forEach((option) => {
          const selected = option.dataset.exportFiletypeOption === value;
          option.classList.toggle('is-selected', selected);
          option.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
      };

      const selectedLabels = () => checks
        .filter((x) => x.checked)
        .map((x) => STOCK_EXPORT_COLUMNS.find((col) => col.value === x.value)?.label || x.value);

      const updateColumnSummary = () => {
        const labels = selectedLabels();
        if (columnSummary) columnSummary.textContent = labels.length ? labels.join(', ') : 'Select columns';
        if (err && labels.length) err.style.display = 'none';
      };

      const setFileTypePanelOpen = (open) => {
        if (!fileTypePanel || !fileTypeToggle) return;
        if (open) setColumnPanelOpen(false);
        setFloatingPanelOpen(fileTypeToggle, fileTypePanel, open);
      };

      const setColumnPanelOpen = (open) => {
        if (!columnPanel || !columnToggle) return;
        if (open) setFileTypePanelOpen(false);
        setFloatingPanelOpen(columnToggle, columnPanel, open);
      };

      const close = (value = null) => {
        setFileTypePanelOpen(false);
        setColumnPanelOpen(false);
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        if (resolver) {
          const done = resolver;
          resolver = null;
          done(value);
        }
      };

      cancelEls.forEach((el) => el.addEventListener('click', () => close(null)));
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (fileTypePanel && !fileTypePanel.hidden) {
            setFileTypePanelOpen(false);
            return;
          }
          if (columnPanel && !columnPanel.hidden) {
            setColumnPanelOpen(false);
            return;
          }
          close(null);
        }
      });
      fileTypeToggle?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setFileTypePanelOpen(!!fileTypePanel?.hidden);
      });
      fileTypePanel?.addEventListener('click', (e) => e.stopPropagation());
      fileTypeOptions.forEach((option) => {
        option.addEventListener('click', () => {
          if (fileType) fileType.value = option.dataset.exportFiletypeOption || 'pdf';
          updateFileTypeSummary();
          setFileTypePanelOpen(false);
        });
      });
      columnToggle?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setColumnPanelOpen(!!columnPanel?.hidden);
      });
      columnPanel?.addEventListener('click', (e) => e.stopPropagation());
      document.addEventListener('click', (e) => {
        if (modal.classList.contains('hidden')) return;
        const target = e.target;
        const insideFileType = fileTypePicker?.contains(target) || fileTypePanel?.contains(target);
        const insideColumns = columnPicker?.contains(target) || columnPanel?.contains(target);
        if (insideFileType || insideColumns) return;
        setFileTypePanelOpen(false);
        setColumnPanelOpen(false);
      });
      const repositionOpenPanels = () => {
        if (!modal.classList.contains('hidden')) {
          positionFloatingPanel(fileTypeToggle, fileTypePanel);
          positionFloatingPanel(columnToggle, columnPanel);
        }
      };
      window.addEventListener('resize', repositionOpenPanels);
      window.addEventListener('scroll', repositionOpenPanels, true);
      checks.forEach((input) => input.addEventListener('change', updateColumnSummary));
      confirm.addEventListener('click', () => {
        const selected = checks.filter((x) => x.checked).map((x) => x.value);
        if (!selected.length) {
          if (err) err.style.display = 'block';
          setColumnPanelOpen(true);
          return;
        }
        if (err) err.style.display = 'none';
        close({ fileType: String(fileType?.value || 'pdf').toLowerCase(), columns: selected });
      });

      ui = { modal, fileType, fileTypeToggle, checks, err, updateFileTypeSummary, updateColumnSummary, setFileTypePanelOpen, setColumnPanelOpen };
      if (window.feather) feather.replace();
      return ui;
    };

    return {
      open: () => new Promise((resolve) => {
        const x = ensure();
        resolver = resolve;
        if (x.fileType) x.fileType.value = 'pdf';
        x.updateFileTypeSummary?.();
        x.checks.forEach((input) => {
          const def = STOCK_EXPORT_COLUMNS.find((col) => col.value === input.value);
          input.checked = !!def?.checked;
        });
        x.updateColumnSummary?.();
        x.setFileTypePanelOpen?.(false);
        x.setColumnPanelOpen?.(false);
        if (x.err) x.err.style.display = 'none';
        x.modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        setTimeout(() => x.fileTypeToggle?.focus?.(), 30);
      }),
    };
  })();

  const downloadBlobResponse = async (res, fallbackName) => {
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    const filename = decodeURIComponent((m && (m[1] || m[2])) || fallbackName);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportFile = async (btn, opts) => {
    if (!btn || !opts) return;
    const fileType = String(opts.fileType || 'pdf').toLowerCase() === 'excel' ? 'excel' : 'pdf';
    const columnsParam = encodeURIComponent((opts.columns || []).join(','));
    const endpoint = fileType === 'excel'
      ? `/api/stock/excel?columns=${columnsParam}`
      : `/api/stock/pdf?columns=${columnsParam}`;
    const fallbackName = fileType === 'excel' ? 'Stocktaking.xlsx' : 'Stocktaking.pdf';

    btn.disabled = true;
    btn.classList.add('is-busy');

    try {
      const res = await fetch(endpoint, { method: 'GET', credentials: 'include' });

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Export failed');
      }

      await downloadBlobResponse(res, fallbackName);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Export failed');
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  };

  if (stockDownloadBtn) {
    stockDownloadBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const opts = await StockExportModal.open();
      if (!opts) return;
      await exportFile(stockDownloadBtn, opts);
    });
  }
});