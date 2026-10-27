function normalizeBasePath(value) {
  const raw = String(value ?? "/next").trim();
  if (!raw || raw === "/") return "/next";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "") || "/next";
}

const basePath = normalizeBasePath(process.env.NEXT_FRONTEND_BASE_PATH || "/next");

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  serverExternalPackages: ["exceljs", "pdfkit", "web-push"],

  // Phase 46: the Next deployment is now self-contained. Do not proxy unknown
  // paths back to Express; every business API, auth/session lookup, page
  // bootstrap, PWA asset, and notification cron has a direct Next/Supabase path.
  // Keeping this list empty also makes accidental legacy dependencies fail fast
  // during QA instead of silently hiding behind the old backend.
  async rewrites() {
    return [];
  },
};

export default nextConfig;
