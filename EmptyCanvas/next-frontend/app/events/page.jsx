import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import EventsClient from "../../components/events/EventsClient";
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

export default async function EventsPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=events", { timeoutMs: 35000 });

  if (response.status === 401) redirect("/login?next=/next/events");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Events is not available</h1>
          <p>Your account does not have access to Event Requests or the Event Calendar.</p>
          <a className="primary-button" href="/next/home">Return to Home</a>
        </section>
      </main>
    );
  }

  if (!response.ok || !response.data?.ok) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The new Events page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/events?classic=1">Open classic Events</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const eventsPayload = getResource(resources, "/api/events", { ok: true, events: [] });

  if (!account) redirect("/login?next=/next/events");

  return (
    <AppShell account={account} title="Events" eyebrow="Event execution requests" activePath="/next/events" bodyClass="events-page events-requests-page" classicStyles={["/css/events.css?v=next-stage-2k-events"]}>
      <EventsClient
        account={account}
        initialEvents={Array.isArray(eventsPayload?.events) ? eventsPayload.events : []}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
