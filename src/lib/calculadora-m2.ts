import type { Database, EscalaPor } from "@/lib/supabase/types";

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];
type CatalogoMaterial = Database["public"]["Tables"]["catalogo_materiales"]["Row"];

export interface RatioMaterial {
  material: string;
  unidad: string | null;
  cantidadTotal: number | null;
  montoTotal: number;
  escalaPor: EscalaPor;
  enCatalogo: boolean;
  ratioCantidadPorM2: number | null;
  ratioCostoPorM2: number;
  ratioCantidadPorBano: number | null;
  ratioCostoPorBano: number;
  // En cuántos proyectos terminados hay datos reales de este material. 1
  // cuando el ratio viene de un solo proyecto (calcularRatiosPorM2); más de 1
  // cuando viene de un promedio entre varios (calcularRatiosPromedio).
  proyectosConsiderados: number;
}

export function esEscalaBanos(escalaPor: EscalaPor): boolean {
  return escalaPor === "banos";
}

/**
 * Estos materiales necesitan tener ducha: un medio baño (0,5 = baño de
 * visita, wc + lavamanos) no los necesita. Se identifican por nombre en vez
 * de con un campo propio en el catálogo — al cargar un material solo se
 * elige "N° de baños" en general, sin tener que distinguir caso por caso.
 */
const MATERIALES_SIN_MEDIO_BANO = new Set([
  "shower/receptáculo",
  "mampara de baño",
  "escuadra estabilizadora mampara",
]);

function banosEfectivo(material: string, banos: number | null): number | null {
  if (banos == null) return null;
  return MATERIALES_SIN_MEDIO_BANO.has(material.trim().toLowerCase()) ? Math.floor(banos) : banos;
}

/**
 * Agrupa los gastos de categoría Material por nombre de material (sin
 * distinguir etapa: el ratio es "cuánto de este material se usó en toda la
 * casa por m² o por baño") y calcula el ratio contra los m²/baños del
 * proyecto de referencia mediante una regla de tres directa. Los materiales
 * marcados como 'fijo' en catalogo_materiales.escala_por quedan con ambos
 * ratios en null: su cantidad/costo es un valor fijo por proyecto, no algo
 * que crezca con el tamaño o la cantidad de baños de la casa nueva.
 */
export function calcularRatiosPorM2(
  gastosMaterial: Gasto[],
  catalogoMateriales: CatalogoMaterial[],
  m2Referencia: number,
  banosReferencia: number | null
): RatioMaterial[] {
  const escalaPorNombre = new Map<string, EscalaPor>();
  for (const cm of catalogoMateriales) {
    escalaPorNombre.set(cm.material.trim().toLowerCase(), cm.escala_por);
  }

  const grupos = new Map<
    string,
    { nombreOriginal: string; unidad: string | null; cantidadTotal: number | null; montoTotal: number }
  >();

  for (const g of gastosMaterial) {
    const nombre = (g.material ?? "Sin especificar").trim();
    const key = nombre.toLowerCase();
    const grupo = grupos.get(key) ?? {
      nombreOriginal: nombre,
      unidad: g.unidad,
      cantidadTotal: null,
      montoTotal: 0,
    };
    grupo.montoTotal += g.monto_total;
    if (g.cantidad != null) {
      grupo.cantidadTotal = (grupo.cantidadTotal ?? 0) + g.cantidad;
    }
    if (!grupo.unidad && g.unidad) grupo.unidad = g.unidad;
    grupos.set(key, grupo);
  }

  return Array.from(grupos.entries())
    .map(([key, grupo]) => {
      const enCatalogo = escalaPorNombre.has(key);
      const escalaPor = escalaPorNombre.get(key) ?? "m2";
      const porM2 = escalaPor === "m2";
      const banosRefEfectivo = esEscalaBanos(escalaPor)
        ? banosEfectivo(grupo.nombreOriginal, banosReferencia)
        : null;
      const porBano = banosRefEfectivo != null && banosRefEfectivo > 0;
      return {
        material: grupo.nombreOriginal,
        unidad: grupo.unidad,
        cantidadTotal: grupo.cantidadTotal,
        montoTotal: grupo.montoTotal,
        escalaPor,
        enCatalogo,
        ratioCantidadPorM2:
          porM2 && grupo.cantidadTotal != null ? grupo.cantidadTotal / m2Referencia : null,
        ratioCostoPorM2: porM2 ? grupo.montoTotal / m2Referencia : 0,
        ratioCantidadPorBano:
          porBano && grupo.cantidadTotal != null ? grupo.cantidadTotal / banosRefEfectivo! : null,
        ratioCostoPorBano: porBano ? grupo.montoTotal / banosRefEfectivo! : 0,
        proyectosConsiderados: 1,
      };
    })
    .sort((a, b) => a.material.localeCompare(b.material));
}

