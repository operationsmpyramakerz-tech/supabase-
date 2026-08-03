import "./globals.css";

export const metadata = {
  title: "Operations Hub — Next.js Pilot",
  description: "Incremental Next.js frontend for Operations Hub.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
