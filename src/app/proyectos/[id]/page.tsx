import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { diferenciaDias, hoyUTC, parseFechaUTC } from "@/lib/fechas";
import { modalidadesIncluidas } from "@/lib/etapas";
import { calcularRatiosPromedio, estimar } from "@/lib/calculadora-m2";
import type { Database } from "@/lib/supabase/types";

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];
import {
  currencyFormatter,
  estadoEtapaLabels,
  estadoEtapaStyles,
  estadoProyectoStyles,
  formatFecha,
} from "@/lib/format";
import { BTN_SECONDARY, LINK_MUTED } from "@/lib/ui";
import { DescargarAlertasBoton } from "./alertas-descargar-boton";

const numberFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

function claveMaterial(etapaId: number | null, material: string) {
  return `${etapaId ?? "sin-etapa"}::${material.trim().toLowerCase()}`;
}

type IconName = "trending-up" | "clock" | "currency" | "calendar" | "receipt" | "check-square" | "pencil";

const ICON_PATHS: Record<IconName, string> = {
  "trending-up": "M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941",
  clock: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  currency:
    "M12 6v12m3-8.25c0-1.03-1.34-1.875-3-1.875s-3 .845-3 1.875 1.34 1.875 3 1.875 3 .845 3 1.875S13.66 18 12 18s-3-.845-3-1.875",
  calendar:
    "M6.75 3v2.25M17.25 3v2.25M3.75 18.75h16.5V7.5a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 7.5v11.25zM3.75 9.75h16.5",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3z",
  "check-square": "M9 12l2 2 4-4M5 5h14v14H5V5z",
  pencil: "M16.862 3.487a2.06 2.06 0 112.915 2.914L7.5 18.675 3 20l1.325-4.5L16.862 3.487z",
};

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[name]} />
    </svg>
  );
}

type Severidad = "atrasada" | "hoy" | "proxima";

const ALERTA_ESTILOS: Record<
  Severidad,
  { box: string; titulo: string; label: string; item: string; cantidad: string }
> = {
  atrasada: {
    box: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950",
    titulo: "text-red-900 dark:text-red-200",
    label: "text-red-700 dark:text-red-400",
    item: "text-red-900 dark:text-red-200",
    cantidad: "text-red-700 dark:text-red-400",
  },
  hoy: {
    box: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950",
    titulo: "text-amber-900 dark:text-amber-200",
    label: "text-amber-700 dark:text-amber-400",
    item: "text-amber-900 dark:text-amber-200",
    cantidad: "text-amber-700 dark:text-amber-400",
  },
  proxima: {
    box: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900",
    titulo: "text-zinc-800 dark:text-zinc-100",
    label: "text-zinc-500 dark:text-zinc-400",
    item: "text-zinc-700 dark:text-zinc-300",
    cantidad: "text-zinc-600 dark:text-zinc-400",
  },
};

