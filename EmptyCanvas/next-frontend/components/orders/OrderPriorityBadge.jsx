/** Reuses the priority saved on the order; historical records may have none. */
export default function OrderPriorityBadge({ value }) {
  const label = String(value ?? "").trim() || "—";
  const normalized = label.toLowerCase();
  const tone = ["low", "normal", "high", "urgent"].includes(normalized) ? normalized : "unknown";
  return <strong className={`order-summary-priority-badge is-${tone}`}>{label}</strong>;
}
