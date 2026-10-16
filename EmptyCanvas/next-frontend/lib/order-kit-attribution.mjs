/**
 * Attribute an order component to the kit(s) that actually supplied it.
 * A product may belong to several kits in different folders: the first
 * product membership is NEVER evidence of the order's source folder.
 *
 * This module has no database or React dependencies so that both the order
 * loader and the browser can use the same provenance rules.
 */
const text = (value) => String(value ?? "").replace(/\u00a0/g, " ").trim();
const key = (value) => text(value).normalize("NFKC").toLowerCase();

function isDirectSource(name) {
  return /^(?:direct(?:\s+components?)?|untracked(?:\s*\/\s*direct)?|unassigned(?:\s+kit)?)$/i.test(text(name));
}

function uniqueNamedMembership(memberships, name) {
  const matches = (Array.isArray(memberships) ? memberships : []).filter((entry) =>
    key(entry?.kitName || entry?.name) === key(name));
  // A name like "G5" can occur in multiple folders. Never pick the first.
  const distinctIds = new Set(matches.map((entry) => text(entry?.kitId || entry?.id) || `${entry?.folderId}:${entry?.folderName}`));
  return matches.length && distinctIds.size === 1 ? matches[0] : null;
}

export function resolveOrderKitAttribution({
  sources = [], memberships = [], kitById = new Map(), folderNameById = new Map(),
  storedKitTag = "", storedFolderName = "",
} = {}) {
  const safeSources = Array.isArray(sources) ? sources : [];
  const safeMemberships = Array.isArray(memberships) ? memberships : [];
  const breakdown = safeSources.map((source, index) => {
    const kitId = text(source?.kitId || source?.kit_id);
    const kitName = text(source?.kitName || source?.kitTag || source?.kit_name);
    const kit = kitId ? kitById.get(kitId) : null;
    const exactMember = kitId
      ? safeMemberships.find((entry) => text(entry?.kitId || entry?.id) === kitId)
      : (kitName && !isDirectSource(kitName) ? uniqueNamedMembership(safeMemberships, kitName) : null);
    // If an ID is recorded, missing kit metadata must NOT be filled using
    // another kit's name or an unrelated membership of the same product.
    const folderId = text(kit?.folderId || exactMember?.folderId);
    const explicitFolder = text(source?.kitFolderName || source?.folderName);
    const folderName = folderId
      ? (text(folderNameById.get(folderId)) || text(exactMember?.folderName) || explicitFolder || "Unfiled Kits")
      : (text(exactMember?.folderName) || explicitFolder || (kitId || (kitName && !isDirectSource(kitName)) ? "Unfiled Kits" : "Untracked / Direct"));
    return {
      kitId: kitId || null,
      kitTag: kitName || text(kit?.name) || text(exactMember?.kitName || exactMember?.name) || "Direct components",
      kitFolderName: folderName,
      quantity: Math.max(0, Number(source?.quantity) || 0),
      order: Number.isFinite(Number(source?.order)) ? Number(source.order) : index,
    };
  });

  // A stored order source takes precedence over every catalog membership.
  // Mirror order creation: highest source quantity first, then original order.
  const primary = breakdown.slice().sort((a, b) =>
    (b.quantity - a.quantity) || (a.order - b.order))[0] || null;
  if (primary) return {
    sourceBreakdown: breakdown,
    kitTag: primary.kitTag,
    kitFolderName: primary.kitFolderName,
  };

  // Legacy orders may have only `kit_tag`. Match by name ONLY when unique;
  // otherwise preserve the saved label without guessing its Theme.
  const savedName = text(storedKitTag);
  const exactLegacy = savedName ? uniqueNamedMembership(safeMemberships, savedName) : null;
  return {
    sourceBreakdown: [],
    kitTag: savedName || "Unassigned kit",
    kitFolderName: text(storedFolderName) || text(exactLegacy?.folderName) || (savedName ? "Unfiled Kits" : "Untracked / Direct"),
  };
}

/** A one-source order row needs the source folder even when no split occurs. */
export function withSingleOrderSourceAttribution(item = {}) {
  const sources = Array.isArray(item?.sourceBreakdown) ? item.sourceBreakdown : [];
  if (sources.length !== 1) return item;
  const source = sources[0] || {};
  return {
    ...item,
    kitTag: text(source?.kitTag) || text(item?.kitTag) || "Unassigned kit",
    kitFolderName: text(source?.kitFolderName) || text(item?.kitFolderName) || "Unfiled Kits",
  };
}

/** A merged export cannot truthfully label multiple source kits as one. */
export function combinedOrderKitAttribution(sources = []) {
  const list = (Array.isArray(sources) ? sources : []).filter((source) => Number(source?.quantity) > 0);
  if (!list.length) return null;
  const groups = new Set(list.map((source) => `${key(source?.kitId || source?.kitTag || source?.kitName)}|${key(source?.kitFolderName || source?.folderName)}`));
  if (groups.size === 1) return {
    kitTag: text(list[0]?.kitTag || list[0]?.kitName) || "Unassigned kit",
    kitFolderName: text(list[0]?.kitFolderName || list[0]?.folderName) || "Unfiled Kits",
    kitId: text(list[0]?.kitId) || null,
  };
  const folders = [...new Set(list.map((source) => text(source?.kitFolderName || source?.folderName) || "Unfiled Kits"))];
  return {
    kitTag: "Multiple Kits",
    kitFolderName: folders.length === 1 ? folders[0] : "Multiple Folders",
    kitId: null,
  };
}
