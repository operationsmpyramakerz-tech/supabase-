/** Source provenance for a proposal, not membership in the current Kits catalogue. */
const clean = (value) => String(value ?? "").trim();
const quantity = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;

export function collectSourceKits(items = [], kits = [], folders = []) {
  const kitMap = new Map(kits.map((kit) => [clean(kit?.id), kit]));
  const folderMap = new Map(folders.map((folder) => [clean(folder?.id), folder]));
  const found = new Map();
  for (const item of items) {
    const sources = Array.isArray(item?.sourceKits) ? item.sourceKits : Array.isArray(item?.source_kits) ? item.source_kits : [];
    const total = sources.reduce((sum, source) => sum + quantity(source?.quantity ?? source?.qty), 0);
    const consistent = total === quantity(item?.quantity) && sources.every((source) => quantity(source?.quantity ?? source?.qty) > 0);
    for (const source of sources) {
      const id = clean(source?.kitId ?? source?.kit_id);
      if (!id) continue; // Direct/legacy additions must never be presented as removable kits.
      const catalogKit = kitMap.get(id);
      const folderId = clean(catalogKit?.folderId ?? catalogKit?.folder_id);
      const folderName = clean(folderMap.get(folderId)?.name) || "Unfiled Kits";
      if (!found.has(id)) found.set(id, {
        id, name: clean(catalogKit?.name) || clean(source?.kitName ?? source?.kit_name) || "Unnamed kit",
        folderId, folderName, componentIds: new Set(), totalQuantity: 0, canRemove: true,
        issue: "",
      });
      const entry = found.get(id);
      entry.componentIds.add(clean(item?.id) || clean(item?.productId ?? item?.product_id));
      entry.totalQuantity += quantity(source?.quantity ?? source?.qty);
      if (!consistent) {
        entry.canRemove = false;
        entry.issue = "Some component totals differ from their saved kit quantities. Review those items first.";
      }
    }
  }
  const rows = [...found.values()].map(({ componentIds, ...entry }) => ({ ...entry, components: componentIds.size }));
  const groups = new Map();
  rows.forEach((entry) => {
    const key = entry.folderId || `unfiled`;
    if (!groups.has(key)) groups.set(key, { id: key, name: entry.folderName, kits: [] });
    groups.get(key).kits.push(entry);
  });
  return [...groups.values()].map((folder) => ({ ...folder, kits: folder.kits.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => (a.id === "unfiled") - (b.id === "unfiled") || a.name.localeCompare(b.name));
}

/** Used only for an unsaved Create Proposal draft; persisted proposals use the atomic RPC. */
export function removeSourceKitFromDraft(items = [], kitId) {
  const id = clean(kitId);
  if (!id) throw new Error("Choose a valid kit.");
  const changed = [];
  let touched = 0;
  for (const item of items) {
    const sources = Array.isArray(item?.sourceKits) ? item.sourceKits : [];
    const matching = sources.filter((source) => clean(source?.kitId) === id);
    if (!matching.length) { changed.push(item); continue; }
    if (sources.some((source) => !quantity(source?.quantity))) throw new Error("A source quantity is invalid. No changes were made.");
    const previousTotal = sources.reduce((sum, source) => sum + quantity(source.quantity), 0);
    if (previousTotal !== quantity(item.quantity)) throw new Error("The source quantities don't match a component total. No changes were made.");
    const removed = matching.reduce((sum, source) => sum + quantity(source.quantity), 0);
    const remainingQuantity = quantity(item.quantity) - removed;
    if (remainingQuantity < 0) throw new Error("Invalid kit quantity. No changes were made.");
    touched += 1;
    if (remainingQuantity) changed.push({ ...item, quantity: remainingQuantity, sourceKits: sources.filter((source) => clean(source?.kitId) !== id) });
  }
  if (!touched) throw new Error("That kit is no longer part of the proposal.");
  return changed;
}