/**
 * Promedia los ratios de varios proyectos Terminados en vez de depender de
 * uno solo: cada proyecto aporta su propio ratio (cantidad/monto ÷ sus
 * propios m²/baños) y se promedian esos ratios entre sí (no se suman
 * cantidades crudas, para no sesgar hacia las casas más grandes). Así el
 * sistema se va ajustando solo a medida que se terminan más proyectos reales,
 * en vez de depender de los datos de una sola casa de referencia.
 */
export function calcularRatiosPromedio(
  proyectos: { id: string; m2: number; n_banos: number | null }[],
  gastosPorProyectoId: Map<string, Gasto[]>,
  catalogoMateriales: CatalogoMaterial[]
): RatioMaterial[] {
  const porProyecto = proyectos.map((p) =>
    calcularRatiosPorM2(gastosPorProyectoId.get(p.id) ?? [], catalogoMateriales, p.m2, p.n_banos)
  );

  interface Acumulador {
    material: string;
    unidad: string | null;
    escalaPor: EscalaPor;
    enCatalogo: boolean;
    proyectosConsiderados: number;
    sumCantidadTotal: number;
    countCantidadTotal: number;
    sumMontoTotal: number;
    countMontoTotal: number;
    sumRatioCantidadM2: number;
    countRatioCantidadM2: number;
    sumRatioCostoM2: number;
    countRatioCostoM2: number;
    sumRatioCantidadBano: number;
    countRatioCantidadBano: number;
    sumRatioCostoBano: number;
    countRatioCostoBano: number;
  }

  const acumulado = new Map<string, Acumulador>();

  for (const ratios of porProyecto) {
    for (const r of ratios) {
      const key = r.material.trim().toLowerCase();
      const acc = acumulado.get(key) ?? {
        material: r.material,
        unidad: r.unidad,
        escalaPor: r.escalaPor,
        enCatalogo: r.enCatalogo,
        proyectosConsiderados: 0,
        sumCantidadTotal: 0,
        countCantidadTotal: 0,
        sumMontoTotal: 0,
        countMontoTotal: 0,
        sumRatioCantidadM2: 0,
        countRatioCantidadM2: 0,
        sumRatioCostoM2: 0,
        countRatioCostoM2: 0,
        sumRatioCantidadBano: 0,
        countRatioCantidadBano: 0,
        sumRatioCostoBano: 0,
        countRatioCostoBano: 0,
      };

      acc.proyectosConsiderados += 1;
      if (!acc.unidad && r.unidad) acc.unidad = r.unidad;

      if (r.cantidadTotal != null) {
        acc.sumCantidadTotal += r.cantidadTotal;
        acc.countCantidadTotal += 1;
      }
      acc.sumMontoTotal += r.montoTotal;
      acc.countMontoTotal += 1;

      if (r.ratioCantidadPorM2 != null) {
        acc.sumRatioCantidadM2 += r.ratioCantidadPorM2;
        acc.countRatioCantidadM2 += 1;
      }
      if (r.escalaPor === "m2") {
        acc.sumRatioCostoM2 += r.ratioCostoPorM2;
        acc.countRatioCostoM2 += 1;
      }
      if (r.ratioCantidadPorBano != null) {
        acc.sumRatioCantidadBano += r.ratioCantidadPorBano;
        acc.countRatioCantidadBano += 1;
      }
      if (esEscalaBanos(r.escalaPor)) {
        acc.sumRatioCostoBano += r.ratioCostoPorBano;
        acc.countRatioCostoBano += 1;
      }

      acumulado.set(key, acc);
    }
  }

  return Array.from(acumulado.values())
    .map((acc) => ({
      material: acc.material,
      unidad: acc.unidad,
      cantidadTotal: acc.countCantidadTotal > 0 ? acc.sumCantidadTotal / acc.countCantidadTotal : null,
      montoTotal: acc.countMontoTotal > 0 ? acc.sumMontoTotal / acc.countMontoTotal : 0,
      escalaPor: acc.escalaPor,
      enCatalogo: acc.enCatalogo,
      ratioCantidadPorM2:
        acc.countRatioCantidadM2 > 0 ? acc.sumRatioCantidadM2 / acc.countRatioCantidadM2 : null,
      ratioCostoPorM2: acc.countRatioCostoM2 > 0 ? acc.sumRatioCostoM2 / acc.countRatioCostoM2 : 0,
      ratioCantidadPorBano:
        acc.countRatioCantidadBano > 0 ? acc.sumRatioCantidadBano / acc.countRatioCantidadBano : null,
      ratioCostoPorBano: acc.countRatioCostoBano > 0 ? acc.sumRatioCostoBano / acc.countRatioCostoBano : 0,
      proyectosConsiderados: acc.proyectosConsiderados,
    }))
    .sort((a, b) => a.material.localeCompare(b.material));
}

