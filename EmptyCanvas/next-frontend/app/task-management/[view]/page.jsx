import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import TaskManagementClient from "../../../components/task-management/TaskManagementClient";
import { loadDirectTaskManagementPageData } from "../../../lib/task-management-data";
import { fetchLegacyJson } from "../../../lib/legacy-api";

export const dynamic = "force-dynamic";

const VIEW_MAP = {
  "all-tasks": { key: "all", title: "All Tasks" },
  "my-tasks": { key: "my", title: "My Tasks" },
  "delegated-tasks": { key: "delegated", title: "Delegated Tasks" },
};

function resourceMap(bundle) {
  const map = new Map();
  for (const resource of Array.isArray(bundle?.resources) ? bundle.resources : []) {
    map.set(String(resource?.url || ""), resource?.body);
  }
  return map;
}

function getResource(map, prefix, fallback = null) {
  for (const [url, body] of map.entries()) {
    if (url === prefix || url.startsWith(prefix)) return body;
  }
  return fallback;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function allowedViews(account = {}) {
  const pages = new Set((Array.isArray(account.allowedPages) ? account.allowedPages : []).map(normalize));
  const broad = pages.has("task management") || pages.has("taskmanagement") || pages.has("department tickets");
  return [
    { key: "all", slug: "all-tasks", label: "All Tasks", visible: broad || pages.has("all tasks") },
    { key: "my", slug: "my-tasks", label: "My Tasks", visible: broad || pages.has("my tasks") },
    { key: "delegated", slug: "delegated-tasks", label: "Delegated Tasks", visible: broad || pages.has("delegated tasks") },
  ].filter((item) => item.visible);
}

function forbidden(config) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{config.title} is not available</h1>
        <p>Your account does not have access to this Task Management view.</p>
        <div className="actions">
          <a className="primary-button" href="/next/task-management">Open an available view</a>
          <a className="secondary-button" href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

export default async function TaskManagementViewPage({ params }) {
  const resolvedParams = await params;
  const config = VIEW_MAP[String(resolvedParams?.view || "")];
  if (!config) redirect("/task-management");

  const currentPath = `/next/task-management/${resolvedParams.view}`;
  let pageData = await loadDirectTaskManagementPageData({ view: config.key }).catch(() => null);

  if (pageData?.status === 401) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  if (pageData?.status === 403) return forbidden(config);

  if (!pageData?.ok) {
    const response = await fetchLegacyJson(`/api/page-bootstrap?scope=task-management&view=${encodeURIComponent(config.key)}`, { timeoutMs: 45000 });
    if (response.status === 401) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
    if (response.status === 403) return forbidden(config);

    if (!response.ok || !response.data?.ok) {
      return (
        <main className="standalone-state">
          <section className="state-card">
            <span className="status-dot warning" />
            <h1>The new Task Management page could not load</h1>
            <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
            <div className="actions">
              <a className="primary-button" href={currentPath}>Try again</a>
              <a className="secondary-button" href="/next/home">Return to Home</a>
            </div>
          </section>
        </main>
      );
    }

    const resources = resourceMap(response.data);
    const account = getResource(resources, "/api/account", null);
    const meta = getResource(resources, "/api/task-management/meta", null);
    const list = getResource(resources, "/api/task-management?", { ok: true, tickets: [] });
    if (!account) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
    pageData = {
      ok: true,
      account,
      meta: meta || { ok: true, view: config.key, departments: [], currentUser: {}, accessLevel: "view" },
      tickets: Array.isArray(list?.tickets) ? list.tickets : [],
      warnings: response.data.omitted || [],
      source: "legacy-bootstrap",
    };
  }

  return (
    <>
      <link rel="stylesheet" href="/next/css/task-management.css?v=task-management-stable-status-frame-v24" />
      <link rel="stylesheet" href="/next/css/task-management-next-parity.css?v=classic-parity-v3-workflow" />
      <AppShell
        account={pageData.account}
        title={config.title}
        eyebrow="Task Management"
        activePath={currentPath}
      >
        <TaskManagementClient
          view={config.key}
          account={pageData.account}
          viewSlug={resolvedParams.view}
          initialMeta={pageData.meta || { ok: true, view: config.key, departments: [], currentUser: {}, accessLevel: "view" }}
          initialTickets={Array.isArray(pageData.tickets) ? pageData.tickets : []}
          availableViews={allowedViews(pageData.account)}
          bootstrapWarnings={pageData.warnings || []}
        />
      </AppShell>
    </>
  );
}
