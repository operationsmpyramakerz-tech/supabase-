"use client";

import ClassicOrderIcon from "./ClassicOrderIcon";

// One visual language for order types across every orders list.
// Keep the existing type-specific icons/colors rather than guessing from status.
const TYPES = {
  requestproducts: { label: "Request Products", icon: "shopping-cart", bg: "#DCFCE7", fg: "#166534", border: "#86EFAC" },
  withdrawproducts: { label: "Withdraw Products", icon: "log-out", bg: "#FEE2E2", fg: "#B91C1C", border: "#FECACA" },
  requestmaintenance: { label: "Request Maintenance", icon: "tool", bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" },
};

export default function OrderTypeBadge({ type, color }) {
  const key = String(type ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const meta = TYPES[key] || { label: String(type || "Order"), icon: "package", bg: "#E5E7EB", fg: "#374151", border: "#D1D5DB" };
  const style = { "--co-thumb-bg": meta.bg, "--co-thumb-fg": meta.fg, "--co-thumb-border": meta.border };
  return (
    <span className="co-thumb co-thumb--order-type orders-workspace-type-icon" title={meta.label} aria-label={`Order type: ${meta.label}`} style={style}>
      <ClassicOrderIcon name={meta.icon} />
    </span>
  );
}
