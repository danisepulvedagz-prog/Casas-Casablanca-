import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Casas Casablanca",
    short_name: "Casas Casablanca",
    description: "Registrar gastos de obra — Casas Casablanca",
    // Al abrir desde el ícono va directo a elegir proyecto y cargar un gasto,
    // no al dashboard — es lo que se pidió: la app instalada sirve para
    // ingresar gastos rápido, no para navegar el resto de la plataforma.
    start_url: "/gastos/nuevo",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#31a47b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
