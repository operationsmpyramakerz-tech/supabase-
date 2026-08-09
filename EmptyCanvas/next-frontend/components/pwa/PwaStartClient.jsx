"use client";

import { useEffect, useState } from "react";

export default function PwaStartClient() {
  const [message, setMessage] = useState("Checking your Operations Hub session…");
  const [destination, setDestination] = useState("/next/home");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/session-status", {
          credentials: "include",
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const nextDestination = response.ok ? "/next/home" : "/next/login";
        if (cancelled) return;
        setDestination(nextDestination);
        setMessage(response.ok ? "Session ready. Opening your workspace…" : "Sign in is required. Opening the secure login…");
        window.setTimeout(() => window.location.replace(nextDestination), 180);
      } catch {
        if (cancelled) return;
        setDestination("/next/login");
        setMessage("The connection could not be verified. Opening sign in…");
        window.setTimeout(() => window.location.replace("/next/login"), 280);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="next-pwa-gate">
      <section className="next-pwa-gate__card">
        <img src="/icons/icon-192.png" alt="Operations Hub" />
        <span className="next-pwa-gate__pill">INSTALLED APP</span>
        <h1>Opening Operations Hub</h1>
        <p>{message}</p>
        <div className="next-pwa-gate__loader" aria-hidden="true" />
        <button type="button" onClick={() => window.location.replace(destination)}>Continue now</button>
        <a href="/next/app-install">App install settings</a>
      </section>
    </main>
  );
}
