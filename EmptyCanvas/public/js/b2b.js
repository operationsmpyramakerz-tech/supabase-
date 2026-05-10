document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('b2b-schools');
  const searchInput = document.getElementById('b2bSearch');
  const addBtn = document.getElementById('addB2BSchoolBtn');

  let allSchools = [];
  let activeEditId = null;
  let activeEditName = '';
  let modalUi = null;

  const FIELD_GROUPS = [
    {
      name: 'Main data',
      fields: [
        { key: 'school_name', label: 'School Name', type: 'text', required: true, placeholder: 'Example: Test School 1' },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'contract_status', label: 'Contract Status', type: 'text' },
        { key: 'program_type', label: 'Program Type', type: 'text' },
        { key: 'theme_type', label: 'Theme Type', type: 'text' },
        { key: 'education_system', label: 'Education System', type: 'text', placeholder: 'National, British, American...' },
      ],
    },
    {
      name: 'Location & contract',
      fields: [
        { key: 'governorate', label: 'Governorate', type: 'text' },
        { key: 'location', label: 'Location', type: 'url', placeholder: 'Google Maps link' },
        { key: 'date_of_supply', label: 'Date of Supply', type: 'date' },
        { key: 'contract_file', label: 'Contract File', type: 'url' },
        { key: 'contract_period', label: 'Contract Period', type: 'text' },
        { key: 'accreditation', label: 'Accreditation', type: 'text' },
        { key: 'accreditation_time', label: 'Accreditation Time', type: 'text' },
      ],
    },
    {
      name: 'Team contacts',
      fields: [
        { key: 'assignee_to', label: 'Assignee To', type: 'text' },
        { key: 'coordinator_name', label: 'Coordinator Name', type: 'text' },
        { key: 'coordinator_phone', label: 'Coordinator Phone', type: 'tel' },
        { key: 'accountant_name', label: 'Accountant Name', type: 'text' },
        { key: 'accountant_phone_number', label: 'Accountant Phone Number', type: 'tel' },
      ],
    },
    {
      name: 'Numbers',
      fields: [
        { key: 'max_students_largest_class', label: 'Max Students Largest Class', type: 'number' },
        { key: 'max_students_per_group', label: 'Max Students Per Group', type: 'number' },
        { key: 'number_of_class', label: 'Number of Classes', type: 'number' },
        { key: 'number_of_instructor', label: 'Number of Instructors', type: 'number' },
        { key: 'total_student_population', label: 'Total Student Population', type: 'number' },
      ],
    },
    {
      name: 'Grades',
      fields: Array.from({ length: 12 }, (_, index) => ({
        key: `g${index + 1}`,
        label: `G${index + 1}`,
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
    const program = school.programType || '';
    const educationSystems = Array.isArray(school.educationSystem)
      ? school.educationSystem.filter(Boolean)
      : [];

    const parts = [governorate];
    if (program) {
      parts.push(program);
    } else if (educationSystems.length) {
      parts.push(educationSystems.slice(0, 2).join(' · '));
    }

    return parts.filter(Boolean).join(' • ') || 'Open school folder';
  };

  const buildChips = (school) => {
    const governorate = school.governorate?.name || '';
    const program = school.programType || '';
    const educationSystems = Array.isArray(school.educationSystem)
      ? school.educationSystem.filter(Boolean)
      : [];

    const rawTokens = [governorate, program, ...educationSystems]
      .map(abbreviation)
      .filter(Boolean);

    const uniqueTokens = [...new Set(rawTokens)].slice(0, 3);
    return uniqueTokens.length ? uniqueTokens : ['B2'];
  };

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
          <button class="school-folder__edit" type="button" data-edit-school="${escapeHtml(school.id)}" aria-label="Edit ${escapeHtml(schoolName)}">
            <i data-feather="edit-3"></i>
            <span>Edit</span>
          </button>
        `;

        const editBtn = card.querySelector('[data-edit-school]');
        if (editBtn) {
          editBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openEditModal(school.id, schoolName);
          });
        }

        fragment.appendChild(card);
      });

    grid.appendChild(fragment);

    if (window.feather) {
      feather.replace();
    }
  };

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
      const program = norm(school.programType);
      return name.includes(query) || governorate.includes(query) || educationSystem.includes(query) || program.includes(query);
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
      if (response.status === 401 || response.redirected) {
        window.location.href = '/login';
        return;
      }

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Failed to load schools');
      }

      const data = await response.json();
      allSchools = Array.isArray(data) ? data : [];
      applyFilter();
    } catch (error) {
      console.error(error);
      if (grid) {
        grid.innerHTML = `<div class="error-block">Error: ${escapeHtml(error.message)}</div>`;
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

  function renderModalFields(values = {}) {
    const ui = ensureModal();
    const sections = FIELD_GROUPS.map((group) => {
      if (group.name === 'Grades') {
        return `
          <section class="b2b-school-form-section">
            <h3 class="b2b-school-form-section__title"><i data-feather="check-square"></i>${escapeHtml(group.name)}</h3>
            <div class="b2b-school-grades">
              ${group.fields.map((field) => `
                <label class="b2b-grade-check">
                  <input type="checkbox" name="${escapeHtml(field.key)}" ${values[field.key] ? 'checked' : ''} />
                  <span>${escapeHtml(field.label)}</span>
                </label>
              `).join('')}
            </div>
          </section>
        `;
      }

      return `
        <section class="b2b-school-form-section">
          <h3 class="b2b-school-form-section__title"><i data-feather="database"></i>${escapeHtml(group.name)}</h3>
          <div class="b2b-school-form-grid">
            ${group.fields.map((field) => {
              const value = field.type === 'date' ? normalizeDateValue(values[field.key]) : String(values[field.key] ?? '');
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
            }).join('')}
          </div>
        </section>
      `;
    }).join('');

    ui.body.innerHTML = sections;
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
      const values = data?.fields && typeof data.fields === 'object'
        ? data.fields
        : {
            school_name: data?.name || schoolName,
            governorate: data?.governorate?.name || '',
            location: data?.location || '',
            program_type: data?.programType || '',
            education_system: Array.isArray(data?.educationSystem) ? data.educationSystem.join(', ') : '',
            ...(data?.grades || {}),
          };
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

  function getFormValues(form) {
    const values = {};
    ALL_FIELDS.forEach((field) => {
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
    const values = getFormValues(ui.form);
    const mode = activeEditId ? 'edit' : 'add';
    const url = mode === 'edit'
      ? `/api/b2b/schools/${encodeURIComponent(activeEditId)}`
      : '/api/b2b/schools';
    const method = mode === 'edit' ? 'PATCH' : 'POST';

    ui.submit.disabled = true;
    ui.submit.textContent = mode === 'edit' ? 'Saving...' : 'Adding...';
    setModalError('');

    try {
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
