// Changing the environment setting changes the rate for NEW / edited expenses only.
// The amount charged for each expense is stored in cash_out, so older records
// retain their original cost when the rate changes.
export const DEFAULT_OWN_CAR_RATE_EGP_PER_KM = 5.17;

export function ownCarRatePerKm() {
  const configured = Number(process.env.EXPENSE_OWN_CAR_RATE_PER_KM);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_OWN_CAR_RATE_EGP_PER_KM;
}

export function ownCarCostForKilometers(kilometers, rate = DEFAULT_OWN_CAR_RATE_EGP_PER_KM) {
  const distance = Number(kilometers);
  const price = Number(rate);
  if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(price) || price <= 0) return 0;
  return Math.round((distance * price + Number.EPSILON) * 100) / 100;
}
