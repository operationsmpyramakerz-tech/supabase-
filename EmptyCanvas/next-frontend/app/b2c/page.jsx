import { redirect } from "next/navigation";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

function normalize(value) { return String(value || "").trim().toLowerCase(); }

export default async function B2cPage() {
  const response = await fetchLegacyJson("/api/account", { timeoutMs: 12000 });
  if (response.status === 401) redirect("/login?next=/next/b2c");
  if (!response.ok || !response.data) redirect("/home");

  const allowed = new Set((Array.isArray(response.data.allowedPages) ? response.data.allowedPages : []).map(normalize));
  const databaseAccess = ["customer database", "b2c customer database", "b2c", "/b2c/database"].some((item) => allowed.has(item));
  const formAccess = ["customer form", "b2c customer form", "b2c", "/b2c/form"].some((item) => allowed.has(item));

  if (databaseAccess) redirect("/b2c/database");
  if (formAccess) redirect("/b2c/forms");
  redirect("/home");
}
