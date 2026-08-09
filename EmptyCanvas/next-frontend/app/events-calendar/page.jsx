import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import EventsCalendarClient from "../../components/events/EventsCalendarClient";
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

export default async function EventsCalendarPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=events-calendar", { timeoutMs: 35000 });

  if (response.status === 401) redirect("/login?next=/next/events-calendar");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Event Calendar is not available</h1>
          <p>Your account does not have access to the Event Calendar.</p>
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
          <h1>The new Event Calendar could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/events/calendar?classic=1">Open classic Calendar</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const eventsPayload = getResource(resources, "/api/events", { ok: true, events: [] });

  if (!account) redirect("/login?next=/next/events-calendar");

  return (
    <AppShell account={account} title="Event Calendar" eyebrow="Event execution schedule" activePath="/next/events-calendar">
      <EventsCalendarClient
        account={account}
        initialEvents={Array.isArray(eventsPayload?.events) ? eventsPayload.events : []}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
