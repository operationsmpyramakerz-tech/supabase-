import { redirect } from "next/navigation";
import { getLegacyAccountGate } from "../../lib/products-auth";

export const dynamic = "force-dynamic";

// Keep this route as a compatibility entry point for already-installed PWA
// versions whose saved start_url still points at /next/pwa-start. Do not render
// an intermediate launcher/splash screen: resolve the session on the server and
// send the user straight to the correct destination.
export default async function PwaStartPage() {
  const gate = await getLegacyAccountGate([]);

  if (gate.ok && gate.account) {
    redirect("/home");
  }

  redirect("/login");
}
