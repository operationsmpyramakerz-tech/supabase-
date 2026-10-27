import { redirect } from "next/navigation";
import { featureAllowed } from "../../lib/feature-permissions-registry";
import AppShell from "../../components/AppShell";
import NotificationsClient from "../../components/notifications/NotificationsClient";
import { fetchDirectPageBootstrap } from "../../lib/page-bootstrap-direct";
import { notificationsForMember } from "../../lib/notifications-data";
import { getDirectAccountGate } from "../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function UnavailableState({ message }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>The notification center could not load</h1>
        <p>{message}</p>
        <div className="actions">
          <a className="primary-button" href="/next/notifications">Try again</a>
          <a className="secondary-button" href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

export default async function NotificationsPage() {
  // A single verified account gate includes the current permission matrix.
  // Never query personal notifications from an auth-only session snapshot.
  const gate = await getDirectAccountGate([]);
  if (gate.status === 401) redirect("/login?next=/next/notifications");
  if (gate.status === 403) return <UnavailableState message={gate.error || "Notifications access denied."} />;
  let account = gate.ok ? gate.account : null;
  let notifications = null;
  const warnings = [];
  if (account) {
    if (!featureAllowed(account, "notifications.view")) {
      return <UnavailableState message="Permission notifications.view is not allowed." />;
    }
    notifications = await notificationsForMember(gate.memberId, { limit: 80 }).catch(() => null);
  }

  // Deep recovery only. The normal route no longer depends on page-bootstrap.
  if (!gate.ok || !account || !notifications) {
    const response = await fetchDirectPageBootstrap("/api/page-bootstrap?scope=notifications");
    if (response.status === 401) redirect("/login?next=/next/notifications");
    if (!response.ok || !response.data?.ok) {
      return <UnavailableState message={response.error || response.data?.error || gate.error || "The current ERP API is temporarily unavailable."} />;
    }

    const resources = resourceMap(response.data);
    account = account || getResource(resources, "/api/account", null);
    notifications = notifications || getResource(resources, "/api/notifications", { success: true, items: [], unreadCount: 0 });
    warnings.push("Notification center recovery path used.", ...(response.data.omitted || []));
  }

  if (!account) redirect("/login?next=/next/notifications");
  if (!featureAllowed(account, "notifications.view")) return <UnavailableState message="Permission notifications.view is not allowed." />;

  return (
    <AppShell
      account={account}
      title="Notifications"
      eyebrow="Personal ERP activity and device alerts"
      activePath="/next/notifications"
    >
      <NotificationsClient
        initialItems={Array.isArray(notifications?.items) ? notifications.items : []}
        initialUnreadCount={Number(notifications?.unreadCount) || 0}
        source={String(notifications?.source || "")}
        bootstrapWarnings={warnings}
        canManageRead={featureAllowed(account, "notifications.read_manage")}
        canManagePreferences={featureAllowed(account, "notifications.preferences") && featureAllowed(account, "account.view")}
      />
    </AppShell>
  );
}
