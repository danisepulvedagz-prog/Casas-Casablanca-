import type { Database } from "@/lib/supabase/types";
import { diferenciaDias, hoyUTC, parseFechaUTC } from "@/lib/fechas";
import { estimar, type RatioMaterial } from "@/lib/calculadora-m2";

type Proyecto = Database["public"]["Tables"]["proyectos"]["Row"];
type ProyectoEtapa = Database["public"]["Tables"]["proyecto_etapas"]["Row"];
type CatalogoEtapa = Database["public"]["Tables"]["catalogo_etapas"]["Row"];
type CatalogoMaterial = Database["public"]["Tables"]["catalogo_materiales"]["Row"];
type Gasto = Database["public"]["Tables"]["gastos"]["Row"];

function claveMaterial(etapaId: number | null, material: string) {
  return `${etapaId ?? "sin-etapa"}::${material.trim().toLowerCase()}`;
}

export interface MaterialAlerta {
  material: string;
  cantidad: number | null;
  unidad: string | null;
}

export interface AlertaEtapa {
  etapa: ProyectoEtapa;
  catalogo: CatalogoEtapa;
  diasHastaInicio: number;
  materiales: MaterialAlerta[];
}

export interface ResumenProyecto {
  etapas: (ProyectoEtapa & { catalogo: CatalogoEtapa })[];
  total: number;
  terminadas: number;
  avancePct: number;
  diasAtrasoMax: number;
  estadoGeneralLabel: string;
  alertas: AlertaEtapa[];
}

/**
 * Misma lógica de avance + "Alertas de compra" que usa la ficha de un
 * proyecto (src/app/proyectos/[id]/page.tsx), separada para poder calcularla
 * también para varios proyectos a la vez (resumen semanal) sin duplicar el
 * cálculo de cuántos días faltan para cada etapa ni qué materiales le faltan.
 */
export function calcularResumenProyecto(params: {
  proyecto: Pick<Proyecto, "estado" | "m2" | "n_banos">;
  proyectoEtapas: ProyectoEtapa[];
  catalogoEtapas: CatalogoEtapa[];
  catalogoMateriales: CatalogoMaterial[];
  gastosMaterial: Gasto[];
  ratiosReferencia: RatioMaterial[];
}): ResumenProyecto {
  const { proyecto, proyectoEtapas, catalogoEtapas, catalogoMateriales, gastosMaterial, ratiosReferencia } = params;

  const estimaciones = estimar(ratiosReferencia, proyecto.m2, proyecto.n_banos);
  const estimacionPorMaterial = new Map(
    estimaciones.map((e) => [e.material.trim().toLowerCase(), { cantidad: e.cantidadEstimada, unidad: e.unidad }])
  );

  const gastadoPorClave = new Set(
    gastosMaterial
      .filter((g): g is typeof g & { material: string } => !!g.material)
      .map((g) => claveMaterial(g.etapa_id, g.material))
  );

  const materialesPorEtapa = new Map<number, MaterialAlerta[]>();
  for (const m of catalogoMateriales) {
    if (m.etapa_id == null) continue;
    // Ya se registró un gasto para este material en esta etapa: se asume comprado, no se avisa más.
    if (gastadoPorClave.has(claveMaterial(m.etapa_id, m.material))) continue;
    const estimacion = estimacionPorMaterial.get(m.material.trim().toLowerCase());
    const lista = materialesPorEtapa.get(m.etapa_id) ?? [];
    lista.push({
      material: m.material,
      cantidad: estimacion?.cantidad ?? null,
      unidad: estimacion?.unidad ?? m.unidad_default,
    });
    materialesPorEtapa.set(m.etapa_id, lista);
  }

  const catalogoPorId = new Map(catalogoEtapas.map((e) => [e.id, e]));
  const etapas = proyectoEtapas
    .map((pe) => ({ ...pe, catalogo: catalogoPorId.get(pe.etapa_id) }))
    .filter((pe): pe is ProyectoEtapa & { catalogo: CatalogoEtapa } => !!pe.catalogo)
    .sort((a, b) => a.catalogo.orden - b.catalogo.orden);

  const total = etapas.length;
  const terminadas = etapas.filter((e) => e.estado === "terminada").length;
  const avancePct = total > 0 ? Math.round((terminadas / total) * 100) : 0;

  const hoy = hoyUTC();

  let diasAtrasoMax = 0;
  for (const e of etapas) {
    if (e.estado === "terminada" || !e.fecha_fin_plan) continue;
    const dias = diferenciaDias(hoy, parseFechaUTC(e.fecha_fin_plan));
    if (dias > diasAtrasoMax) diasAtrasoMax = dias;
  }

  const estadoGeneralLabel =
    proyecto.estado !== "En curso"
      ? proyecto.estado
      : diasAtrasoMax > 0
        ? `Atrasado (${diasAtrasoMax} día${diasAtrasoMax === 1 ? "" : "s"})`
        : "A tiempo";

  const alertas: AlertaEtapa[] = etapas
    .filter((e) => (e.estado === "pendiente" || e.estado === "en_curso") && e.fecha_inicio_plan)
    .map((e) => {
      const diasHastaInicio = diferenciaDias(parseFechaUTC(e.fecha_inicio_plan!), hoy);
      return { etapa: e, catalogo: e.catalogo, diasHastaInicio, materiales: materialesPorEtapa.get(e.etapa_id) ?? [] };
    })
    .filter(({ catalogo, materiales, diasHastaInicio, etapa }) =>
      // En curso: se avisa mientras queden materiales de la etapa sin ningún gasto
      // registrado, sin importar la ventana de lead time (ya se está construyendo).
      etapa.estado === "en_curso" ? materiales.length > 0 : diasHastaInicio <= catalogo.lead_time_dias_compra
    )
    .sort((a, b) => a.diasHastaInicio - b.diasHastaInicio);

  return { etapas, total, terminadas, avancePct, diasAtrasoMax, estadoGeneralLabel, alertas };
}
