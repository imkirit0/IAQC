import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: { root: __dirname },
  // Dev server only: allow opening from any LAN IP (e.g. phones testing the visit form) or hostname.
  // Next rejects a bare "*" / "**", so match every IPv4 and every dotted hostname instead.
  allowedDevOrigins: ["*.*.*.*", "**.*"],
};

export default nextConfig;
