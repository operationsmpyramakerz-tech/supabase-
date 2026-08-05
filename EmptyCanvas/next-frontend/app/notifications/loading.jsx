export default function NotificationsLoading() {
  return (
    <main className="next-notifications-loading" aria-label="Loading notifications">
      <div className="next-notifications-loading__hero" />
      <div className="next-notifications-loading__stats">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
      <div className="next-notifications-loading__push" />
      <div className="next-notifications-loading__workspace">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>
    </main>
  );
}
