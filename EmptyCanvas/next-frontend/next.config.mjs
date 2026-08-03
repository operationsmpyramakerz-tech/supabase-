const basePath = String(process.env.NEXT_FRONTEND_BASE_PATH || "/next").replace(/\/$/, "") || "/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
};

export default nextConfig;
