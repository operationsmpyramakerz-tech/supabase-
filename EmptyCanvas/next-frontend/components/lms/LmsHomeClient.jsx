"use client";

import { useMemo, useState } from "react";

const ROLE_LABELS = {
  supervisors: "Supervisors",
  team_leaders: "Team Leaders",
  instructors: "Instructors",
  co_instructors: "Co-Instructors",
  school_coordinators: "School Coordinators",
  students: "Students",
  parents: "Parents",
};

const RESOURCE_LABELS = {
  book: "Books",
  teacher_guide: "Teacher guides",
  lesson_plan: "Lesson plans",
  presentation: "Presentations",
  materials: "Materials",
  exam: "Exams",
};

const QUICK_LINKS = [
  {
    key: "lms-users-center",
    title: "Users Center",
    description: "Manage LMS roles, directories, structures, and page permissions.",
    href: "/lms/user-access",
    icon: "UC",
  },
  {
    key: "lms-b2b",
    title: "Schools",
    description: "Open school records, stock, contacts, and operational details.",
    href: "/lms/b2b",
    icon: "SC",
  },
  {
    key: "lms-curriculum",
    title: "Curriculum",
    description: "Browse curriculum folders, grades, books, and learning resources.",
    href: "/lms/curriculum",
    icon: "CR",
  },
];

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? "Recently added"
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function curriculumTitle(item) {
  return text(item?.name || item?.title || item?.curriculum_name || item?.curriculumName) || "Curriculum";
}

function curriculumId(item) {
  return text(item?.id || item?.curriculum_id || item?.curriculumId);
}

function accessKey(page) {
  return text(page?.pageKey || page?.page_key).toLowerCase();
}

