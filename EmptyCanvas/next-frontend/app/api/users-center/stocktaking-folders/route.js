import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { selectById } from "../../../../lib/supabase-rest";
import { listStocktakingFolders } from "../../../../lib/stocktaking-data";
import { getMemberStocktakingFolderKeys } from "../../../../lib/stocktaking-folder-access";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const ACCESS_PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];
const canon = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export async function GET(request) {
  const gate = featureGate(await getDirectAccountGate(ACCESS_PAGES), "users.feature_access_manage");
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status || 403 });
  const memberId = String(new URL(request.url).searchParams.get("memberId") || "").trim();
  if (!memberId) return NextResponse.json({ ok: false, error: "Member ID is required." }, { status: 400 });
  try {
    const member = await selectById(String(process.env.SUPABASE_TEAM_MEMBERS_TABLE || "team_members"), memberId);
    if (!member) return NextResponse.json({ ok: false, error: "Member not found." }, { status: 404 });
    const [folders, selected] = await Promise.all([
      listStocktakingFolders({ fresh: true }), getMemberStocktakingFolderKeys(memberId),
    ]);
    const own = folders.find(folder => String(folder.userId || "") === memberId)
      || folders.find(folder => canon(folder.label) === canon(member.name) ||
        canon(folder.stocktakingLabel) === canon(member.school || member.stocktaking_column));
    const primaryKey = own?.key || "";
    return NextResponse.json({ ok: true,
      ownFolder: { key: primaryKey, label: own?.label || member.name || "Own stock" },
      folders: folders.map(folder => ({ key: folder.key, label: folder.label,
        itemsCount: folder.itemsCount, userId: folder.userId })),
      selectedKeys: selected.filter(key => key !== primaryKey && folders.some(folder => folder.key === key)),
      expectedKeys: selected,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Could not load Stocktaking folders." },
      { status: Number(error?.status) || 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
