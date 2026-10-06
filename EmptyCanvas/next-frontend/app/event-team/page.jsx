import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import EventTeamClient from "../../components/events/EventTeamClient";
import { loadEventTeamPageData, eventTeamDataError } from "../../lib/event-team-data";
import { getDirectAccountGate } from "../../lib/products-auth";

export const dynamic = "force-dynamic";

const EVENT_ACCESS_PAGES = ["Event Requests", "Event Calendar", "Event Components"];

export default async function EventTeamPage() {
  const gate = await getDirectAccountGate(EVENT_ACCESS_PAGES).catch(() => null);

  if (gate?.status === 401) redirect("/login?next=/next/event-team");
  if (gate?.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Event Team is not available</h1>
          <p>Your account does not have access to the Events module.</p>
          <a className="primary-button" href="/next/home">Return to Home</a>
        </section>
      </main>
    );
  }

  if (!gate?.ok) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The Event Team page could not load</h1>
          <p>{gate?.error || "The Events data service is temporarily unavailable."}</p>
          <a className="primary-button" href="/next/home">Return to Home</a>
        </section>
      </main>
    );
  }

  let pageData = null;
  let loadError = "";
  try {
    pageData = await loadEventTeamPageData(gate.account || null);
  } catch (error) {
    loadError = eventTeamDataError(error);
  }

  return (
    <AppShell
      account={gate.account}
      title="Events"
      eyebrow="Event workforce & attendance"
      activePath="/next/event-team"
      bodyClass="events-page event-team-page"
      pageStyles={["/next/css/events.css?v=event-team-v1", "/next/css/event-team.css?v=event-team-public-portal-v3"]}
    >
      <EventTeamClient
        account={gate.account}
        initialMembers={Array.isArray(pageData?.members) ? pageData.members : []}
        initialAttendance={Array.isArray(pageData?.attendance) ? pageData.attendance : []}
        initialEvents={Array.isArray(pageData?.events) ? pageData.events : []}
        bootstrapError={loadError}
      />
    </AppShell>
  );
}
