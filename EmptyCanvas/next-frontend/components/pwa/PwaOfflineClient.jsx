"use client";

import { useEffect, useState } from "react";

export default function PwaOfflineClient() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <main className="next-pwa-gate is-offline">
      <section className="next-pwa-gate__card">
        <img src="/icons/icon-192.png" alt="Operations Hub" />
        <span className={`next-pwa-gate__pill ${online ? "is-online" : ""}`}>{online ? "CONNECTION RESTORED" : "OFFLINE"}</span>
        <h1>{online ? "You are back online" : "You are offline"}</h1>
        <p>{online ? "The connection is available again. You can reopen the live Operations Hub workspace." : "The installed app is available, but live ERP data needs an internet connection."}</p>
        <button type="button" onClick={() => window.location.replace(online ? "/next/pwa-start" : window.location.href)}>
          {online ? "Open Operations Hub" : "Try again"}
        </button>
        <a href="/next/login">Open sign in</a>
      </section>
    </main>
  );
}
