import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* F2: type safety enabled — was ignoreBuildErrors: true (hid ~295 type errors) */
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
