import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Next.js doesn't trip over the
  // bun.lock in the parent home directory and pick the wrong root.
  turbopack: {
    root: __dirname,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.parallelism = 2;
    }
    return config;
  },
};

export default nextConfig;
