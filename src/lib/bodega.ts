import type { Database } from "@/lib/supabase/types";

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];
type BodegaDespacho = Database["public"]["Tables"]["bodega_despachos"]["Row"];

export interface StockMaterial {
  material: string;
  unidad: string | null;
  cantidadComprada: number;
  cantidadDespachada: number;
  cantidadDisponible: number;
  costoPromedio: number;
  montoComprado: number;
}

/**
 * Stock de Bodega = lo comprado (gastos de Material del proyecto Bodega, con
 * cantidad) menos lo ya despachado — nunca se guarda un número aparte, se
 * calcula siempre al vuelo para que nunca pueda quedar desincronizado.
 * El costo promedio es ponderado por todo lo comprado históricamente del
 * material, no por lote — más simple que rastrear FIFO por factura.
 */
export function calcularStockBodega(gastosBodega: Gasto[], despachos: BodegaDespacho[]): StockMaterial[] {
  const porMaterial = new Map<string, { nombre: string; unidad: string | null; cantidad: number; monto: number }>();
  for (const g of gastosBodega) {
    if (g.categoria !== "Material" || !g.material || g.cantidad == null) continue;
    const key = g.material.trim().toLowerCase();
    const acc = porMaterial.get(key) ?? { nombre: g.material.trim(), unidad: g.unidad, cantidad: 0, monto: 0 };
    acc.cantidad += g.cantidad;
    acc.monto += g.monto_total;
    if (!acc.unidad && g.unidad) acc.unidad = g.unidad;
    porMaterial.set(key, acc);
  }

  const despachadoPorMaterial = new Map<string, number>();
  for (const d of despachos) {
    const key = d.material.trim().toLowerCase();
    despachadoPorMaterial.set(key, (despachadoPorMaterial.get(key) ?? 0) + d.cantidad);
  }

  return Array.from(porMaterial.entries())
    .map(([key, acc]) => {
      const despachada = despachadoPorMaterial.get(key) ?? 0;
      return {
        material: acc.nombre,
        unidad: acc.unidad,
        cantidadComprada: acc.cantidad,
        cantidadDespachada: despachada,
        cantidadDisponible: acc.cantidad - despachada,
        costoPromedio: acc.cantidad > 0 ? acc.monto / acc.cantidad : 0,
        montoComprado: acc.monto,
      };
    })
    .sort((a, b) => a.material.localeCompare(b.material, "es"));
}

/**
 * Al despachar un material hacia un proyecto, sugiere la(s) etapa(s) de ESE
 * proyecto donde el catálogo ya tiene ese material registrado — para no
 * obligar a revisar las ~30 etapas a mano. Si el catálogo lo tiene en una
 * sola etapa del proyecto, esa es la sugerencia obvia; si está en varias,
 * se ofrecen como atajo; si no está en ninguna, no hay sugerencia (se elige
 * de la lista completa, igual que un material "Otros" hoy).
 */
export function etapasSugeridasParaMaterial(
  material: string,
  catalogoMateriales: { etapa_id: number | null; material: string }[],
  etapasDelProyecto: { id: number; nombre: string; orden: number }[]
): { id: number; nombre: string }[] {
  const key = material.trim().toLowerCase();
  const etapaIds = new Set(
    catalogoMateriales
      .filter((m) => m.etapa_id != null && m.material.trim().toLowerCase() === key)
      .map((m) => m.etapa_id as number)
  );
  return etapasDelProyecto
    .filter((e) => etapaIds.has(e.id))
    .sort((a, b) => a.orden - b.orden);
}
