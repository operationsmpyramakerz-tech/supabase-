import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import EventRequestFormClient from "../../../components/events/EventRequestFormClient";
import { loadDirectEventsPageData } from "../../../lib/events-data";

export const dynamic = "force-dynamic";

export default async function NewEventRequestPage({ searchParams }) {
  const resolvedSearch = await Promise.resolve(searchParams);
  const editId = String(resolvedSearch?.edit || "").trim();
  const startDate = String(resolvedSearch?.startDate || "").trim();
  const currentPath = `/next/events/new${editId ? `?edit=${encodeURIComponent(editId)}` : ""}`;

  const pageData = await loadDirectEventsPageData({ mode: "new", editId }).catch(() => null);

  if (pageData?.status === 401) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  if (pageData?.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Event Requests are not available</h1>
          <p>Your account does not have access to create or edit event requests.</p>
          <div className="actions">
            <a className="primary-button" href="/next/home">Return to Home</a>
            <a className="secondary-button" href="/next/events/new">Try again</a>
          </div>
        </section>
      </main>
    );
  }

  if (!pageData?.ok) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The Event Request form could not load</h1>
          <p>{pageData?.error || "The Events data service is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href={editId ? `/next/events/new?edit=${encodeURIComponent(editId)}` : "/next/events/new"}>Try again</a>
            <a className="secondary-button" href="/next/events">Return to Events</a>
          </div>
        </section>
      </main>
    );
  }

  if (editId && !pageData.event) {
    return (
      <AppShell
        account={pageData.account}
        title="Edit Event Request"
        eyebrow="Event planning and execution brief"
        activePath="/next/events/new"
        bodyClass="events-page events-new-page"
        pageStyles={["/next/css/events.css?v=next-stage-2k-events"]}
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
      account={pageData.account}
      title={editId ? "Edit Event Request" : "New Event Request"}
      eyebrow="Event planning and execution brief"
      activePath="/next/events/new"
      bodyClass="events-page events-new-page"
      pageStyles={["/next/css/events.css?v=next-stage-2k-events"]}
    >
      <EventRequestFormClient
        account={pageData.account}
        initialTypes={Array.isArray(pageData.types) ? pageData.types : []}
        initialComponents={Array.isArray(pageData.components) ? pageData.components : []}
        initialEvents={Array.isArray(pageData.events) ? pageData.events : []}
        initialRates={Array.isArray(pageData.rates) ? pageData.rates : []}
        initialCanEditRates={!!pageData.canEditRates}
        initialEvent={pageData.event || null}
        initialStartDate={startDate}
        bootstrapWarnings={pageData.warnings || []}
      />
    </AppShell>
  );
}
