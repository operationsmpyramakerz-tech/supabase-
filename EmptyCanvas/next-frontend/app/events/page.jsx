import { redirect } from "next/navigation";

// Event Requests was consolidated into the Calendar. Keep legacy bookmarks and
// notifications working without retaining a second request-list UI.
export default async function EventsPage({ searchParams }) {
  const search = await Promise.resolve(searchParams);
  const eventId = typeof search?.event === "string" ? search.event.trim() : "";
  redirect(eventId ? `/events-calendar?event=${encodeURIComponent(eventId)}` : "/events-calendar");
}
