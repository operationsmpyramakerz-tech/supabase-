function normalizeBasePath(value) {
  const raw = String(value ?? "/next").trim();
  if (!raw || raw === "/") return "/next";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "") || "/next";
}

function normalizeHttpOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

const basePath = normalizeBasePath(process.env.NEXT_FRONTEND_BASE_PATH || "/next");
const legacyBackendOrigin = normalizeHttpOrigin(
  process.env.LEGACY_BACKEND_ORIGIN ||
  process.env.LEGACY_BACKEND_PUBLIC_ORIGIN ||
  process.env.LEGACY_BACKEND_INTERNAL_ORIGIN ||
  "",
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // The production pilot is deployed as a separate Vercel project. The Next
  // browser code intentionally keeps using the existing same-origin /api URLs
  // so cookies, uploads, downloads, and legacy fallbacks continue to behave as
  // they did in the Express application. A fallback rewrite turns requests
  // that do not belong to the Next app into a reverse proxy to the existing ERP.
  //
  // `basePath: false` is important here: /api, /images, /home?classic=1, etc.
  // live at the deployment root while the Next application itself lives under
  // /next. Next filesystem/pages are evaluated before this fallback, therefore
  // /next/* stays inside this project.
  async rewrites() {
    if (!legacyBackendOrigin) return [];

    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: "/:path*",
          destination: `${legacyBackendOrigin}/:path*`,
          basePath: false,
        },
      ],
    };
  },
};

export default nextConfig;
