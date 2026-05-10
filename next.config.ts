import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root to this project so Next doesn't walk up
  // and pick a stray ~/package-lock.json. Without this, module resolution
  // points at /Users/<user>/node_modules and packages like `backboard-sdk`
  // appear "not found" even though they're installed locally.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
