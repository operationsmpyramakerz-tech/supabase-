export default function OrdersReviewLoading() {
  return (
    <div className="dashboard-loading orders-page-loading" aria-label="Loading Orders Review">
      <div className="loading-sidebar" />
      <div className="loading-main">
        <div className="skeleton loading-header" />
        <div className="orders-loading-toolbar skeleton" />
        <div className="orders-loading-grid">
          {Array.from({ length: 8 }, (_, index) => <div className="skeleton orders-loading-card" key={index} />)}
        </div>
      </div>
    </div>
  );
}
