document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('b2b-schools');
  const searchInput = document.getElementById('b2bSearch');
  const addBtn = document.getElementById('addB2BSchoolBtn');

  let allSchools = [];
  let activeEditId = null;
  let activeEditName = '';
  let modalUi = null;

  const EGYPT_GOVERNORATES = [
    'Cairo', 'Giza', 'Alexandria', 'Dakahlia', 'Red Sea', 'Beheira', 'Fayoum', 'Gharbia',
    'Ismailia', 'Menofia', 'Minya', 'Qalyubia', 'New Valley', 'Suez', 'Aswan', 'Assiut',
    'Beni Suef', 'Port Said', 'Damietta', 'Sharqia', 'South Sinai', 'Kafr El Sheikh',
    'Matrouh', 'Luxor', 'Qena', 'North Sinai', 'Sohag'
  ];

  const yearsRange = (() => {
    const current = new Date().getFullYear();
    const start = Math.min(2020, current - 3);
    const end = current + 15;
    return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
  })();

  const FIELD_GROUPS = [
    {
      name: 'Main data',
      icon: 'database',
      fields: [
        { key: 'school_name', label: 'School Name', type: 'text', required: true, placeholder: 'Example: Test School 1' },
        { key: 'contract_status', label: 'Contract Status', type: 'select', options: ['Renewal', 'New'] },
        { key: 'solution_type', label: 'Solution Type', type: 'select', options: ['Full Solution', 'Lab solution', 'STEAM Attack solution'] },
        { key: 'theme_type', label: 'Theme Type', type: 'multiselect', options: Array.from({ length: 10 }, (_, index) => String(index + 1)) },
        { key: 'education_system', label: 'Education System', type: 'multiselect', options: ['IG', 'American', 'British', 'National'] },
      ],
    },
    {
      name: 'Location & contract',
      icon: 'map-pin',
      fields: [
        { key: 'governorate', label: 'Governorate', type: 'select', options: EGYPT_GOVERNORATES },
        { key: 'location', label: 'Location', type: 'url', placeholder: 'Google Maps link' },
        { key: 'date_of_supply', label: 'Date of Supply', type: 'date' },
        { key: 'contract_file', label: 'Contract File', type: 'file-upload' },
        { key: 'contract_period', label: 'Contract Period', type: 'contract-years' },
        { key: 'accreditation', label: 'Accreditation', type: 'text' },
        { key: 'accreditation_time', label: 'Accreditation Time', type: 'text' },
      ],
    },
    {
      name: 'Team contacts',
      icon: 'users',
      fields: [
        { key: 'coordinator_name', label: 'Coordinator Name', type: 'text' },
        { key: 'coordinator_phone', label: 'Coordinator Phone', type: 'tel' },
        { key: 'accountant_name', label: 'Accountant Name', type: 'text' },
        { key: 'accountant_phone_number', label: 'Accountant Phone Number', type: 'tel' },
      ],
    },
    {
      name: 'Instructor',
      icon: 'user-check',
      fields: [
        { key: 'number_of_instructor', label: 'Number of Instructors', type: 'number' },
      ],
    },
    {
      name: 'Numbers',
      icon: 'hash',
      fields: [
        { key: 'max_students_largest_class', label: 'Max Students Largest Class', type: 'number' },
        { key: 'max_students_per_group', label: 'Max Students Per Group', type: 'number' },
        { key: 'number_of_class', label: 'Number of Classes', type: 'number' },
        { key: 'total_student_population', label: 'Total Student Population', type: 'number' },
      ],
    },
    {
      name: 'Grades',
      icon: 'check-square',
      fields: Array.from({ length: 12 }, (_, index) => ({
        key: `g${index + 1}`,
        label: `Grade ${index + 1}`,
        shortLabel: `G${index + 1}`,
        type: 'checkbox',
      })),
    },
  ];

  const ALL_FIELDS = FIELD_GROUPS.flatMap((group) => group.fields);

  const norm = (value) => String(value || '').toLowerCase().trim();

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return char;
    }
  });

  const abbreviation = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return words
        .slice(0, 2)
        .map((word) => Array.from(word)[0] || '')
        .join('')
        .slice(0, 2)
        .toUpperCase();
    }

    const cleaned = text.replace(/[^0-9A-Za-z\u0600-\u06FF]+/g, '');
    const chars = Array.from(cleaned || text).slice(0, 2).join('');
    return chars.toUpperCase();
  };

  const buildCaption = (school) => {
    const governorate = school.governorate?.name || '';
    const solution = school.programType || school.solutionType || '';
    const educationSystems = Array.isArray(school.educationSystem)
      ? school.educationSystem.filter(Boolean)
      : [];

    const parts = [governorate];
    if (solution) {
      parts.push(solution);
    } else if (educationSystems.length) {
      parts.push(educationSystems.slice(0, 2).join(' · '));
    }

    return parts.filter(Boolean).join(' • ') || 'Open school folder';
  };

  const buildChips = (school) => {
    const governorate = school.governorate?.name || '';
    const solution = school.programType || school.solutionType || '';
    const educationSystems = Array.isArray(school.educationSystem)
      ? school.educationSystem.filter(Boolean)
      : [];

    const rawTokens = [governorate, solution, ...educationSystems]
      .map(abbreviation)
      .filter(Boolean);

    const uniqueTokens = [...new Set(rawTokens)].slice(0, 3);
    return uniqueTokens.length ? uniqueTokens : ['B2'];
  };

  function closeActionMenus() {
    document.querySelectorAll('.school-folder-card.is-actions-open').forEach((node) => {
      node.classList.remove('is-actions-open');
      const btn = node.querySelector('[data-school-actions-toggle]');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  const render = (rows) => {
    if (!grid) return;
    grid.innerHTML = '';

    if (!Array.isArray(rows) || rows.length === 0) {
      grid.innerHTML = '<div class="empty-block">No schools found.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();

    rows
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .forEach((school) => {
        const card = document.createElement('div');
        const schoolName = school.name || 'Untitled';
        const caption = buildCaption(school);
        const chips = buildChips(school);

        card.className = 'school-folder-card';
        card.innerHTML = `
          <a class="school-folder" href="/b2b/school/${encodeURIComponent(school.id)}" aria-label="Open ${escapeHtml(schoolName)}">
            <div class="school-folder__figure" aria-hidden="true">
              <span class="school-folder__paper school-folder__paper--left"></span>
              <span class="school-folder__paper school-folder__paper--right"></span>
              <span class="school-folder__back"></span>
              <span class="school-folder__front">
                <span class="school-folder__chips">
                  ${chips.map((chip, index) => `<span class="school-folder__chip school-folder__chip--${Math.min(index + 1, 3)}">${escapeHtml(chip)}</span>`).join('')}
                </span>
              </span>
            </div>
            <div class="school-folder__name" title="${escapeHtml(schoolName)}">${escapeHtml(schoolName)}</div>
            <div class="school-folder__caption">${escapeHtml(caption)}</div>
          </a>
          <div class="school-folder-actions">
            <button class="school-folder__menu-btn" type="button" data-school-actions-toggle aria-label="School actions" aria-expanded="false">
              <i data-feather="more-horizontal"></i>
            </button>
            <div class="school-folder__actions-menu" data-school-actions-menu>
              <button type="button" data-edit-school="${escapeHtml(school.id)}">
                <i data-feather="edit-3"></i>
                <span>Edit</span>
              </button>
              <button type="button" class="is-danger" data-delete-school="${escapeHtml(school.id)}">
                <i data-feather="trash-2"></i>
                <span>Delete</span>
              </button>
            </div>
          </div>
        `;

        const menuToggle = card.querySelector('[data-school-actions-toggle]');
        if (menuToggle) {
          menuToggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const willOpen = !card.classList.contains('is-actions-open');
            closeActionMenus();
            card.classList.toggle('is-actions-open', willOpen);
            menuToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
          });
        }

        const editBtn = card.querySelector('[data-edit-school]');
        if (editBtn) {
          editBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeActionMenus();
            openEditModal(school.id, schoolName);
          });
        }

        const deleteBtn = card.querySelector('[data-delete-school]');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeActionMenus();
            deleteSchool(school.id, schoolName);
          });
        }

        fragment.appendChild(card);
      });

    grid.appendChild(fragment);

    if (window.feather) {
      feather.replace();
    }
  };

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.school-folder-actions')) closeActionMenus();
  });

  const applyFilter = () => {
    const query = norm(searchInput ? searchInput.value : '');
    if (!query) {
      render(allSchools);
      return;
    }

    const filtered = allSchools.filter((school) => {
      const name = norm(school.name);
      const governorate = norm(school.governorate?.name);
      const educationSystem = norm(Array.isArray(school.educationSystem) ? school.educationSystem.join(' ') : '');
      const solution = norm(school.programType || school.solutionType);
      return name.includes(query) || governorate.includes(query) || educationSystem.includes(query) || solution.includes(query);
    });

    render(filtered);
  };

  const fetchSchools = async () => {
    if (grid) {
      grid.innerHTML = `
        <div class="modern-loading" role="status" aria-live="polite">
          <div class="modern-loading__spinner" aria-hidden="true"></div>
          <div class="modern-loading__text">
            Loading schools
            <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span>
          </div>
        </div>
      `;
    }

    try {
      const response = await fetch('/api/b2b/schools', { credentials: 'include' });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Failed to load B2B schools');
      }
      const data = await response.json();
      allSchools = Array.isArray(data) ? data : [];
      applyFilter();
    } catch (error) {
      console.error(error);
      if (grid) {
        grid.innerHTML = `
          <div class="error-block">
            <strong>Could not load B2B schools.</strong><br>
            <span>${escapeHtml(error.message || 'Please try again later.')}</span>
          </div>
        `;
      }
    }
  };

  const ensureModal = () => {
    if (modalUi) return modalUi;

    const modal = document.createElement('div');
    modal.className = 'b2b-school-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="b2b-school-modal__backdrop" data-b2b-modal-close></div>
      <form class="b2b-school-modal__dialog" data-b2b-school-form>
        <div class="b2b-school-modal__header">
          <div>
            <div class="b2b-school-modal__eyebrow">B2B schools database</div>
            <h2 class="b2b-school-modal__title" data-b2b-modal-title>Add school</h2>
            <p class="b2b-school-modal__subtitle" data-b2b-modal-subtitle>Create or update a school folder directly in Supabase.</p>
            <div class="b2b-school-form-error" data-b2b-modal-error></div>
          </div>
          <button class="b2b-school-modal__close" type="button" data-b2b-modal-close aria-label="Close">&times;</button>
        </div>
        <div class="b2b-school-modal__body" data-b2b-modal-body></div>
        <div class="b2b-school-modal__footer">
          <button class="b2b-modal-btn b2b-modal-btn--light" type="button" data-b2b-modal-close>Cancel</button>
          <button class="b2b-modal-btn b2b-modal-btn--dark" type="submit" data-b2b-modal-submit>Save</button>
        </div>
      </form>
    `;

    document.body.appendChild(modal);

    const form = modal.querySelector('[data-b2b-school-form]');
    const title = modal.querySelector('[data-b2b-modal-title]');
    const subtitle = modal.querySelector('[data-b2b-modal-subtitle]');
    const body = modal.querySelector('[data-b2b-modal-body]');
    const submit = modal.querySelector('[data-b2b-modal-submit]');
    const error = modal.querySelector('[data-b2b-modal-error]');

    modal.querySelectorAll('[data-b2b-modal-close]').forEach((node) => {
      node.addEventListener('click', () => closeModal());
    });

    form.addEventListener('submit', handleModalSubmit);

    modalUi = { modal, form, title, subtitle, body, submit, error };
    renderModalFields({});
    return modalUi;
  };

  const normalizeDateValue = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const iso = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    return iso || '';
  };

  const selectOptionsHtml = (field, currentValue = '') => {
    const value = String(currentValue ?? '').trim();
    const options = Array.isArray(field.options) ? field.options.map(String) : [];
    const allOptions = value && !options.some((option) => norm(option) === norm(value))
      ? [value, ...options]
      : options;

    return [
      `<option value="">Select ${escapeHtml(field.label)}</option>`,
      ...allOptions.map((option) => `<option value="${escapeHtml(option)}" ${norm(option) === norm(value) ? 'selected' : ''}>${escapeHtml(option)}</option>`),
    ].join('');
  };

  const parseContractYears = (value = '') => {
    const years = String(value || '').match(/\b(19|20)\d{2}\b/g) || [];
    return { from: years[0] || '', to: years[1] || '' };
  };

  const contractYearsOptions = (selected = '') => {
    const clean = String(selected || '').trim();
    const list = clean && !yearsRange.includes(clean) ? [clean, ...yearsRange] : yearsRange;
    return [
      '<option value="">Year</option>',
      ...list.map((year) => `<option value="${escapeHtml(year)}" ${year === clean ? 'selected' : ''}>${escapeHtml(year)}</option>`),
    ].join('');
  };

  const parseChoiceValues = (value = '') => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    const raw = String(value ?? '').trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter(Boolean);
      }
    } catch {}
    return raw.split(/[,\n;|]+/).map((item) => item.trim()).filter(Boolean);
  };

  const choiceOptions = (field, currentValue = '', { multi = false } = {}) => {
    const selected = multi ? parseChoiceValues(currentValue) : [String(currentValue ?? '').trim()].filter(Boolean);
    const options = Array.isArray(field.options) ? field.options.map(String) : [];
    const selectedMissing = selected.filter((value) => value && !options.some((option) => norm(option) === norm(value)));
    return [...selectedMissing, ...options];
  };

  const selectedChoiceLabel = (field, currentValue = '', { multi = false } = {}) => {
    const selected = multi ? parseChoiceValues(currentValue) : [String(currentValue ?? '').trim()].filter(Boolean);
    if (selected.length) return selected.join(', ');
    return field.placeholder || `Select ${field.label}`;
  };

  const renderModernSelect = (field, currentValue = '', { multi = false, nameOverride = '', idOverride = '', dataAttrs = '' } = {}) => {
    const options = choiceOptions(field, currentValue, { multi });
    const selected = multi ? parseChoiceValues(currentValue) : [String(currentValue ?? '').trim()].filter(Boolean);
    const selectedCanon = new Set(selected.map(norm));
    const hiddenValue = multi ? selected.join(', ') : (selected[0] || '');
    const name = nameOverride || field.key;
    const id = idOverride || `b2b_${field.key}`;
    return `
      <div class="b2b-school-field">
        <label for="${escapeHtml(id)}">${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>
        <div class="b2b-modern-select" data-b2b-modern-select data-multi="${multi ? 'true' : 'false'}">
          <input id="${escapeHtml(id)}" type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(hiddenValue)}" ${dataAttrs} />
          <button class="b2b-modern-select__button" type="button" data-b2b-select-toggle aria-expanded="false">
            <span data-b2b-select-summary>${escapeHtml(selectedChoiceLabel(field, currentValue, { multi }))}</span>
            <i data-feather="chevron-down"></i>
          </button>
          <div class="b2b-modern-select__panel" data-b2b-select-panel hidden>
            ${multi ? options.map((option) => `
              <label class="b2b-modern-option b2b-modern-option--check">
                <input type="checkbox" data-b2b-option-checkbox value="${escapeHtml(option)}" ${selectedCanon.has(norm(option)) ? 'checked' : ''} />
                <span>${escapeHtml(option)}</span>
              </label>
            `).join('') : `
              <button class="b2b-modern-option ${hiddenValue ? '' : 'is-selected'}" type="button" data-b2b-option-value="">
                <span>${escapeHtml(field.placeholder || `Select ${field.label}`)}</span>
              </button>
              ${options.map((option) => `
                <button class="b2b-modern-option ${norm(option) === norm(hiddenValue) ? 'is-selected' : ''}" type="button" data-b2b-option-value="${escapeHtml(option)}">
                  <span>${escapeHtml(option)}</span>
                </button>
              `).join('')}
            `}
          </div>
        </div>
      </div>
    `;
  };

  const renderField = (field, values = {}) => {
    const value = field.type === 'date' ? normalizeDateValue(values[field.key]) : String(values[field.key] ?? '');

    if (field.type === 'select') {
      return renderModernSelect(field, value, { multi: false });
    }

    if (field.type === 'multiselect') {
      return renderModernSelect(field, value, { multi: true });
    }

    if (field.type === 'file-upload') {
      const hasValue = !!String(value || '').trim();
      return `
        <div class="b2b-school-field b2b-school-field--wide b2b-file-field">
          <label for="b2b_${escapeHtml(field.key)}">${escapeHtml(field.label)}</label>
          <input id="b2b_${escapeHtml(field.key)}" type="hidden" name="${escapeHtml(field.key)}" value="${escapeHtml(value)}" />
          <input class="b2b-file-input" type="file" data-b2b-contract-file-input hidden />
          <button class="b2b-file-upload-btn" type="button" data-b2b-file-upload-btn>
            <span class="b2b-file-upload-btn__icon"><i data-feather="upload-cloud"></i></span>
            <span>
              <strong>${hasValue ? 'Replace contract file' : 'Upload contract file'}</strong>
              <small>${hasValue ? 'A contract file is already linked.' : 'PDF, image, Word, Excel, or any contract document.'}</small>
            </span>
          </button>
          <div class="b2b-file-upload-meta" data-b2b-file-meta>
            ${hasValue ? `<a href="${escapeHtml(value)}" target="_blank" rel="noopener">Open current contract file</a>` : 'No contract file selected yet.'}
          </div>
        </div>
      `;
    }

    if (field.type === 'contract-years') {
      const parsed = parseContractYears(value);
      const yearField = { label: 'Year', options: yearsRange, placeholder: 'Year' };
      return `
        <div class="b2b-school-field b2b-school-field--wide">
          <label>${escapeHtml(field.label)}</label>
          <div class="b2b-contract-years" data-contract-period-field>
            ${renderModernSelect(yearField, parsed.from, { nameOverride: '', idOverride: 'b2b_contract_from', dataAttrs: 'data-contract-period-from' }).replace('<div class="b2b-school-field">', '<div class="b2b-school-field b2b-school-field--contract-year">')}
            <span>to</span>
            ${renderModernSelect(yearField, parsed.to, { nameOverride: '', idOverride: 'b2b_contract_to', dataAttrs: 'data-contract-period-to' }).replace('<div class="b2b-school-field">', '<div class="b2b-school-field b2b-school-field--contract-year">')}
          </div>
        </div>
      `;
    }

    return `
      <div class="b2b-school-field">
        <label for="b2b_${escapeHtml(field.key)}">${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>
        <input
          id="b2b_${escapeHtml(field.key)}"
          name="${escapeHtml(field.key)}"
          type="${escapeHtml(field.type || 'text')}"
          value="${escapeHtml(value)}"
          ${field.required ? 'required' : ''}
          ${field.type === 'number' ? 'step="any"' : ''}
          placeholder="${escapeHtml(field.placeholder || '')}"
        />
      </div>
    `;
  };

  function bindModernChoiceControls(container) {
    const closeAll = (except = null) => {
      container.querySelectorAll('[data-b2b-modern-select].is-open').forEach((wrap) => {
        if (except && wrap === except) return;
        wrap.classList.remove('is-open');
        const panel = wrap.querySelector('[data-b2b-select-panel]');
        const toggle = wrap.querySelector('[data-b2b-select-toggle]');
        if (panel) panel.hidden = true;
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      });
    };

    container.querySelectorAll('[data-b2b-modern-select]').forEach((wrap) => {
      const toggle = wrap.querySelector('[data-b2b-select-toggle]');
      const panel = wrap.querySelector('[data-b2b-select-panel]');
      const input = wrap.querySelector('input[type="hidden"]');
      const summary = wrap.querySelector('[data-b2b-select-summary]');
      const isMulti = wrap.dataset.multi === 'true';
      const placeholder = summary?.textContent || 'Select';

      const updateSummary = () => {
        if (!input || !summary) return;
        const values = isMulti
          ? Array.from(wrap.querySelectorAll('[data-b2b-option-checkbox]:checked')).map((checkbox) => checkbox.value).filter(Boolean)
          : [input.value].filter(Boolean);
        if (isMulti) input.value = values.join(', ');
        summary.textContent = values.length ? values.join(', ') : placeholder;
        wrap.classList.toggle('has-value', values.length > 0);
      };

      updateSummary();

      if (toggle && panel) {
        toggle.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const willOpen = !wrap.classList.contains('is-open');
          closeAll(wrap);
          wrap.classList.toggle('is-open', willOpen);
          panel.hidden = !willOpen;
          toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });
      }

      if (isMulti) {
        wrap.querySelectorAll('[data-b2b-option-checkbox]').forEach((checkbox) => {
          checkbox.addEventListener('change', updateSummary);
        });
      } else {
        wrap.querySelectorAll('[data-b2b-option-value]').forEach((optionBtn) => {
          optionBtn.addEventListener('click', (event) => {
            event.preventDefault();
            const value = optionBtn.getAttribute('data-b2b-option-value') || '';
            if (input) input.value = value;
            wrap.querySelectorAll('[data-b2b-option-value]').forEach((node) => node.classList.remove('is-selected'));
            optionBtn.classList.add('is-selected');
            if (summary) summary.textContent = value || placeholder;
            closeAll();
          });
        });
      }
    });

    container.addEventListener('click', (event) => {
      if (!event.target.closest('[data-b2b-modern-select]')) closeAll();
    });
  }

  function bindContractFileUpload(container) {
    const input = container.querySelector('[data-b2b-contract-file-input]');
    const button = container.querySelector('[data-b2b-file-upload-btn]');
    const meta = container.querySelector('[data-b2b-file-meta]');
    if (!input || !button) return;
    button.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const sizeKb = Math.max(1, Math.round(file.size / 1024));
      if (meta) meta.textContent = `${file.name} • ${sizeKb} KB selected. It will upload after saving.`;
      button.classList.add('has-file');
    });
  }

  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });

  async function uploadPendingContractFile(form, values = {}) {
    const input = form.querySelector('[data-b2b-contract-file-input]');
    const file = input?.files && input.files[0];
    if (!file) return values;
    const dataUrl = await fileToDataUrl(file);
    const response = await fetch('/api/b2b/upload-file', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'contract-file',
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        dataUrl,
      }),
    });
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || 'Failed to upload contract file.');
    }
    const uploaded = await response.json();
    return { ...values, contract_file: uploaded.url || uploaded.publicUrl || values.contract_file || '' };
  }

  function selectedGradeLabels(container) {
    const selected = Array.from(container.querySelectorAll('.b2b-grades-menu input[type="checkbox"]:checked'))
      .map((input) => input.getAttribute('data-grade-label') || input.value || '')
      .filter(Boolean);
    return selected.length ? selected.join(', ') : 'Select grades';
  }

  function bindGradesDropdown(container) {
    const wrap = container.querySelector('[data-b2b-grades-dropdown]');
    if (!wrap) return;
    const toggle = wrap.querySelector('[data-b2b-grades-toggle]');
    const panel = wrap.querySelector('[data-b2b-grades-panel]');
    const summary = wrap.querySelector('[data-b2b-grades-summary]');
    const updateSummary = () => {
      if (summary) summary.textContent = selectedGradeLabels(wrap);
    };
    updateSummary();
    if (toggle && panel) {
      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        const isOpen = wrap.classList.toggle('is-open');
        panel.hidden = !isOpen;
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    }
    wrap.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', updateSummary);
    });
  }

  function renderGradesSection(group, values = {}) {
    return `
      <section class="b2b-school-form-section">
        <h3 class="b2b-school-form-section__title"><i data-feather="${escapeHtml(group.icon || 'check-square')}"></i>${escapeHtml(group.name)}</h3>
        <div class="b2b-grades-dropdown" data-b2b-grades-dropdown>
          <button class="b2b-grades-dropdown__toggle" type="button" data-b2b-grades-toggle aria-expanded="false">
            <span data-b2b-grades-summary>Select grades</span>
            <i data-feather="chevron-down"></i>
          </button>
          <div class="b2b-grades-menu" data-b2b-grades-panel hidden>
            ${group.fields.map((field) => `
              <label class="b2b-grade-check">
                <input type="checkbox" name="${escapeHtml(field.key)}" value="${escapeHtml(field.shortLabel || field.label)}" data-grade-label="${escapeHtml(field.shortLabel || field.label)}" ${values[field.key] ? 'checked' : ''} />
                <span>${escapeHtml(field.label)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderModalFields(values = {}) {
    const ui = ensureModal();
    const sections = FIELD_GROUPS.map((group) => {
      if (group.name === 'Grades') return renderGradesSection(group, values);

      return `
        <section class="b2b-school-form-section">
          <h3 class="b2b-school-form-section__title"><i data-feather="${escapeHtml(group.icon || 'database')}"></i>${escapeHtml(group.name)}</h3>
          <div class="b2b-school-form-grid">
            ${group.fields.map((field) => renderField(field, values)).join('')}
          </div>
        </section>
      `;
    }).join('');

    ui.body.innerHTML = sections;
    bindGradesDropdown(ui.body);
    bindModernChoiceControls(ui.body);
    bindContractFileUpload(ui.body);
    if (window.feather) feather.replace();
  }

  function setModalError(message = '') {
    const ui = ensureModal();
    const text = String(message || '').trim();
    ui.error.textContent = text;
    ui.error.classList.toggle('is-visible', !!text);
  }

  function openModal({ mode = 'add', values = {}, schoolName = '' } = {}) {
    const ui = ensureModal();
    activeEditId = mode === 'edit' ? activeEditId : null;
    activeEditName = mode === 'edit' ? schoolName : '';
    ui.title.textContent = mode === 'edit' ? 'Edit school' : 'Add school';
    ui.subtitle.textContent = mode === 'edit'
      ? `Update ${schoolName || 'this school'} data directly in Supabase.`
      : 'Create a new B2B school folder directly in Supabase.';
    ui.submit.textContent = mode === 'edit' ? 'Save Changes' : 'Add School';
    ui.submit.disabled = false;
    setModalError('');
    renderModalFields(values || {});
    ui.modal.classList.add('is-open');
    ui.modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setTimeout(() => {
      const first = ui.form.querySelector('[name="school_name"]');
      if (first) first.focus({ preventScroll: true });
    }, 80);
  }

  function closeModal() {
    if (!modalUi) return;
    modalUi.modal.classList.remove('is-open');
    modalUi.modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    activeEditId = null;
    activeEditName = '';
    setModalError('');
  }

  const openAddModal = () => {
    activeEditId = null;
    openModal({ mode: 'add', values: {} });
  };

  function normalizeSchoolFieldsForUi(data = {}, fallbackName = '') {
    const fields = data?.fields && typeof data.fields === 'object' ? { ...data.fields } : {};
    fields.school_name = fields.school_name || data?.name || fallbackName || '';
    fields.governorate = fields.governorate || data?.governorate?.name || '';
    fields.location = fields.location || data?.location || '';
    fields.solution_type = fields.solution_type || fields.program_type || data?.programType || data?.solutionType || '';
    fields.education_system = fields.education_system || (Array.isArray(data?.educationSystem) ? data.educationSystem.join(', ') : '');
    if (data?.grades && typeof data.grades === 'object') {
      for (let i = 1; i <= 12; i += 1) {
        const key = `g${i}`;
        if (typeof fields[key] === 'undefined') fields[key] = !!data.grades[i];
      }
    }
    return fields;
  }

  async function openEditModal(id, schoolName = '') {
    const cleanId = String(id || '').trim();
    if (!cleanId) return;
    const ui = ensureModal();
    activeEditId = cleanId;
    activeEditName = schoolName;
    openModal({ mode: 'edit', values: { school_name: schoolName }, schoolName });
    ui.submit.disabled = true;
    ui.submit.textContent = 'Loading...';
    try {
      const response = await fetch(`/api/b2b/schools/${encodeURIComponent(cleanId)}`, { credentials: 'include' });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Failed to load school data');
      }
      const data = await response.json();
      activeEditId = cleanId;
      activeEditName = data?.name || schoolName;
      const values = normalizeSchoolFieldsForUi(data, schoolName);
      ui.title.textContent = 'Edit school';
      ui.subtitle.textContent = `Update ${data?.name || schoolName || 'this school'} data directly in Supabase.`;
      renderModalFields(values);
      setModalError('');
    } catch (error) {
      console.error(error);
      setModalError(error.message || 'Failed to load school data.');
    } finally {
      ui.submit.disabled = false;
      ui.submit.textContent = 'Save Changes';
    }
  }

  function getContractPeriodValue(form) {
    const from = String(form.querySelector('[data-contract-period-from]')?.value || '').trim();
    const to = String(form.querySelector('[data-contract-period-to]')?.value || '').trim();
    if (from && to) return `${from} - ${to}`;
    return from || to || '';
  }

  function getFormValues(form) {
    const values = {};
    ALL_FIELDS.forEach((field) => {
      if (field.type === 'contract-years') {
        values[field.key] = getContractPeriodValue(form);
        return;
      }
      const el = form.querySelector(`[name="${CSS.escape(field.key)}"]`);
      if (!el) return;
      if (field.type === 'checkbox') {
        values[field.key] = !!el.checked;
      } else {
        values[field.key] = String(el.value || '').trim();
      }
    });
    return values;
  }

  async function handleModalSubmit(event) {
    event.preventDefault();
    const ui = ensureModal();
    let values = getFormValues(ui.form);
    const mode = activeEditId ? 'edit' : 'add';
    const url = mode === 'edit'
      ? `/api/b2b/schools/${encodeURIComponent(activeEditId)}`
      : '/api/b2b/schools';
    const method = mode === 'edit' ? 'PATCH' : 'POST';

    ui.submit.disabled = true;
    ui.submit.textContent = mode === 'edit' ? 'Saving...' : 'Adding...';
    setModalError('');

    try {
      if (ui.form.querySelector('[data-b2b-contract-file-input]')?.files?.[0]) {
        ui.submit.textContent = 'Uploading...';
        values = await uploadPendingContractFile(ui.form, values);
        ui.submit.textContent = mode === 'edit' ? 'Saving...' : 'Adding...';
      }
      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: values }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Failed to save school');
      }

      closeModal();
      await fetchSchools();
    } catch (error) {
      console.error(error);
      setModalError(error.message || 'Failed to save school.');
    } finally {
      ui.submit.disabled = false;
      ui.submit.textContent = mode === 'edit' ? 'Save Changes' : 'Add School';
    }
  }

  function ensureDeleteConfirmModal() {
    let modal = document.querySelector('[data-b2b-delete-modal]');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'b2b-delete-modal';
    modal.dataset.b2bDeleteModal = 'true';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="b2b-delete-modal__backdrop" data-delete-cancel></div>
      <div class="b2b-delete-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="b2bDeleteTitle">
        <div class="b2b-delete-modal__icon"><i data-feather="trash-2"></i></div>
        <h3 id="b2bDeleteTitle">Delete school?</h3>
        <p data-delete-message>This action cannot be undone.</p>
        <div class="b2b-delete-modal__actions">
          <button type="button" class="b2b-delete-modal__btn b2b-delete-modal__btn--light" data-delete-cancel>Cancel</button>
          <button type="button" class="b2b-delete-modal__btn b2b-delete-modal__btn--danger" data-delete-confirm>Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (window.feather) feather.replace();
    return modal;
  }

  function requestDeleteConfirmation(schoolName = '') {
    const modal = ensureDeleteConfirmModal();
    const message = modal.querySelector('[data-delete-message]');
    if (message) {
      message.textContent = `Delete ${schoolName || 'this school'}? This action cannot be undone.`;
    }
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    return new Promise((resolve) => {
      const cleanup = (answer) => {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        modal.querySelectorAll('[data-delete-cancel], [data-delete-confirm]').forEach((node) => {
          node.removeEventListener('click', onClick);
        });
        document.removeEventListener('keydown', onKeydown);
        resolve(answer);
      };
      const onClick = (event) => {
        if (event.currentTarget.hasAttribute('data-delete-confirm')) cleanup(true);
        else cleanup(false);
      };
      const onKeydown = (event) => {
        if (event.key === 'Escape') cleanup(false);
      };
      modal.querySelectorAll('[data-delete-cancel], [data-delete-confirm]').forEach((node) => {
        node.addEventListener('click', onClick);
      });
      document.addEventListener('keydown', onKeydown);
    });
  }

  async function deleteSchool(id, schoolName = '') {
    const cleanId = String(id || '').trim();
    if (!cleanId) return;
    const confirmed = await requestDeleteConfirmation(schoolName || 'this school');
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/b2b/schools/${encodeURIComponent(cleanId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Failed to delete school');
      }
      await fetchSchools();
    } catch (error) {
      console.error(error);
      window.alert(error.message || 'Failed to delete school.');
    }
  }

  fetchSchools();

  if (addBtn) {
    addBtn.addEventListener('click', openAddModal);
  }

  if (searchInput) {
    searchInput.addEventListener('input', applyFilter);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && searchInput.value) {
        searchInput.value = '';
        applyFilter();
      }
    });
  }
});
