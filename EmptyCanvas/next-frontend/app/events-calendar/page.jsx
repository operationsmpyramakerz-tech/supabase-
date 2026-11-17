import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import EventsCalendarClient from "../../components/events/EventsCalendarClient";
import { loadDirectEventsPageData } from "../../lib/events-data";
import { directPageMutationAccess } from "../../lib/order-action-auth";

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

  const requestDetails = new Map((pageData.calendarRequestDetails || []).map(event => [event.id, event]));
  const events = (Array.isArray(pageData.events) ? pageData.events : []).map(event => ({ ...event, ...requestDetails.get(event.id) }));

  return (
    <AppShell account={pageData.account} title="Events" eyebrow="Event execution schedule" activePath="/next/events-calendar" bodyClass="events-page events-calendar-page" pageStyles={["/next/css/events.css?v=agenda-week-nav-v448"]}>
      <EventsCalendarClient
        account={pageData.account}
        initialEvents={events}
        canMutateRequests={directPageMutationAccess(pageData.account, ["Event Requests"]) === true}
        bootstrapWarnings={pageData.warnings || []}
      />
    </AppShell>
  );
}
