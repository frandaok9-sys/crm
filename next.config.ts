import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These use dynamic requires; keep them out of the bundler on the server.
  serverExternalPackages: ["exceljs", "@react-pdf/renderer"],
};

export default nextConfig;
