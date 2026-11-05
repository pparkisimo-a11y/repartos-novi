import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Custom server (server.js) serves Next.js in production, so no standalone output */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
