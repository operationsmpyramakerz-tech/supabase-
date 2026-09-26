import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import EventsClient from "../../components/events/EventsClient";
import { loadDirectEventsPageData } from "../../lib/events-data";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const pageData = await loadDirectEventsPageData({ mode: "events" }).catch(() => null);

  if (pageData?.status === 401) redirect("/login?next=/next/events");
  if (pageData?.status === 403) {
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

  if (!pageData?.ok) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The Events page could not load</h1>
          <p>{pageData?.error || "The Events data service is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/next/events">Try again</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AppShell account={pageData.account} title="Events" eyebrow="Event execution requests" activePath="/next/events" bodyClass="events-page events-requests-page" pageStyles={["/next/css/events.css?v=next-stage-2k-events"]}>
      <EventsClient
        account={pageData.account}
        initialEvents={Array.isArray(pageData.events) ? pageData.events : []}
        bootstrapWarnings={pageData.warnings || []}
      />
    </AppShell>
  );
}
