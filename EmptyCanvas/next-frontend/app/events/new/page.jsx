import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import EventRequestFormClient from "../../../components/events/EventRequestFormClient";
import { fetchLegacyJson } from "../../../lib/legacy-api";

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
    if (url === prefix || url.startsWith(`${prefix}?`)) return body;
  }
  return fallback;
}

export default async function NewEventRequestPage({ searchParams }) {
  const resolvedSearch = await Promise.resolve(searchParams);
  const editId = String(resolvedSearch?.edit || "").trim();
  const startDate = String(resolvedSearch?.startDate || "").trim();
  const query = new URLSearchParams({ scope: "events-new" });
  if (editId) query.set("edit", editId);

  const response = await fetchLegacyJson(`/api/page-bootstrap?${query.toString()}`, { timeoutMs: 45000 });
  const currentPath = `/next/events/new${editId ? `?edit=${encodeURIComponent(editId)}` : ""}`;

  if (response.status === 401) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Event Requests are not available</h1>
          <p>Your account does not have access to create or edit event requests.</p>
          <div className="actions">
            <a className="primary-button" href="/next/home">Return to Home</a>
            <a className="secondary-button" href="/events/new?classic=1">Open classic form</a>
          </div>
        </section>
      </main>
    );
  }

  if (!response.ok || !response.data?.ok) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The new Event Request form could not load</h1>
          <p>{response.error || response.data?.error || "The ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href={editId ? `/events/new?edit=${encodeURIComponent(editId)}&classic=1` : "/events/new?classic=1"}>Open classic form</a>
            <a className="secondary-button" href="/next/events">Return to Events</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  if (!account) redirect(`/login?next=${encodeURIComponent(currentPath)}`);

  const typesPayload = getResource(resources, "/api/events/types", { types: [] });
  const componentsPayload = getResource(resources, "/api/events/components", { components: [] });
  const eventsPayload = getResource(resources, "/api/events", { events: [] });
  const ratesPayload = getResource(resources, "/api/events/governorate-rates", { rates: [], canEdit: false });
  const eventPayload = editId ? getResource(resources, `/api/events/${encodeURIComponent(editId)}`, null) : null;

  if (editId && !eventPayload?.event) {
    return (
      <AppShell
        account={account}
        title="Edit Event Request"
        eyebrow="Event planning and execution brief"
        activePath="/next/events/new"
      bodyClass="events-page events-new-page"
      classicStyles={["/css/events.css?v=next-stage-2k-events"]}
        classicHrefOverride={`/events/new?edit=${encodeURIComponent(editId)}`}
      >
        <main className="standalone-state">
          <section className="state-card">
            <span className="status-dot warning" />
            <h1>Event request not found</h1>
            <p>The selected request could not be loaded or is no longer available.</p>
            <div className="actions"><a className="primary-button" href="/next/events">Return to Events</a></div>
          </section>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell
      account={account}
      title={editId ? "Edit Event Request" : "New Event Request"}
      eyebrow="Event planning and execution brief"
      activePath="/next/events/new"
      bodyClass="events-page events-new-page"
      classicStyles={["/css/events.css?v=next-stage-2k-events"]}
      classicHrefOverride={editId ? `/events/new?edit=${encodeURIComponent(editId)}` : "/events/new"}
    >
      <EventRequestFormClient
        account={account}
        initialTypes={Array.isArray(typesPayload?.types) ? typesPayload.types : []}
        initialComponents={Array.isArray(componentsPayload?.components) ? componentsPayload.components : []}
        initialEvents={Array.isArray(eventsPayload?.events) ? eventsPayload.events : []}
        initialRates={Array.isArray(ratesPayload?.rates) ? ratesPayload.rates : []}
        initialCanEditRates={!!ratesPayload?.canEdit}
        initialEvent={eventPayload?.event || null}
        initialStartDate={startDate}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
