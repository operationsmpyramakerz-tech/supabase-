"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExpensesCard } from "./DashboardCards";

function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function Icon({ name, className = "" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    className,
  };
  const paths = {
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
    "chevron-down": <polyline points="6 9 12 15 18 9" />,
    check: <polyline points="20 6 9 17 4 12" />,
  };
  return <svg {...common}>{paths[name] || paths.activity}</svg>;
}

function useOutsideClose(ref, close) {
  useEffect(() => {
    const onPointerDown = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ref, close]);
}

const TIME_OPTIONS = [
  { value: "week", label: "Last week" },
  { value: "month", label: "Last month" },
  { value: "year", label: "Last year" },
  { value: "all", label: "All time" },
];

const BY_OPTIONS = [
  { value: "status", label: "Status" },
  { value: "type", label: "Type" },
];

function InlineSelect({ label, value, options, open, onToggle, onChoose }) {
  const selected = options.find((option) => option.value === value) || options[options.length - 1];
  return (
    <div className={`home-analysis-select${open ? " is-open" : ""}`}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="home-analysis-select__trigger"
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }}
      >
        <span>{selected?.label || label}</span>
        <Icon name="chevron-down" />
      </button>
      <div className="home-analysis-select__menu" hidden={!open} role="listbox">
        {options.map((option) => (
          <button
            className={`home-analysis-select__option${option.value === value ? " is-selected" : ""}`}
            key={option.value}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChoose(option.value);
            }}
          >
            <span>{option.label}</span>
            <Icon name="check" />
          </button>
        ))}
      </div>
    </div>
  );
}

function AnalysisControl({ time, by, onTimeChange, onByChange }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState("");
  const close = () => {
    setOpen(false);
    setOpenSelect("");
  };
  useOutsideClose(ref, close);

  return (
    <div className={`home-orders-analysis${open ? " is-open" : ""}`} ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="true"
        className="home-orders-analysis__trigger"
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
          setOpenSelect("");
        }}
      >
        <span className="home-orders-analysis__icon"><Icon name="activity" /></span>
        <span className="home-orders-analysis__trigger-copy"><strong>Analysis</strong></span>
        <Icon name="chevron-down" className="home-orders-analysis__chevron" />
      </button>
      <div
        className="home-orders-analysis__menu next-home-analysis-menu"
        hidden={!open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div className="home-orders-analysis__field">
          <span className="home-orders-analysis__field-label">Time</span>
          <InlineSelect
            label="All time"
            value={time}
            options={TIME_OPTIONS}
            open={openSelect === "time"}
            onToggle={() => setOpenSelect((value) => value === "time" ? "" : "time")}
            onChoose={(value) => {
              onTimeChange(value);
              setOpenSelect("");
            }}
          />
        </div>
        <div className="home-orders-analysis__field">
          <span className="home-orders-analysis__field-label">Analysis by</span>
          <InlineSelect
            label="Status"
            value={by}
            options={BY_OPTIONS}
            open={openSelect === "by"}
            onToggle={() => setOpenSelect((value) => value === "by" ? "" : "by")}
            onChoose={(value) => {
              onByChange(value);
              setOpenSelect("");
            }}
          />
        </div>
      </div>
    </div>
  );
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
        style={{
          stroke: bucket.color || undefined,
          strokeDasharray: `${length.toFixed(2)} ${Math.max(0, circumference - length).toFixed(2)}`,
          strokeDashoffset: offset.toFixed(2),
        }}
      />
    );
  });
}

const SUMMARY_TONE = {
  pending: "orange",
  approved: "green",
  rejected: "red",
  received: "navy",
  delivered: "green",
  progress: "navy",
  completed: "green",
  request: "green",
  withdrawal: "red",
  maintenance: "orange",
};


function toRouterPath(href) {
  const raw = String(href || "/");
  if (raw === "/next") return "/";
  if (raw.startsWith("/next/")) return raw.slice(5) || "/";
  return raw;
}

