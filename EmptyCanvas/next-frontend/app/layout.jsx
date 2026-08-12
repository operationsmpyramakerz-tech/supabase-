import Script from "next/script";
import "./globals.css";
import "./classic-parity.css";
import "./system-ui.css";

export const metadata = {
  title: "Operations Hub — Next.js Pilot",
  description: "Incremental Next.js frontend for Operations Hub.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script src="/pwa-register.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
