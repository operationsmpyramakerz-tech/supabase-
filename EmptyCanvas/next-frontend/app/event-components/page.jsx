import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import EventComponentsClient from "../../components/events/EventComponentsClient";
import { loadDirectEventsPageData } from "../../lib/events-data";

export const dynamic = "force-dynamic";

export default async function EventComponentsPage({ searchParams }) {
  const params = await Promise.resolve(searchParams || {});
  const initialCreate = ["1", "true", "yes", "on"].includes(String(params?.create || "").trim().toLowerCase());
  const pageData = await loadDirectEventsPageData({ mode: "components" }).catch(() => null);

  if (pageData?.status === 401) redirect("/login?next=/next/event-components");
  if (pageData?.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Event Components is not available</h1>
          <p>Your account does not have access to the Event Components catalogue.</p>
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
          <h1>The Event Components page could not load</h1>
          <p>{pageData?.error || "The Events data service is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/next/event-components">Try again</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AppShell account={pageData.account} title="Events" eyebrow="Reusable event resources" activePath="/next/event-components" bodyClass="events-page events-components-page" pageStyles={["/next/css/events.css?v=event-components-category-modal-v3"]}>
      <EventComponentsClient
        account={pageData.account}
        initialComponents={Array.isArray(pageData.components) ? pageData.components : []}
        initialCategories={Array.isArray(pageData.categories) ? pageData.categories : []}
        initialCreate={initialCreate}
        bootstrapWarnings={pageData.warnings || []}
      />
    </AppShell>
  );
}
