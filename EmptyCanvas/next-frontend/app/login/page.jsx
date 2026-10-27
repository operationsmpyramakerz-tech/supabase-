import { redirect } from "next/navigation";
import LoginClient from "../../components/auth/LoginClient";
import { getLegacyAccountGate } from "../../lib/products-auth";

export const dynamic = "force-dynamic";

function safeNext(value) {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/next/home";
  if (/^\/login(?:[/?#]|$)/i.test(raw) || /^\/next\/login(?:[/?#]|$)/i.test(raw)) return "/next/home";
  return raw;
}

export default async function LoginPage({ searchParams }) {
  const query = await Promise.resolve(searchParams);
  const requestedNext = safeNext(query?.next);
  const gate = await getLegacyAccountGate([], { authOnly: true });

  if (gate.ok && gate.account) {
    if (requestedNext.startsWith("/next/")) {
      // redirect() receives an app-relative path because this Next.js app is
      // deployed with basePath=/next.
      redirect(requestedNext.slice("/next".length) || "/home");
    }
    redirect("/home");
  }

  return (
    <LoginClient
      requestedNext={requestedNext}
      backendAvailable={gate.status !== 503}
    />
  );
}
