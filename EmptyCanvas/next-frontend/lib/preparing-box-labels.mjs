// Project box labels belong to their original Kit groups. Cancelled boxes
// remain available in the audit history, but not in the active labels panel.
export function groupBoxLabels(kits = [], cartons = []) {
  const active = (Array.isArray(cartons) ? cartons : []).filter(box => box && box.status !== 'cancelled');
  const names = [...new Set([
    ...(Array.isArray(kits) ? kits : []),
    ...active.map(box => box.kit_name),
  ].filter(name => typeof name === 'string' && name.trim().length > 0))];
  return names.map(name => ({ name, cartons: active.filter(box => box.kit_name === name) }));
}
