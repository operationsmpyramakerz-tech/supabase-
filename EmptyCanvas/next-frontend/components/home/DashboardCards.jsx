function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function compactMoney(value) {
  const amount = Math.max(0, Number(value || 0));
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(amount >= 100_000 ? 0 : 1)}K`;
  return Math.round(amount).toLocaleString("en-US");
}

function Icon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    "chevron-down": <polyline points="6 9 12 15 18 9"/>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    "arrow-up-right": <><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>,
    "arrow-right": <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    "plus-circle": <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    list: <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
    "dollar-sign": <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></>,
    user: <><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></>,
  };
  return <svg {...common}>{paths[name] || paths.activity}</svg>;
}

function RingSegments({ total, buckets, classPrefix, classForBucket }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let consumed = 0;
  return buckets.map((bucket) => {
    const value = Math.max(0, Number(bucket.count || 0));
    const length = Number(total || 0) > 0 ? (value / Number(total)) * circumference : 0;
    const offset = -consumed;
    consumed += length;
    return (
      <circle
        key={bucket.key || bucket.label}
        className={`${classPrefix} ${classForBucket(bucket)}`}
        cx="60"
        cy="60"
        r={radius}
        style={{ strokeDasharray: `${length.toFixed(2)} ${Math.max(0, circumference - length).toFixed(2)}`, strokeDashoffset: offset.toFixed(2) }}
      />
    );
  });
}

function AnalysisTrigger() {
  return (
    <div className="home-orders-analysis">
      <button aria-expanded="false" aria-haspopup="true" className="home-orders-analysis__trigger" type="button" title="Analysis controls will be enabled in the behavior-parity stage">
        <span className="home-orders-analysis__icon"><Icon name="activity" /></span>
        <span className="home-orders-analysis__trigger-copy"><strong>Analysis</strong></span>
        <Icon name="chevron-down" />
      </button>
    </div>
  );
}

function CurrentOrdersCard({ title, href, total, totalCost, buckets }) {
  const classForBucket = (bucket) => `home-orders-ring__segment--${bucket.key === "progress" ? "progress" : bucket.key}`;
  return (
    <a aria-label={`${title} performance overview`} className="stat home-kpi home-orders-performance" href={href}>
      <div className="home-orders-performance__head">
        <div><div className="stat__label">{title}</div></div>
        <AnalysisTrigger />
      </div>
      <div className="home-orders-performance__body">
        <div className="home-orders-ring" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <circle className="home-orders-ring__track" cx="60" cy="60" r="44" />
            <RingSegments total={total} buckets={buckets} classPrefix="home-orders-ring__segment" classForBucket={classForBucket} />
          </svg>
          <div className="home-orders-ring__center"><strong>{total}</strong><span>Total orders</span><small>{money(totalCost)}</small></div>
        </div>
        <div className="home-orders-performance__legend">
          {buckets.map((bucket) => (
            <div className={`home-orders-status home-orders-status--${bucket.key}`} key={bucket.key}>
              <span className="home-orders-status__bar" />
              <div><strong>{bucket.count}</strong><span>{bucket.label}</span><small>{money(bucket.cost)}</small></div>
            </div>
          ))}
        </div>
      </div>
    </a>
  );
}

const SUMMARY_TONE = {
  pending: "orange",
  approved: "green",
  rejected: "red",
  received: "navy",
  delivered: "green",
  progress: "navy",
  completed: "green",
};

function SummaryOrdersCard({ title, href, total, totalCost, buckets, variant }) {
  const classForBucket = (bucket) => `home-summary-ring__segment--${SUMMARY_TONE[bucket.key] || "navy"}`;
  return (
    <a aria-label={`${title} overview`} className={`stat home-kpi home-summary-performance home-summary-performance--${variant}`} href={href}>
      <div className="home-summary-performance__head">
        <div><div className="stat__label">{title}</div></div>
        {variant !== "maintenance" ? <AnalysisTrigger /> : null}
      </div>
      <div className="home-summary-performance__body">
        <div className="home-summary-ring">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 120 120">
            <circle className="home-summary-ring__track" cx="60" cy="60" r="44" />
            <RingSegments total={total} buckets={buckets} classPrefix="home-summary-ring__segment" classForBucket={classForBucket} />
          </svg>
          <div className="home-summary-ring__center"><strong>{total}</strong><span>Total orders</span><small>{money(totalCost)}</small></div>
        </div>
        <div className="home-summary-performance__legend">
          {buckets.map((bucket) => (
            <div className={`home-summary-status home-summary-status--${SUMMARY_TONE[bucket.key] || "navy"}`} key={bucket.key}>
              <span className="home-summary-status__bar" />
              <div><strong>{bucket.count}</strong><span>{bucket.label}</span><small>{money(bucket.cost)}</small></div>
            </div>
          ))}
        </div>
      </div>
    </a>
  );
}

export function OrdersCard({ title, href, total, totalCost, buckets = [], variant = "current" }) {
  if (variant === "current") return <CurrentOrdersCard title={title} href={href} total={total} totalCost={totalCost} buckets={buckets} />;
  return <SummaryOrdersCard title={title} href={href} total={total} totalCost={totalCost} buckets={buckets} variant={variant} />;
}

export function StockCard({ summary }) {
  return (
    <div className="stat home-kpi home-stock-card">
      <div className="home-stock-card__head">
        <a className="home-stock-card__title" href="/next/stocktaking">Stocktaking</a>
        <div className="home-stock-analysis">
          <button className="home-stock-analysis__trigger" type="button" aria-expanded="false" title="Analysis controls will be enabled in the behavior-parity stage"><Icon name="activity"/><span>Analysis</span><Icon name="chevron-down"/></button>
        </div>
      </div>
      <div className="home-stock-card__metrics">
        <div><span>Total components</span><strong>{summary.quantity}</strong></div>
        <div><span>Total components cost</span><strong>{money(summary.cost)}</strong></div>
      </div>
      <div className="home-kpi-sub">{summary.records} component records</div>
    </div>
  );
}

export function ExpensesCard({ summary }) {
  const totals = summary.months.map((month) => Math.max(0, Number(month.value || 0)));
  const rawMax = Math.max(0, ...totals);
  const magnitude = rawMax > 0 ? 10 ** Math.max(0, Math.floor(Math.log10(rawMax)) - 1) : 1;
  const chartMax = rawMax > 0 ? Math.ceil(rawMax / magnitude) * magnitude : 1;
  const axisValues = [chartMax, chartMax * .75, chartMax * .5, chartMax * .25, 0];
  return (
    <section aria-label="Expenses by month" className="card home-expense-analytics-card home-expense-monthly-card">
      <div className="card-header home-card-header home-expense-card-head">
        <div><span className="home-expense-eyebrow">Monthly overview</span><h2>Expenses by month</h2></div>
        <div className="home-expense-year-select">
          <button className="home-expense-year-select__trigger" type="button" aria-label="Expense chart year"><Icon name="calendar"/><span>{summary.year}</span><Icon name="chevron-down"/></button>
        </div>
      </div>
      <div className="home-expense-monthly-chart">
        <div className="home-expense-chart-shell" role="group" aria-label={`Monthly expense bar chart for ${summary.year}`}>
          <div className="home-expense-chart-y-axis" aria-hidden="true">{axisValues.map((value, index) => <span key={index}>{compactMoney(value)}</span>)}</div>
          <div className="home-expense-chart-stage">
            <div className="home-expense-chart-grid" aria-hidden="true"><span/><span/><span/><span/><span/></div>
            <div className="home-expense-bars">
              {summary.months.map((month, index) => {
                const total = Math.max(0, Number(month.value || 0));
                const height = chartMax ? Math.max(0, Math.min(100, total / chartMax * 100)) : 0;
                const active = index === summary.currentMonth;
                return (
                  <button type="button" className={`home-expense-month-bar ${active ? "is-active" : ""} ${total > 0 ? "has-data" : "is-empty"}`} key={month.label} title={`${month.label} ${summary.year}: ${money(total)}`}>
                    <span className="home-expense-month-bar__bubble">{compactMoney(total)}</span>
                    <span className="home-expense-month-bar__track"><span className="home-expense-month-bar__fill" style={{ height: `${height.toFixed(2)}%` }} /></span>
                    <span className="home-expense-month-bar__label">{month.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DashboardNotice({ omitted = [] }) {
  if (!omitted.length) return null;
  return (
    <div className="dashboard-notice" role="status">
      <strong>Some dashboard sections could not refresh.</strong>
      <span>The current interface remains available while these resources recover.</span>
      <a href="/home?classic=1">Open classic Home</a>
    </div>
  );
}

export function RecentOrdersCard({ orders = [], totalGroups = 0 }) {
  return (
    <section aria-label="Recent orders" className="card home-list-card home-list-card--orders">
      <div className="card-header">
        <div><h2>Recent orders</h2><div className="card-subtitle">{totalGroups} order groups</div></div>
        <a className="btn btn-primary btn-sm" href="/next/orders">Open</a>
      </div>
      <div className="home-list">
        {orders.length ? orders.map((order) => (
          <a className="home-item home-item--order" href={order.href || "/next/orders"} key={order.key}>
            <div className="home-item__main">
              <div className="home-item__eyebrow">Order group</div>
              <div className="home-item__title">{order.title || "Order"}</div>
              <div className="home-item__meta">
                <span className="home-mini-chip home-mini-chip--neutral">{order.itemCount} {order.itemCount === 1 ? "item" : "items"}</span>
                <span className={`home-mini-chip home-mini-chip--${order.tone || "neutral"}`}>{order.status || "In progress"}</span>
                {order.date ? <span className="home-mini-chip home-mini-chip--neutral">{order.date}</span> : null}
              </div>
            </div>
            <div className="home-item__right"><span className="home-badge">{money(order.total)}</span><span className="home-arrow" aria-hidden="true"><Icon name="arrow-up-right"/></span></div>
          </a>
        )) : <div className="home-empty">No orders found</div>}
      </div>
    </section>
  );
}

export function QuickActionsCard({ actions = [] }) {
  return (
    <section aria-label="Quick actions" className="card home-actions home-panel home-panel--white">
      <div className="card-header"><div><h2>Quick actions</h2><div className="card-subtitle">Shortcuts based on your access</div></div></div>
      <div className="home-actions-grid">
        {actions.map((action) => (
          <a className="home-action" href={action.href} key={action.href}>
            <div className="home-action__left"><span className="home-action__ico"><Icon name={action.icon}/></span><div><div className="home-action__title">{action.title}</div><div className="home-action__sub">{action.sub}</div></div></div>
            <span className="home-action__right" aria-hidden="true"><Icon name="arrow-right"/></span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function ScopeCard({ account }) {
  const pages = Array.from(new Set((Array.isArray(account?.allowedPages) ? account.allowedPages : []).map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 18);
  return (
    <section aria-label="Your scope" className="card home-scope home-panel home-panel--navy">
      <div className="card-header"><div><h2>Your scope</h2><div className="card-subtitle">Department, position &amp; available pages</div></div><a className="btn btn-primary btn-sm" href="/next/account">Account</a></div>
      <div className="home-scope-body">
        <div className="home-scope-row"><div className="home-scope-k">Department</div><div className="home-scope-v">{account?.department || "—"}</div></div>
        <div className="home-scope-row"><div className="home-scope-k">Position</div><div className="home-scope-v">{account?.position || "—"}</div></div>
        <div className="home-scope-chips">{pages.length ? pages.map((page) => <span className="home-chip" key={page}>{page}</span>) : <div className="home-empty">No pages assigned</div>}</div>
      </div>
    </section>
  );
}
