import { redirect } from "next/navigation";
import { getDirectSessionAccountGate } from "../../lib/direct-session-account";
import { getLegacyAccountGate } from "../../lib/products-auth";

export const dynamic = "force-dynamic";

function normalize(value) { return String(value || "").trim().toLowerCase(); }

function accountRoute(account) {
  const allowed = new Set((Array.isArray(account?.allowedPages) ? account.allowedPages : []).map(normalize));
  const databaseAccess = ["customer database", "b2c customer database", "b2c", "/b2c/database"].some((item) => allowed.has(item));
  const formAccess = ["customer form", "b2c customer form", "b2c", "/b2c/form"].some((item) => allowed.has(item));
  if (databaseAccess) return "/b2c/database";
  if (formAccess) return "/b2c/forms";
  return "/home";
}

export default async function B2cPage() {
  const direct = await getDirectSessionAccountGate(["Customer Database", "Customer Form", "B2C"]).catch(() => null);
  if (direct?.status === 401) redirect("/login?next=/next/b2c");
  if (direct?.ok && direct.account) redirect(accountRoute(direct.account));

  // Old sessions without a direct Supabase account snapshot continue through
  // the established account bridge so the migration remains backwards safe.
  const gate = await getLegacyAccountGate([]);
  if (gate.status === 401) redirect("/login?next=/next/b2c");
  if (!gate.ok || !gate.account) redirect("/home");
  redirect(accountRoute(gate.account));
}
