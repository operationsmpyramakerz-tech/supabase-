// Keep the existing persisted execution states; confirmation is a display grouping.
export function eventConfirmation(value) {
  const status = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (status === "cancelled") return "cancelled";
  if (status === "in_progress" || status === "completed" || status === "confirmed") return "confirmed";
  return "pending";
}
export function eventConfirmationLabel(value) {
  return { pending: "Pending Confirmation", confirmed: "Confirmed", cancelled: "Cancelled" }[eventConfirmation(value)];
}
