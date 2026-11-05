// Keep incomplete typing local until blur; only commit finite positive quantities.
export function parseCartQuantityInput(value, fallback = 1) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d*(?:\.\d{0,3})?$/.test(normalized) || !/\d/.test(normalized)) return fallback;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  const rounded = Math.round(parsed * 1000) / 1000;
  return Number.isFinite(rounded) ? Math.max(0.01, rounded) : fallback;
}

export function stepCartQuantityInput(value, fallback, delta) {
  const next = parseCartQuantityInput(value, fallback) + delta;
  return Math.round(Math.max(0.01, next) * 1000) / 1000;
}
