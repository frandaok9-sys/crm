import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These use dynamic requires; keep them out of the bundler on the server.
  serverExternalPackages: ["exceljs", "@react-pdf/renderer"],
  experimental: {
    serverActions: {
      // Fotos de la propuesta en presupuestos: viajan comprimidas en el
      // mismo guardado del formulario (default 1 MB quedaba corto).
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
