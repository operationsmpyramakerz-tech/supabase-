import { redirect } from "next/navigation";
import LoginClient from "../../components/auth/LoginClient";
import { fetchLegacyJson } from "../../lib/legacy-api";

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
  const accountResponse = await fetchLegacyJson("/api/account", { timeoutMs: 7000 });

  if (accountResponse.ok && accountResponse.data) {
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
      backendAvailable={accountResponse.status !== 503}
      classicLoginHref={`/login?classic=1${query?.next ? `&next=${encodeURIComponent(String(query.next))}` : ""}`}
    />
  );
}
