import type { Database } from "@/lib/supabase/types";

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];

export interface LoteBodega {
  gastoId: string;
  facturaId: string | null;
  transferenciaId: string | null;
  fecha: string;
  costoUnitario: number;
  cantidadRestante: number;
}

export interface StockMaterial {
  material: string;
  unidad: string | null;
  cantidadDisponible: number;
  costoPromedio: number;
  // Lotes del más antiguo al más nuevo — el despacho los consume en este
  // orden (FIFO). cantidadRestante es la cantidad ACTUAL del gasto de compra:
  // cada despacho resta directo de esa fila (o la borra si llega a 0), así
  // que acá no hace falta cruzar contra bodega_despachos para saber cuánto
  // queda — el número siempre está al día y la suma de ítems de una factura
  // nunca se desincroniza de su monto total.
  lotes: LoteBodega[];
}

export function calcularStockBodega(gastosBodega: Gasto[]): StockMaterial[] {
  const porMaterial = new Map<string, { nombre: string; unidad: string | null; lotes: LoteBodega[] }>();
  for (const g of gastosBodega) {
    if (g.categoria !== "Material" || !g.material || g.cantidad == null || g.cantidad <= 0) continue;
    const key = g.material.trim().toLowerCase();
    const acc = porMaterial.get(key) ?? { nombre: g.material.trim(), unidad: g.unidad, lotes: [] };
    if (!acc.unidad && g.unidad) acc.unidad = g.unidad;
    acc.lotes.push({
      gastoId: g.id,
      facturaId: g.factura_id,
      transferenciaId: g.transferencia_id,
      fecha: g.fecha,
      costoUnitario: g.costo_unitario ?? (g.cantidad > 0 ? g.monto_total / g.cantidad : 0),
      cantidadRestante: g.cantidad,
    });
    porMaterial.set(key, acc);
  }

  return Array.from(porMaterial.values())
    .map((acc) => {
      const lotes = [...acc.lotes].sort((a, b) => a.fecha.localeCompare(b.fecha));
      const cantidadDisponible = lotes.reduce((s, l) => s + l.cantidadRestante, 0);
      const montoDisponible = lotes.reduce((s, l) => s + l.cantidadRestante * l.costoUnitario, 0);
      return {
        material: acc.nombre,
        unidad: acc.unidad,
        cantidadDisponible,
        costoPromedio: cantidadDisponible > 0 ? montoDisponible / cantidadDisponible : 0,
        lotes,
      };
    })
    .sort((a, b) => a.material.localeCompare(b.material, "es"));
}

/**
 * Reparte una cantidad a despachar entre los lotes disponibles, empezando
 * por el más antiguo (FIFO) — si la cantidad cruza el límite de un lote,
 * sigue tomando del siguiente. Devuelve cuánto se tomó de cada uno; si la
 * suma queda corta es porque no había stock suficiente (se valida aparte).
 */
export function tomarDeLotesFIFO(
  lotes: LoteBodega[],
  cantidadNecesaria: number
): { lote: LoteBodega; cantidad: number }[] {
  const resultado: { lote: LoteBodega; cantidad: number }[] = [];
  let restante = cantidadNecesaria;
  for (const lote of lotes) {
    if (restante <= 0) break;
    const tomar = Math.min(lote.cantidadRestante, restante);
    if (tomar > 0) {
      resultado.push({ lote, cantidad: tomar });
      restante -= tomar;
    }
  }
  return resultado;
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
