import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./private-assets/outreach-guides/*.pdf"],
  },
};

export default nextConfig;
