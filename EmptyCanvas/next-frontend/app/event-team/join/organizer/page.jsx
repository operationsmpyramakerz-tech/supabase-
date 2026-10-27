import EventTeamPublicPortal from "../../../../components/events/EventTeamPublicPortal";

export const metadata = { title: "Organizer Registration · Pyramakerz Events" };
export const dynamic = "force-dynamic";

export default function OrganizerEventTeamJoinPage() {
  return <EventTeamPublicPortal role="organizer" />;
}
