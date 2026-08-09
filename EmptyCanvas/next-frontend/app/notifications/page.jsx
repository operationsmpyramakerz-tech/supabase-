import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import NotificationsClient from "../../components/notifications/NotificationsClient";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

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

export default async function NotificationsPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=notifications", { timeoutMs: 30000 });
  if (response.status === 401 || response.status === 403) redirect("/login?next=/next/notifications");

  if (!response.ok || !response.data?.ok) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The notification center could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/next/home">Return to Home</a>
            <a className="secondary-button" href="/home?classic=1">Open classic Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const notifications = getResource(resources, "/api/notifications", { success: true, items: [], unreadCount: 0 });
  if (!account) redirect("/login?next=/next/notifications");

  return (
    <AppShell
      account={account}
      title="Notifications"
      eyebrow="Personal ERP activity and device alerts"
      activePath="/next/notifications"
      classicHrefOverride="/home"
    >
      <NotificationsClient
        initialItems={Array.isArray(notifications?.items) ? notifications.items : []}
        initialUnreadCount={Number(notifications?.unreadCount) || 0}
        source={String(notifications?.source || "")}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
