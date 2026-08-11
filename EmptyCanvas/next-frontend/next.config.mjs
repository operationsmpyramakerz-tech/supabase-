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

  // Product APIs are the first backend slice owned by Next.js. Existing browser
  // code intentionally keeps its historical root /api/products URLs; these
  // beforeFiles rewrites route only that migrated namespace into the Next app.
  // Everything else continues to fall back to Express until its migration turn.
  async rewrites() {
    const beforeFiles = [
      {
        source: "/api/products",
        destination: `${basePath}/api/products`,
        basePath: false,
      },
      {
        source: "/api/products/:path*",
        destination: `${basePath}/api/products/:path*`,
        basePath: false,
      },
    ];

    if (!legacyBackendOrigin) {
      return { beforeFiles, afterFiles: [], fallback: [] };
    }

    return {
      beforeFiles,
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
