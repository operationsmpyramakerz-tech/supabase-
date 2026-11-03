// Remove redundant leading zeros while keeping a temporarily empty integer input editable.
// Do not coerce to Number here: that would break in-progress keyboard input.
export function normalizeStageQuantityDraft(raw) {
  const value = String(raw ?? "");
  return /^-?0+\d+$/.test(value)
    ? value.replace(/^(-?)0+(?=\d)/, "$1")
    : value;
}
