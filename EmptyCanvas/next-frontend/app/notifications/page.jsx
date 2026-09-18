import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import NotificationsClient from "../../components/notifications/NotificationsClient";
import { fetchLegacyJson } from "../../lib/legacy-api";
import { notificationsForMember } from "../../lib/notifications-data";
import { getLegacyAccountGate } from "../../lib/products-auth";

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
  // Fast path: validate the session in Next and read the user's saved
  // notifications directly from Supabase. Notification generation/scanning is
  // still kept as a background compatibility job so page navigation does not
  // wait for the legacy Express scan.
  const gate = await getLegacyAccountGate([]);
  if (gate.status === 401) redirect("/login?next=/next/notifications");

  let account = gate.ok ? gate.account : null;
  let notifications = null;
  const warnings = [];

  if (gate.ok && gate.memberId) {
    notifications = await notificationsForMember(gate.memberId, { limit: 80 }).catch(() => null);
  }

  // Older sessions that do not expose a Supabase member id can still use the
  // existing notification endpoint without paying for the full page bootstrap.
  if (gate.ok && !notifications) {
    const legacyNotifications = await fetchLegacyJson("/api/notifications?limit=80", { timeoutMs: 8_000, fresh: true });
    if (legacyNotifications.ok && legacyNotifications.data) {
      notifications = legacyNotifications.data;
      warnings.push("Notification list loaded through the compatibility path.");
    }
  }

  // Deep recovery only. The normal route no longer depends on page-bootstrap.
  if (!gate.ok || !account || !notifications) {
    const response = await fetchLegacyJson("/api/page-bootstrap?scope=notifications", { timeoutMs: 20_000 });
    if (response.status === 401 || response.status === 403) redirect("/login?next=/next/notifications");
    if (!response.ok || !response.data?.ok) {
      return <UnavailableState message={response.error || response.data?.error || gate.error || "The current ERP API is temporarily unavailable."} />;
    }

    const resources = resourceMap(response.data);
    account = account || getResource(resources, "/api/account", null);
    notifications = notifications || getResource(resources, "/api/notifications", { success: true, items: [], unreadCount: 0 });
    warnings.push("Notification center recovery path used.", ...(response.data.omitted || []));
  }

  if (!account) redirect("/login?next=/next/notifications");

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
      />
    </AppShell>
  );
}
