// Actual Events route is /events-calendar; /events is a redirect-only bookmark.
// Inject scoped motion without affecting other Event pages or the app chrome.
export default function EventsCalendarMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/events-calendar-motion-v1.css?v=cinematic-step4-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
