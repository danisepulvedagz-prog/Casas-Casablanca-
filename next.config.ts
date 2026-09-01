import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Nota: Vercel impone un límite duro de ~4.5 MB al cuerpo de estas
      // peticiones que este valor NO puede subir (ver gasto-wizard.tsx,
      // LIMITE_BYTES_ARCHIVO) — esto solo sirve para desarrollo local.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
