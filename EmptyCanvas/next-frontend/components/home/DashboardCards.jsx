function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function Ring({ total, segments = [] }) {
  const safeTotal = Math.max(0, Number(total || 0));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let consumed = 0;
  return (
    <div className="metric-ring" aria-label={`${safeTotal} total records`}>
      <svg viewBox="0 0 110 110" aria-hidden="true">
        <circle className="ring-track" cx="55" cy="55" r={radius} />
        {segments.map((segment) => {
          const value = Math.max(0, Number(segment.value || 0));
          const length = safeTotal ? (value / safeTotal) * circumference : 0;
          const dashOffset = -consumed;
          consumed += length;
          return (
            <circle
              className="ring-segment"
              cx="55"
              cy="55"
              r={radius}
              key={segment.label}
              pathLength={circumference}
              stroke={segment.color}
              strokeDasharray={`${length} ${Math.max(0, circumference - length)}`}
              strokeDashoffset={dashOffset}
            />
          );
        })}
      </svg>
      <div className="ring-center"><strong>{safeTotal}</strong><span>Total orders</span></div>
    </div>
  );
}

export function OrdersCard({ title, href, total, totalCost, buckets = [], tone = "light" }) {
  return (
    <a className={`dashboard-card orders-card ${tone === "dark" ? "dashboard-card--dark" : ""}`} href={href}>
      <div className="card-heading"><h2>{title}</h2><span className="analysis-chip">Analysis</span></div>
      <div className="orders-card-body">
        <Ring total={total} segments={buckets.map((bucket) => ({ label: bucket.label, value: bucket.count, color: bucket.color }))} />
        <div className="bucket-list">
          {buckets.map((bucket) => (
            <div className="bucket-row" key={bucket.label}>
              <span className="bucket-color" style={{ background: bucket.color }} />
              <div><strong>{bucket.count}</strong><span>{bucket.label}</span><small>{money(bucket.cost)}</small></div>
            </div>
          ))}
        </div>
      </div>
      <div className="card-foot"><span>{total} grouped records</span><strong>{money(totalCost)}</strong></div>
    </a>
  );
}

export function StockCard({ summary }) {
  return (
    <a className="dashboard-card stock-card" href="/stocktaking">
      <div className="card-heading"><h2>Stocktaking</h2><span className="analysis-chip analysis-chip--green">Analysis</span></div>
      <div className="stock-metrics">
        <div><span>Total components</span><strong>{summary.quantity}</strong></div>
        <div><span>Total components cost</span><strong>{money(summary.cost)}</strong></div>
      </div>
      <p>{summary.records} component records</p>
    </a>
  );
}

export function ExpensesCard({ summary }) {
  const max = Math.max(1, ...summary.months.map((month) => Math.abs(month.value)));
  return (
    <a className="dashboard-card expenses-card" href="/expenses">
      <div className="expenses-head"><div><span>Monthly overview</span><h2>Expenses by month</h2></div><strong>{summary.year}</strong></div>
      <div className="expense-chart" aria-label="Monthly expense chart">
        {summary.months.map((month) => (
          <div className="expense-column" key={month.label}>
            <div className="expense-value">{money(month.value)}</div>
            <div className="expense-bar-track"><div className="expense-bar" style={{ height: `${Math.max(4, (Math.abs(month.value) / max) * 100)}%` }} /></div>
            <span>{month.label}</span>
          </div>
        ))}
      </div>
      <div className="expense-summary"><span>This month balance</span><strong>{money(summary.currentMonthBalance)}</strong></div>
    </a>
  );
}

export function DashboardNotice({ omitted = [] }) {
  if (!omitted.length) return null;
  return (
    <div className="dashboard-notice" role="status">
      <strong>Some dashboard sections could not refresh.</strong>
      <span>The classic Home remains available while these resources recover.</span>
      <a href="/home">Open classic Home</a>
    </div>
  );
}