function useCardNavigation(href) {
  const router = useRouter();
  return {
    onClick: (event) => {
      if (event.target.closest("button, a, input, select, .home-orders-analysis, .home-global-analysis, .home-stock-analysis")) return;
      router.push(toRouterPath(href));
    },
    onKeyDown: (event) => {
      if (event.target.closest("button, a, input, select, .home-orders-analysis, .home-global-analysis, .home-stock-analysis")) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        router.push(toRouterPath(href));
      }
    },
  };
}

function CurrentOrdersCard({ title, href, matrix }) {
  const [time, setTime] = useState("all");
  const [by, setBy] = useState("status");
  const summary = matrix?.[by]?.[time] || matrix?.status?.all || { total: 0, totalCost: 0, buckets: [] };
  const navigation = useCardNavigation(href);
  const classForBucket = (bucket) => `home-orders-ring__segment--${bucket.key === "progress" ? "progress" : bucket.key}`;

  return (
    <div aria-label={`${title} performance overview`} className="stat home-kpi home-orders-performance" role="link" tabIndex={0} {...navigation}>
      <div className="home-orders-performance__head">
        <div><div className="stat__label">{title}</div></div>
        <AnalysisControl time={time} by={by} onTimeChange={setTime} onByChange={setBy} />
      </div>
      <div className="home-orders-performance__body">
        <div className="home-orders-ring" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <circle className="home-orders-ring__track" cx="60" cy="60" r="44" />
            <RingSegments total={summary.total} buckets={summary.buckets} classPrefix="home-orders-ring__segment" classForBucket={classForBucket} />
          </svg>
          <div className="home-orders-ring__center"><strong>{summary.total}</strong><span>Total orders</span><small>{money(summary.totalCost)}</small></div>
        </div>
        <div className="home-orders-performance__legend">
          {summary.buckets.map((bucket) => (
            <div className={`home-orders-status home-orders-status--${bucket.key}`} key={bucket.key} style={{ "--status-color": bucket.color }}>
              <span className="home-orders-status__bar" />
              <div><strong>{bucket.count}</strong><span>{bucket.label}</span><small>{money(bucket.cost)}</small></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryOrdersCard({ title, href, matrix, variant, interactive = true }) {
  const [time, setTime] = useState("all");
  const [by, setBy] = useState("status");
  const summary = interactive
    ? (matrix?.[by]?.[time] || matrix?.status?.all)
    : (matrix?.status?.all || matrix);
  const safeSummary = summary || { total: 0, totalCost: 0, buckets: [] };
  const navigation = useCardNavigation(href);
  const classForBucket = (bucket) => `home-summary-ring__segment--${SUMMARY_TONE[bucket.key] || "navy"}`;

  return (
    <div aria-label={`${title} overview`} className={`stat home-kpi home-summary-performance home-summary-performance--${variant}`} role="link" tabIndex={0} {...navigation}>
      <div className="home-summary-performance__head">
        <div><div className="stat__label">{title}</div></div>
        {interactive ? <AnalysisControl time={time} by={by} onTimeChange={setTime} onByChange={setBy} /> : null}
      </div>
      <div className="home-summary-performance__body">
        <div className="home-summary-ring">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 120 120">
            <circle className="home-summary-ring__track" cx="60" cy="60" r="44" />
            <RingSegments total={safeSummary.total} buckets={safeSummary.buckets} classPrefix="home-summary-ring__segment" classForBucket={classForBucket} />
          </svg>
          <div className="home-summary-ring__center"><strong>{safeSummary.total}</strong><span>Total orders</span><small>{money(safeSummary.totalCost)}</small></div>
        </div>
        <div className="home-summary-performance__legend">
          {safeSummary.buckets.map((bucket) => (
            <div
              className={`home-summary-status home-summary-status--${SUMMARY_TONE[bucket.key] || "navy"}`}
              key={bucket.key}
              style={{ "--summary-status-color": bucket.color }}
            >
              <span className="home-summary-status__bar" />
              <div><strong>{bucket.count}</strong><span>{bucket.label}</span><small>{money(bucket.cost)}</small></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GlobalSelect({ value, options, open, onToggle, onChoose }) {
  const selected = options.find((option) => String(option.value) === String(value)) || options[0];
  return (
    <div className="home-global-select">
      <button
        className="home-global-select__trigger"
        type="button"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }}
      >
        <span>{selected?.label || "All"}</span>
        <Icon name="chevron-down" />
      </button>
      <div className="home-global-select__options" hidden={!open}>
        {options.map((option) => (
          <button
            type="button"
            className={`home-global-select__option${String(option.value) === String(value) ? " is-selected" : ""}`}
            key={option.value}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChoose(option.value);
            }}
          >
            <span>{option.label}</span>
            <Icon name="check" />
          </button>
        ))}
      </div>
    </div>
  );
}

function GlobalAnalysisControl({ users = [], selectedUser = "all", selectedDuration = "all" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState("");
  const [availableUsers, setAvailableUsers] = useState(users);
  const [usersLoaded, setUsersLoaded] = useState(users.length > 0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const close = () => {
    setOpen(false);
    setOpenSelect("");
  };
  useOutsideClose(ref, close);

  useEffect(() => {
    if (users.length) {
      setAvailableUsers(users);
      setUsersLoaded(true);
    }
  }, [users]);

  const loadUsers = async () => {
    if (usersLoaded || usersLoading) return;
    setUsersLoading(true);
    try {
      const response = await fetch("/api/home/analysis-users", { credentials: "same-origin", cache: "no-store" });
      const payload = response.ok ? await response.json().catch(() => ({})) : {};
      setAvailableUsers(Array.isArray(payload?.users) ? payload.users : []);
    } catch {
      setAvailableUsers([]);
    } finally {
      setUsersLoading(false);
      setUsersLoaded(true);
    }
  };

  const userOptions = useMemo(() => [
    { value: "all", label: usersLoading ? "Loading users…" : "All users" },
    ...availableUsers.map((user) => ({ value: String(user.id), label: user.name || user.username || String(user.id) })),
  ], [availableUsers, usersLoading]);
  const durationOptions = [
    { value: "all", label: "All time" },
    { value: "week", label: "Last week" },
    { value: "month", label: "Last month" },
    { value: "year", label: "Last year" },
  ];

  const applyQuery = (name, value) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(name);
    else params.set(name, String(value));
    const query = params.toString();
    close();
    const targetPath = toRouterPath(pathname);
    startTransition(() => router.replace(query ? `${targetPath}?${query}` : targetPath, { scroll: false }));
  };

  return (
    <div className="home-global-analysis" ref={ref}>
      <button
        className="home-global-analysis__trigger"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-busy={isPending}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => {
            const next = !value;
            if (next) void loadUsers();
            return next;
          });
          setOpenSelect("");
        }}
      >
        <span className="home-global-analysis__icon"><Icon name="activity" /></span>
        <strong>Analysis</strong>
        <Icon name="chevron-down" />
      </button>
      <div className="home-global-analysis__menu next-home-global-analysis__menu" hidden={!open}>
        <div className="home-global-analysis__field">
          <span>Users</span>
          <GlobalSelect
            value={selectedUser}
            options={userOptions}
            open={openSelect === "user"}
            onToggle={() => setOpenSelect((value) => value === "user" ? "" : "user")}
            onChoose={(value) => applyQuery("analysisUser", value)}
          />
        </div>
        <div className="home-global-analysis__field">
          <span>Duration</span>
          <GlobalSelect
            value={selectedDuration}
            options={durationOptions}
            open={openSelect === "duration"}
            onToggle={() => setOpenSelect((value) => value === "duration" ? "" : "duration")}
            onChoose={(value) => applyQuery("analysisDuration", value)}
          />
        </div>
      </div>
    </div>
  );
}

function StockCard({ tagSummaries = {}, tags = [] }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [tag, setTag] = useState("all");
  const close = () => {
    setOpen(false);
    setOptionsOpen(false);
  };
  useOutsideClose(ref, close);

  useEffect(() => {
    if (tag !== "all" && !tags.includes(tag)) setTag("all");
  }, [tag, tags]);

  const summary = tagSummaries[tag] || tagSummaries.all || { quantity: 0, cost: 0, records: 0 };
  const tagOptions = [{ value: "all", label: "All tags" }, ...tags.map((value) => ({ value, label: value }))];

  return (
    <div className="stat home-kpi home-stock-card">
      <div className="home-stock-card__head">
        <a className="home-stock-card__title" href="/next/stocktaking">Stocktaking</a>
        <div className="home-stock-analysis" ref={ref}>
          <button
            className="home-stock-analysis__trigger"
            type="button"
            aria-expanded={open}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen((value) => !value);
              setOptionsOpen(false);
            }}
          >
            <Icon name="activity"/><span>Analysis</span><Icon name="chevron-down"/>
          </button>
          <div className="home-stock-analysis__menu next-home-stock-analysis__menu" hidden={!open}>
            <div className="home-stock-filter">
              <span className="home-stock-filter__label">Filter by tag</span>
              <button
                className="home-stock-filter__trigger"
                type="button"
                aria-expanded={optionsOpen}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setOptionsOpen((value) => !value);
                }}
              >
                <span>{tag === "all" ? "All tags" : tag}</span>
                <Icon name="chevron-down" />
              </button>
              <div className="home-stock-filter__options" hidden={!optionsOpen}>
                {tagOptions.map((option) => (
                  <button
                    className={`home-stock-filter__option${option.value === tag ? " is-selected" : ""}`}
                    key={option.value}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setTag(option.value);
                      setOptionsOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    <Icon name="check" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="home-stock-card__metrics">
        <div><span>Total components</span><strong>{summary.quantity}</strong></div>
        <div><span>Total components cost</span><strong>{money(summary.cost)}</strong></div>
      </div>
      <div className="home-kpi-sub">
        {summary.records} component records{tag !== "all" ? ` • ${tag}` : ""}
      </div>
    </div>
  );
}

export default function HomeOverviewClient({
  analysisUsers = [],
  selectedUser = "all",
  selectedDuration = "all",
  currentMatrix,
  reviewMatrix,
  operationsMatrix,
  maintenanceSummary,
  stockTagSummaries,
  stockTags,
  expenseSummary,
  showCurrent,
  showReview,
  showOperations,
  showMaintenance,
  showStock,
  showExpenses,
}) {
  return (
    <section aria-label="Overview" className="card home-card home-card--hero">
      <div className="home-section-head">
        <h2 className="home-section-title">
          <Icon name="activity" />
          Overview
        </h2>
        <GlobalAnalysisControl users={analysisUsers} selectedUser={selectedUser} selectedDuration={selectedDuration} />
      </div>

      <div className="stats home-kpis">
        {showCurrent ? <CurrentOrdersCard title="Current orders" href="/next/orders" matrix={currentMatrix} /> : null}
        {showReview ? <SummaryOrdersCard title="Orders review" href="/next/orders-review" variant="review" matrix={reviewMatrix} /> : null}
        {showOperations ? <SummaryOrdersCard title="Operations orders" href="/next/operations-orders" variant="operations" matrix={operationsMatrix} /> : null}
        {showMaintenance ? <SummaryOrdersCard title="Maintenance orders" href="/next/maintenance-orders" variant="maintenance" matrix={{ status: { all: maintenanceSummary } }} interactive={false} /> : null}
        {showStock ? <StockCard tagSummaries={stockTagSummaries} tags={stockTags} /> : null}
        {showExpenses ? <ExpensesCard summary={expenseSummary} /> : null}
      </div>
    </section>
  );
}
