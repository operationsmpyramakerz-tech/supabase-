document.addEventListener('DOMContentLoaded', () => {
  const ids = (id) => document.getElementById(id);
  const refreshBtn = ids('lmsHomeRefresh');
  const roleLabels = {
    supervisors: 'Supervisors', team_leaders: 'Team Leaders', instructors: 'Instructors',
    co_instructors: 'Co-Instructors', school_coordinators: 'School Coordinators', students: 'Students', parents: 'Parents'
  };
  const resourceLabels = {
    teacher_guide: 'Teacher Guide', lesson_plan: 'Lesson Plan', presentation: 'Presentation', materials: 'Materials', exam: 'Exam'
  };
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

  function renderBreakdown(container, values, labels) {
    if (!container) return;
    const entries = Object.entries(labels).map(([key,label]) => ({ key, label, value:n(values?.[key]) }));
    const max = Math.max(1, ...entries.map((entry) => entry.value));
    container.innerHTML = entries.map((entry) => `<div class="lms-breakdown-row"><label>${safe(entry.label)}</label><div class="lms-breakdown-track"><div class="lms-breakdown-fill" style="width:${Math.round((entry.value/max)*100)}%"></div></div><strong>${entry.value}</strong></div>`).join('');
  }

  function renderRecent(items) {
    const box = ids('lmsRecentCurricula');
    if (!box) return;
    if (!Array.isArray(items) || !items.length) { box.innerHTML = '<div class="lms-empty-mini">No curriculum folders yet.</div>'; return; }
    box.innerHTML = items.slice(0,5).map((item) => {
      const title = item.name || item.title || item.curriculum_name || 'Curriculum';
      const created = item.created_at ? new Date(item.created_at).toLocaleDateString('en-GB') : 'Recently added';
      return `<a class="lms-recent-item" href="/lms/curriculum/${encodeURIComponent(item.id)}"><span><i data-feather="folder"></i></span><div><strong>${safe(title)}</strong><small>${safe(created)}</small></div></a>`;
    }).join('');
  }

  async function load() {
    refreshBtn?.classList.add('is-loading');
    refreshBtn && (refreshBtn.disabled = true);
    try {
      const response = await fetch('/api/lms/home/overview', { credentials:'same-origin', cache:'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load LMS overview');
      ids('lmsKpiSchools').textContent = n(data.counts?.schools);
      ids('lmsKpiPeople').textContent = n(data.counts?.people);
      ids('lmsKpiStructures').textContent = n(data.counts?.structures);
      ids('lmsKpiCurricula').textContent = n(data.counts?.curricula);
      ids('lmsKpiResources').textContent = n(data.counts?.resources);
      renderBreakdown(ids('lmsRoleBreakdown'), data.roles, roleLabels);
      renderBreakdown(ids('lmsResourceBreakdown'), data.resourceTypes, resourceLabels);
      renderRecent(data.recentCurricula);
      ids('lmsHomeUpdated').textContent = `Updated ${new Date().toLocaleString('en-GB')}`;
      if (window.feather) window.feather.replace({width:18,height:18});
    } catch (error) {
      ids('lmsHomeUpdated').innerHTML = `<span class="lms-home-error">${safe(error.message || 'Unable to load LMS overview')}</span>`;
    } finally {
      refreshBtn?.classList.remove('is-loading');
      refreshBtn && (refreshBtn.disabled = false);
    }
  }
  refreshBtn?.addEventListener('click', load);
  load();
});