import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The lab reads datasets and results from disk inside API routes.
  // Keeping the server runtime on Node (not Edge) makes `fs` available.
  serverExternalPackages: [],
};

export default nextConfig;
