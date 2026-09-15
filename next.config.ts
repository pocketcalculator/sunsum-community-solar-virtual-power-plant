import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keeps tracing anchored to this repository when the build runs inside a
  // larger workspace; carried over from the project scaffold.
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
};

export default nextConfig;