export interface RatioManoObraEtapa {
  ratioCostoPorM2: number;
  proyectosConsiderados: number;
}

/**
 * Igual idea que calcularRatiosPromedio pero para Mano de Obra: como esos
 * gastos no tienen un "material" que los identifique, se agrupan solo por
 * etapa y se escalan por m² (cada proyecto aporta monto_etapa / sus propios
 * m², y esos ratios se promedian entre los proyectos Terminados que
 * tengan datos para esa etapa).
 */
export function calcularRatiosManoObraPorEtapa(
  proyectos: { id: string; m2: number }[],
  gastosManoObraPorProyectoId: Map<string, Gasto[]>
): Map<number, RatioManoObraEtapa> {
  const acumulado = new Map<number, { sumRatio: number; count: number }>();

  for (const p of proyectos) {
    const gastos = gastosManoObraPorProyectoId.get(p.id) ?? [];
    const montoPorEtapa = new Map<number, number>();
    for (const g of gastos) {
      if (g.etapa_id == null) continue;
      montoPorEtapa.set(g.etapa_id, (montoPorEtapa.get(g.etapa_id) ?? 0) + g.monto_total);
    }
    for (const [etapaId, monto] of montoPorEtapa) {
      const ratio = monto / p.m2;
      const acc = acumulado.get(etapaId) ?? { sumRatio: 0, count: 0 };
      acc.sumRatio += ratio;
      acc.count += 1;
      acumulado.set(etapaId, acc);
    }
  }

  const resultado = new Map<number, RatioManoObraEtapa>();
  for (const [etapaId, acc] of acumulado) {
    resultado.set(etapaId, { ratioCostoPorM2: acc.sumRatio / acc.count, proyectosConsiderados: acc.count });
  }
  return resultado;
}

export interface EstimacionMaterial {
  material: string;
  unidad: string | null;
  cantidadEstimada: number | null;
  costoEstimado: number;
  escalaPor: EscalaPor;
}

export function estimar(
  ratios: RatioMaterial[],
  m2Nuevo: number,
  banosNuevo: number | null
): EstimacionMaterial[] {
  return ratios.map((r) => {
    if (r.escalaPor === "m2") {
      return {
        material: r.material,
        unidad: r.unidad,
        escalaPor: r.escalaPor,
        cantidadEstimada: redondearArriba(
          r.ratioCantidadPorM2 != null ? r.ratioCantidadPorM2 * m2Nuevo : null
        ),
        costoEstimado: r.ratioCostoPorM2 * m2Nuevo,
      };
    }
    if (esEscalaBanos(r.escalaPor)) {
      const banosNuevoEfectivo = banosEfectivo(r.material, banosNuevo);
      if (banosNuevoEfectivo != null && banosNuevoEfectivo > 0) {
        return {
          material: r.material,
          unidad: r.unidad,
          escalaPor: r.escalaPor,
          cantidadEstimada: redondearArriba(
            r.ratioCantidadPorBano != null ? r.ratioCantidadPorBano * banosNuevoEfectivo : null
          ),
          costoEstimado: r.ratioCostoPorBano * banosNuevoEfectivo,
        };
      }
    }
    return {
      material: r.material,
      unidad: r.unidad,
      escalaPor: r.escalaPor,
      cantidadEstimada: redondearArriba(r.cantidadTotal),
      costoEstimado: r.montoTotal,
    };
  });
}

// Las cantidades a comprar no pueden quedar fraccionadas (no se compran 9,92 rollos):
// siempre se redondea hacia arriba, nunca hacia abajo, para no quedar corto de material.
function redondearArriba(cantidad: number | null): number | null {
  return cantidad == null ? null : Math.ceil(cantidad);
}
