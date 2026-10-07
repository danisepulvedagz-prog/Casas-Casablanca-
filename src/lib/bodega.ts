import type { Database } from "@/lib/supabase/types";

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];
type BodegaDespacho = Database["public"]["Tables"]["bodega_despachos"]["Row"];

export interface LoteBodega {
  gastoId: string;
  facturaId: string | null;
  transferenciaId: string | null;
  fecha: string;
  costoUnitario: number;
  cantidadOriginal: number;
  cantidadRestante: number;
}

export interface StockMaterial {
  material: string;
  unidad: string | null;
  cantidadDisponible: number;
  costoPromedio: number;
  // Lotes con stock > 0, del más antiguo al más nuevo — el despacho los
  // consume en este orden (FIFO), para que el respaldo (factura/transferencia)
  // que llega al proyecto destino sea siempre el de la compra real correspondiente.
  lotes: LoteBodega[];
}

/**
 * Stock de Bodega = lo comprado (gastos de Material del proyecto Bodega, con
 * cantidad) menos lo ya despachado de cada compra puntual — se rastrea lote
 * por lote (cada "lote" es un gasto de compra real, con su propia factura o
 * transferencia) en vez de un solo número agregado, para poder mantener el
 * respaldo real cuando el material se despacha a un proyecto.
 */
export function calcularStockBodega(gastosBodega: Gasto[], despachos: BodegaDespacho[]): StockMaterial[] {
  const porMaterial = new Map<string, { nombre: string; unidad: string | null; lotes: LoteBodega[] }>();
  for (const g of gastosBodega) {
    if (g.categoria !== "Material" || !g.material || g.cantidad == null) continue;
    const key = g.material.trim().toLowerCase();
    const acc = porMaterial.get(key) ?? { nombre: g.material.trim(), unidad: g.unidad, lotes: [] };
    if (!acc.unidad && g.unidad) acc.unidad = g.unidad;
    acc.lotes.push({
      gastoId: g.id,
      facturaId: g.factura_id,
      transferenciaId: g.transferencia_id,
      fecha: g.fecha,
      costoUnitario: g.costo_unitario ?? (g.cantidad > 0 ? g.monto_total / g.cantidad : 0),
      cantidadOriginal: g.cantidad,
      cantidadRestante: g.cantidad,
    });
    porMaterial.set(key, acc);
  }

  const consumidoPorLote = new Map<string, number>();
  for (const d of despachos) {
    consumidoPorLote.set(d.gasto_origen_id, (consumidoPorLote.get(d.gasto_origen_id) ?? 0) + d.cantidad);
  }

  return Array.from(porMaterial.values())
    .map((acc) => {
      const lotes = acc.lotes
        .map((lote) => ({
          ...lote,
          cantidadRestante: lote.cantidadOriginal - (consumidoPorLote.get(lote.gastoId) ?? 0),
        }))
        .filter((lote) => lote.cantidadRestante > 0)
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
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
    .filter((m) => m.cantidadDisponible > 0)
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
