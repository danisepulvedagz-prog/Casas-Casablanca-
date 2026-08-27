import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Las fotos de facturas/boletas tomadas con celular suelen pesar más
      // que el límite por defecto de 1 MB de los Server Actions.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
