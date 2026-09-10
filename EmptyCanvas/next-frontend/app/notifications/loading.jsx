import { ClassicStableLoadingShell } from "../../components/ClassicStableLoadingChrome";

export default function NotificationsLoading() {
  return (
    <ClassicStableLoadingShell title="Notifications" bodyClass="notifications-page" ariaLabel="Loading notifications">
      <section className="next-notifications-loading" aria-label="Loading notifications">
        <div className="next-notifications-loading__hero" />
        <div className="next-notifications-loading__stats">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
        <div className="next-notifications-loading__push" />
        <div className="next-notifications-loading__workspace">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>
      </section>
    </ClassicStableLoadingShell>
  );
}