export default async function ProyectoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proyecto } = await supabase.from("proyectos").select("*").eq("id", id).single();
  if (!proyecto) notFound();

  const [
    { data: proyectoEtapas },
    { data: catalogoEtapas },
    { data: catalogoMateriales },
    { data: gastosMaterialProyecto },
    { data: proyectosTerminados },
  ] = await Promise.all([
    supabase.from("proyecto_etapas").select("*").eq("proyecto_id", id),
    supabase.from("catalogo_etapas").select("*").in("modalidad", modalidadesIncluidas(proyecto.modalidad)),
    supabase.from("catalogo_materiales").select("*"),
    supabase.from("gastos").select("*").eq("proyecto_id", id).eq("categoria", "Material"),
    supabase.from("proyectos").select("id, m2, n_banos").eq("estado", "Terminado").neq("id", id),
  ]);

  // Estima cantidades esperadas por material en base al promedio de todos los proyectos
  // Terminados (regla de 3 por m² o por N° de baños según corresponda). Si todavía no hay
  // ninguno con gastos, las alertas solo listan nombres, sin cantidad.
  let estimacionPorMaterial = new Map<string, { cantidad: number | null; unidad: string | null }>();
  if (proyectosTerminados && proyectosTerminados.length > 0) {
    const { data: gastosTerminados } = await supabase
      .from("gastos")
      .select("*")
      .in(
        "proyecto_id",
        proyectosTerminados.map((p) => p.id)
      )
      .eq("categoria", "Material");

    const gastosPorProyecto = new Map<string, Gasto[]>();
    for (const g of gastosTerminados ?? []) {
      const lista = gastosPorProyecto.get(g.proyecto_id) ?? [];
      lista.push(g);
      gastosPorProyecto.set(g.proyecto_id, lista);
    }
    const proyectosConDatos = proyectosTerminados.filter((p) => gastosPorProyecto.has(p.id));

    const ratios = calcularRatiosPromedio(proyectosConDatos, gastosPorProyecto, catalogoMateriales ?? []);
    const estimaciones = estimar(ratios, proyecto.m2, proyecto.n_banos);
    estimacionPorMaterial = new Map(
      estimaciones.map((e) => [e.material.trim().toLowerCase(), { cantidad: e.cantidadEstimada, unidad: e.unidad }])
    );
  }

  const gastadoPorClave = new Set(
    (gastosMaterialProyecto ?? [])
      .filter((g): g is typeof g & { material: string } => !!g.material)
      .map((g) => claveMaterial(g.etapa_id, g.material))
  );

  const catalogoPorId = new Map((catalogoEtapas ?? []).map((e) => [e.id, e]));
  const materialesPorEtapa = new Map<
    number,
    { material: string; cantidad: number | null; unidad: string | null }[]
  >();
  for (const m of catalogoMateriales ?? []) {
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

  const etapas = (proyectoEtapas ?? [])
    .map((pe) => ({ ...pe, catalogo: catalogoPorId.get(pe.etapa_id) }))
    .filter((pe) => pe.catalogo)
    .sort((a, b) => a.catalogo!.orden - b.catalogo!.orden);

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

  const alertas = etapas
    .filter((e) => (e.estado === "pendiente" || e.estado === "en_curso") && e.fecha_inicio_plan)
    .map((e) => {
      const diasHastaInicio = diferenciaDias(parseFechaUTC(e.fecha_inicio_plan!), hoy);
      return { etapa: e, diasHastaInicio };
    })
    .filter(({ etapa, diasHastaInicio }) =>
      // En curso: se avisa mientras queden materiales de la etapa sin ningún gasto
      // registrado, sin importar la ventana de lead time (ya se está construyendo).
      etapa.estado === "en_curso"
        ? (materialesPorEtapa.get(etapa.etapa_id) ?? []).length > 0
        : diasHastaInicio <= etapa.catalogo!.lead_time_dias_compra
    )
    .sort((a, b) => a.diasHastaInicio - b.diasHastaInicio);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-2">
        <Link href="/proyectos" className="text-sm text-zinc-500 hover:text-brand hover:underline">
          ← Proyectos
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{proyecto.nombre}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {proyecto.modalidad} · {proyecto.m2} m² {proyecto.cliente ? `· ${proyecto.cliente}` : ""}
          {proyecto.tipo_techo
            ? ` · Techo ${proyecto.tipo_techo}${proyecto.opcion_techo_inclinado ? ` (${proyecto.opcion_techo_inclinado})` : ""}`
            : ""}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href={`/proyectos/${id}/gastos`} className={`${BTN_SECONDARY} gap-1.5`}>
            <Icon name="receipt" className="h-4 w-4" />
            Ver gastos
          </Link>
          <Link href={`/proyectos/${id}/checklist`} className={`${BTN_SECONDARY} gap-1.5`}>
            <Icon name="check-square" className="h-4 w-4" />
            Checklist
          </Link>
          <Link href={`/proyectos/${id}/presupuesto`} className={`${BTN_SECONDARY} gap-1.5`}>
            <Icon name="currency" className="h-4 w-4" />
            Presupuesto
          </Link>
          <Link href={`/proyectos/${id}/editar`} className={`${BTN_SECONDARY} gap-1.5`}>
            <Icon name="pencil" className="h-4 w-4" />
            Editar proyecto
          </Link>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex items-start gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <Icon name="trending-up" className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
          <div>
            <p className="text-xs uppercase text-zinc-500">Avance</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              {avancePct}% ({terminadas}/{total})
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <Icon name="clock" className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
          <div>
            <p className="text-xs uppercase text-zinc-500">Estado</p>
            <p className="mt-1">
              <span
                className={`rounded-full px-2 py-1 text-sm font-medium ${estadoProyectoStyles[proyecto.estado] ?? ""}`}
              >
                {estadoGeneralLabel}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <Icon name="currency" className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
          <div>
            <p className="text-xs uppercase text-zinc-500">Presupuesto</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              {currencyFormatter.format(proyecto.presupuesto_total)}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <Icon name="calendar" className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
          <div>
            <p className="text-xs uppercase text-zinc-500">Inicio / término est.</p>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
              {formatFecha(proyecto.fecha_inicio)} → {formatFecha(proyecto.fecha_termino_estimada)}
            </p>
          </div>
        </div>
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Alertas de compra</h2>
          <DescargarAlertasBoton
            alertas={alertas.map(({ etapa, diasHastaInicio }) => ({
              etapa: etapa.catalogo!.nombre,
              estado: estadoEtapaLabels[etapa.estado],
              diasHastaInicio,
              materiales: materialesPorEtapa.get(etapa.etapa_id) ?? [],
            }))}
            nombreProyecto={proyecto.nombre}
          />
        </div>
        {alertas.length === 0 && (
          <p className="text-sm text-zinc-500">
            No hay compras urgentes por ahora: ninguna etapa pendiente entra en su ventana de lead time.
          </p>
        )}
        {alertas.length > 0 && (
          <ul className="grid gap-3">
            {alertas.map(({ etapa, diasHastaInicio }) => {
              const materiales = materialesPorEtapa.get(etapa.etapa_id) ?? [];
              const severidad: Severidad =
                diasHastaInicio < 0 ? "atrasada" : diasHastaInicio === 0 ? "hoy" : "proxima";
              const estilo = ALERTA_ESTILOS[severidad];
              return (
                <li key={etapa.id} className={`rounded-lg border ${estilo.box}`}>
                  <details open={severidad !== "proxima"}>
                    <summary className="cursor-pointer list-none px-4 py-3 select-none">
                      <div className="flex items-center justify-between gap-3">
                        <p className={`text-sm font-medium ${estilo.titulo}`}>
                          {diasHastaInicio > 0
                            ? `En ${diasHastaInicio} día${diasHastaInicio === 1 ? "" : "s"} comienza la etapa "${etapa.catalogo!.nombre}"`
                            : diasHastaInicio === 0
                              ? `La etapa "${etapa.catalogo!.nombre}" comienza hoy`
                              : `La etapa "${etapa.catalogo!.nombre}" debería haber comenzado hace ${Math.abs(diasHastaInicio)} día${Math.abs(diasHastaInicio) === 1 ? "" : "s"}`}
                        </p>
                        {materiales.length > 0 && (
                          <span className={`shrink-0 whitespace-nowrap text-xs ${estilo.label}`}>
                            {materiales.length} material{materiales.length === 1 ? "" : "es"}
                          </span>
                        )}
                      </div>
                    </summary>
                    {materiales.length > 0 && (
                      <div className="px-4 pb-4">
                        <p className={`mb-1.5 text-xs font-medium uppercase tracking-wide ${estilo.label}`}>
                          Cotizar/comprar ({materiales.length})
                        </p>
                        <div className="grid gap-1 sm:grid-cols-2">
                          {materiales.map((m) => (
                            <div
                              key={m.material}
                              className="flex items-center justify-between gap-2 rounded-md bg-white/70 px-3 py-1.5 text-sm dark:bg-black/20"
                            >
                              <span className={estilo.item}>{m.material}</span>
                              {m.cantidad != null && (
                                <span className={`shrink-0 whitespace-nowrap font-medium ${estilo.cantidad}`}>
                                  {numberFormatter.format(m.cantidad)} {m.unidad ?? ""}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Etapas</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Etapa</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Real</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {etapas.map((etapa) => (
                <tr key={etapa.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-4 py-3 text-zinc-500">{etapa.catalogo!.orden}</td>
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {etapa.catalogo!.nombre}
                    {etapa.catalogo!.es_paralelo && (
                      <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        en paralelo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {formatFecha(etapa.fecha_inicio_plan)} → {formatFecha(etapa.fecha_fin_plan)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {etapa.fecha_inicio_real || etapa.fecha_fin_real
                      ? `${formatFecha(etapa.fecha_inicio_real)} → ${formatFecha(etapa.fecha_fin_real)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${estadoEtapaStyles[etapa.estado]}`}
                    >
                      {estadoEtapaLabels[etapa.estado]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/proyectos/${id}/etapas/${etapa.id}/editar`} className={LINK_MUTED}>
                      Actualizar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
