import "server-only";
import { select, rpc } from "./supabase-rest";

const TABLE = "erp_member_stocktaking_folder_access";
const clean = value => String(value ?? "").trim();

export async function getMemberStocktakingFolderKeys(memberId) {
  const id = clean(memberId);
  if (!id) return [];
  // Read on every request, with no shared access cache. If SQL has not yet
  // migrated, only the owner's stock remains available (fail closed).
  let rows;
  try {
    rows = await select(TABLE, {
      select: "folder_key", viewer_member_id: `eq.${id}`, limit: "500",
    }, { profileName: "stocktaking.folder-grants" });
  } catch (error) {
    const msg = clean(error?.message || error);
    if (/42P01|PGRST205|Could not find the table|relation .* does not exist/i.test(msg)) return [];
    throw error;
  }
  return (rows || []).map(row => clean(row.folder_key)).filter(Boolean);
}

export async function replaceMemberStocktakingFolderKeys(memberId, selected, expected) {
  const id = clean(memberId);
  if (!id || !Array.isArray(selected) || !Array.isArray(expected)) {
    throw Object.assign(new Error("Invalid stock folder request."), { status: 400 });
  }
  const keys = [...new Set(selected.map(clean))].sort();
  const old = [...new Set(expected.map(clean))].sort();
  try {
    const result = await rpc("erp_replace_member_stocktaking_folder_access", {
      p_viewer_member_id: id, p_folder_keys: keys, p_expected_folder_keys: old,
    }, { profileName: "stocktaking.replace-folder-grants" });
    return Array.isArray(result) ? result : keys;
  } catch (error) {
    if (/changed in another session/i.test(clean(error?.message || error))) error.status = 409;
    throw error;
  }
}
