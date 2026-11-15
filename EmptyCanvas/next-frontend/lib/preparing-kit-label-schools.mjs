// A label batch has one common Kit group and an equal label count for each school.
// Never offer a group which is absent from even one selected school's Proposal.
export function schoolKitGroupsForSelection(components = [], schoolIds = []) {
  if (!Array.isArray(schoolIds) || schoolIds.length === 0) return [];
  let common = null;
  for (const schoolId of schoolIds) {
    const kits = new Set();
    for (const component of components) {
      if (component.school_id !== schoolId) continue;
      if (!Array.isArray(component.source_kits) || component.source_kits.length === 0) kits.add('General');
      else for (const kit of component.source_kits) if (kit?.kitName) kits.add(String(kit.kitName));
    }
    common = common === null ? kits : new Set([...common].filter(name => kits.has(name)));
    if (!common.size) return [];
  }
  return [...common].sort((a,b) => a.localeCompare(b));
}

export function kitLabelGroupHasPlan(data, schoolIds, kitName) {
  if (!kitName || !schoolIds?.length) return false;
  const selected = new Set(schoolIds);
  const matched = (data?.cartons || []).filter(c => selected.has(c.school_id) && c.kit_name === kitName && c.generated_kit_label && c.status !== 'cancelled');
  const ids = new Set(matched.map(c => c.id));
  return (data?.kitTargets || []).some(t => ids.has(t.kit_box_id)) ||
    (data?.lines || []).some(l => ids.has(l.carton_id) && Number(l.packed_qty || 0) > 0) ||
    matched.some(c => c.status !== 'draft');
}
