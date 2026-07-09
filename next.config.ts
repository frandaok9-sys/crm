import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs uses dynamic requires; keep it out of the bundler on the server.
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
