import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import EventsCalendarClient from "../../components/events/EventsCalendarClient";
import { loadDirectEventsPageData } from "../../lib/events-data";

export const dynamic = "force-dynamic";

export default async function EventsCalendarPage() {
  const pageData = await loadDirectEventsPageData({ mode: "calendar" }).catch(() => null);

  if (pageData?.status === 401) redirect("/login?next=/next/events-calendar");
  if (pageData?.status === 403) {
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

  if (!pageData?.ok) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The Event Calendar could not load</h1>
          <p>{pageData?.error || "The Events data service is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/next/events-calendar">Try again</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AppShell account={pageData.account} title="Events" eyebrow="Event execution schedule" activePath="/next/events-calendar" bodyClass="events-page events-calendar-page" pageStyles={["/next/css/events.css?v=next-stage-2k-events"]}>
      <EventsCalendarClient
        account={pageData.account}
        initialEvents={Array.isArray(pageData.events) ? pageData.events : []}
        bootstrapWarnings={pageData.warnings || []}
      />
    </AppShell>
  );
}