function Breakdown({ values, labels, emptyText }) {
  const rows = Object.entries(labels).map(([key, label]) => ({ key, label, value: number(values?.[key]) }));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(1, ...rows.map((row) => row.value));

  if (!total) return <p className="next-lms-empty-copy">{emptyText}</p>;

  return (
    <div className="next-lms-breakdown">
      {rows.map((row) => (
        <div className="next-lms-breakdown-row" key={row.key}>
          <div className="next-lms-breakdown-label"><span>{row.label}</span><strong>{row.value}</strong></div>
          <div className="next-lms-breakdown-track" aria-label={`${row.label}: ${row.value}`}>
            <span style={{ width: `${Math.max(row.value ? 5 : 0, (row.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function KpiCard({ label, value, note, symbol }) {
  return (
    <article className="next-lms-kpi">
      <span className="next-lms-kpi-symbol">{symbol}</span>
      <div><small>{label}</small><strong>{number(value).toLocaleString("en-GB")}</strong><p>{note}</p></div>
    </article>
  );
}

export default function LmsHomeClient({ initialOverview, access, omitted = [] }) {
  const [overview, setOverview] = useState(initialOverview || {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(new Date());

  const allowedKeys = useMemo(
    () => new Set((Array.isArray(access?.pages) ? access.pages : []).map(accessKey).filter(Boolean)),
    [access],
  );
  const visibleQuickLinks = QUICK_LINKS.filter((item) => access?.isBuiltInAdmin || allowedKeys.has(item.key));
  const counts = overview?.counts || {};
  const people = number(counts.people);
  const schools = number(counts.schools);
  const resources = number(counts.resources);
  const curricula = number(counts.curricula);
  const teamPerSchool = schools ? (people / schools).toFixed(1) : "0.0";
  const resourcesPerCurriculum = curricula ? (resources / curricula).toFixed(1) : "0.0";

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/lms/home/overview?_fresh=1&t=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) throw new Error(text(body?.error) || "Unable to refresh the LMS overview.");
      setOverview(body);
      setUpdatedAt(new Date());
    } catch (refreshError) {
      setError(refreshError?.message || "Unable to refresh the LMS overview.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="next-lms-page">
      {omitted.length ? (
        <div className="dashboard-notice" role="status">
          <strong>Some LMS data could not refresh.</strong>
          <span>The available sections are shown below; the classic LMS remains available.</span>
          <a href="/lms">Open classic LMS</a>
        </div>
      ) : null}

      <section className="next-lms-hero">
        <div>
          <span className="next-lms-kicker">Learning management system</span>
          <h2>LMS Overview</h2>
          <p>Live visibility across schools, learning teams, curriculum structures, and published resources.</p>
        </div>
        <div className="next-lms-hero-actions">
          <a href="/lms">Classic LMS</a>
          <button type="button" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh data"}</button>
        </div>
      </section>

      {error ? <div className="next-lms-error" role="alert">{error}</div> : null}

      <section className="next-lms-kpi-grid" aria-label="LMS key metrics">
        <KpiCard label="Schools" value={counts.schools} note="Registered school records" symbol="S" />
        <KpiCard label="Learning team" value={counts.people} note="All LMS role records" symbol="T" />
        <KpiCard label="Structures" value={counts.structures} note="Configured school workflows" symbol="W" />
        <KpiCard label="Curricula" value={counts.curricula} note={`${number(counts.themes)} curriculum themes`} symbol="C" />
        <KpiCard label="Resources" value={counts.resources} note="Published learning files" symbol="R" />
      </section>

      <section className="next-lms-insight-strip" aria-label="LMS ratios">
        <article><span>Team per school</span><strong>{teamPerSchool}</strong><small>People / school</small></article>
        <article><span>Resources per curriculum</span><strong>{resourcesPerCurriculum}</strong><small>Files / curriculum</small></article>
        <article><span>Assigned LMS pages</span><strong>{number(access?.summary?.accessCount)}</strong><small>{number(access?.summary?.adminCount)} admin access</small></article>
      </section>

      <section className="next-lms-dashboard-grid">
        <article className="next-lms-panel">
          <header><div><span className="next-lms-kicker">Team distribution</span><h3>Users by role</h3></div><strong>{people}</strong></header>
          <Breakdown values={overview?.roles} labels={ROLE_LABELS} emptyText="No LMS role records are available yet." />
        </article>

        <article className="next-lms-panel">
          <header><div><span className="next-lms-kicker">Content mix</span><h3>Curriculum resources</h3></div><strong>{resources}</strong></header>
          <Breakdown values={overview?.resourceTypes} labels={RESOURCE_LABELS} emptyText="No curriculum resources are available yet." />
        </article>

        <article className="next-lms-panel next-lms-panel--recent">
          <header><div><span className="next-lms-kicker">Recent content</span><h3>Latest curricula</h3></div>{allowedKeys.has("lms-curriculum") || access?.isBuiltInAdmin ? <a href="/lms/curriculum">Open all</a> : null}</header>
          <div className="next-lms-recent-list">
            {Array.isArray(overview?.recentCurricula) && overview.recentCurricula.length ? overview.recentCurricula.slice(0, 5).map((item, index) => {
              const id = curriculumId(item);
              const href = id && (allowedKeys.has("lms-curriculum") || access?.isBuiltInAdmin) ? `/lms/curriculum/${encodeURIComponent(id)}` : "";
              const content = <><span className="next-lms-folder">F</span><div><strong>{curriculumTitle(item)}</strong><small>{formatDate(item?.created_at || item?.createdAt)}</small></div></>;
              return href ? <a href={href} key={id || index}>{content}</a> : <div className="next-lms-recent-static" key={id || index}>{content}</div>;
            }) : <p className="next-lms-empty-copy">No curriculum folders yet.</p>}
          </div>
        </article>

        <article className="next-lms-panel next-lms-panel--quick">
          <header><div><span className="next-lms-kicker">Quick access</span><h3>Your LMS pages</h3></div><strong>{visibleQuickLinks.length}</strong></header>
          <div className="next-lms-quick-grid">
            {visibleQuickLinks.length ? visibleQuickLinks.map((item) => (
              <a href={item.href} key={item.key}>
                <span>{item.icon}</span>
                <div><strong>{item.title}</strong><small>{item.description}</small></div>
                <b>Open →</b>
              </a>
            )) : <p className="next-lms-empty-copy">No LMS workspace pages are assigned to this account.</p>}
          </div>
        </article>
      </section>

      <footer className="next-lms-updated">Updated {updatedAt.toLocaleString("en-GB")}</footer>
    </main>
  );
}
