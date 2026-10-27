import EventTeamPublicPortal from "../../../../components/events/EventTeamPublicPortal";

export const metadata = { title: "Instructor Registration · Pyramakerz Events" };
export const dynamic = "force-dynamic";

export default function InstructorEventTeamJoinPage() {
  return <EventTeamPublicPortal role="instructor" />;
}
