import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: { root: __dirname },
  // Reference Data uploads go through a Server Action (files up to 4 MB, see REF_MAX_BYTES).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  // Dev server only: allow opening from any LAN IP (e.g. phones testing the visit form) or hostname.
  // Next rejects a bare "*" / "**", so match every IPv4 and every dotted hostname instead.
  allowedDevOrigins: ["*.*.*.*", "**.*"],
};

export default nextConfig;
