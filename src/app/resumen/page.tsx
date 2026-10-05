import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { calcularRatiosPromedio, type RatioMaterial } from "@/lib/calculadora-m2";
import { calcularResumenProyecto } from "@/lib/resumen-proyecto";
import { ALERTA_ESTILOS, severidadAlerta, type Severidad } from "@/lib/alertas-ui";
import { currencyFormatter, estadoProyectoStyles } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];

const numberFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

export default async function ResumenSemanalPage() {
  const supabase = await createClient();

  const [{ data: proyectos }, { data: proyectosTerminados }] = await Promise.all([
    supabase.from("proyectos").select("*").eq("estado", "En curso").order("nombre"),
    supabase
      .from("proyectos")
      .select("id, m2, n_banos")
      .eq("estado", "Terminado")
      .eq("es_proyecto_referencia_m2", true),
  ]);

  const activos = (proyectos ?? []).filter((p) => p.modalidad !== "Postventa");
  const postventasActivas = (proyectos ?? []).filter((p) => p.modalidad === "Postventa");

  if (activos.length === 0 && postventasActivas.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Resumen semanal</h1>
        <p className="text-sm text-zinc-500">No hay proyectos en curso por ahora.</p>
      </div>
    );
  }

  const idsActivos = activos.map((p) => p.id);

  const [{ data: proyectoEtapas }, { data: catalogoEtapas }, { data: catalogoMateriales }, { data: gastosMateriales }] =
    await Promise.all([
      idsActivos.length > 0
        ? supabase.from("proyecto_etapas").select("*").in("proyecto_id", idsActivos)
        : Promise.resolve({ data: [] as Database["public"]["Tables"]["proyecto_etapas"]["Row"][] }),
      supabase.from("catalogo_etapas").select("*"),
      supabase.from("catalogo_materiales").select("*"),
      idsActivos.length > 0
        ? supabase.from("gastos").select("*").in("proyecto_id", idsActivos).eq("categoria", "Material")
        : Promise.resolve({ data: [] as Gasto[] }),
    ]);

  // Mismo promedio de ratios (cantidad/costo por m² o por baño) que usa la
  // calculadora de m², calculado una sola vez y reutilizado para estimar las
  // cantidades de cada proyecto activo — evita repetir la consulta de
  // proyectos Terminados y sus gastos por cada tarjeta.
  let ratiosReferencia: RatioMaterial[] = [];
  if (proyectosTerminados && proyectosTerminados.length > 0) {
    const { data: gastosTerminados } = await supabase
      .from("gastos")
      .select("*")
      .in("proyecto_id", proyectosTerminados.map((p) => p.id))
      .eq("categoria", "Material");

    const gastosPorProyecto = new Map<string, Gasto[]>();
    for (const g of gastosTerminados ?? []) {
      const lista = gastosPorProyecto.get(g.proyecto_id) ?? [];
      lista.push(g);
      gastosPorProyecto.set(g.proyecto_id, lista);
    }
    const proyectosConDatos = proyectosTerminados.filter((p) => gastosPorProyecto.has(p.id));
    ratiosReferencia = calcularRatiosPromedio(proyectosConDatos, gastosPorProyecto, catalogoMateriales ?? []);
  }

  const etapasPorProyecto = new Map<string, Database["public"]["Tables"]["proyecto_etapas"]["Row"][]>();
  for (const e of proyectoEtapas ?? []) {
    const lista = etapasPorProyecto.get(e.proyecto_id) ?? [];
    lista.push(e);
    etapasPorProyecto.set(e.proyecto_id, lista);
  }
  const gastosPorProyectoActivo = new Map<string, Gasto[]>();
  for (const g of gastosMateriales ?? []) {
    const lista = gastosPorProyectoActivo.get(g.proyecto_id) ?? [];
    lista.push(g);
    gastosPorProyectoActivo.set(g.proyecto_id, lista);
  }

  const resumenes = activos.map((proyecto) => ({
    proyecto,
    resumen: calcularResumenProyecto({
      proyecto,
      proyectoEtapas: etapasPorProyecto.get(proyecto.id) ?? [],
      catalogoEtapas: catalogoEtapas ?? [],
      catalogoMateriales: catalogoMateriales ?? [],
      gastosMaterial: gastosPorProyectoActivo.get(proyecto.id) ?? [],
      ratiosReferencia,
    }),
  }));

  const totalAlertas = resumenes.reduce((s, r) => s + r.resumen.alertas.length, 0);
  const totalMateriales = resumenes.reduce(
    (s, r) => s + r.resumen.alertas.reduce((s2, a) => s2 + a.materiales.length, 0),
    0
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Resumen semanal</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {activos.length} proyecto{activos.length === 1 ? "" : "s"} en curso · {totalAlertas} alerta
          {totalAlertas === 1 ? "" : "s"} de compra · {totalMateriales} material{totalMateriales === 1 ? "" : "es"}{" "}
          por cotizar/comprar
        </p>
      </div>

      <div className="grid gap-6">
        {resumenes.map(({ proyecto, resumen }) => (
          <section key={proyecto.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div>
                <Link
                  href={`/proyectos/${proyecto.id}`}
                  className="text-base font-semibold text-zinc-900 hover:text-brand dark:text-zinc-50"
                >
                  {proyecto.nombre}
                </Link>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {proyecto.modalidad} · {proyecto.m2} m²{proyecto.cliente ? ` · ${proyecto.cliente}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${estadoProyectoStyles[proyecto.estado] ?? ""}`}
                >
                  {resumen.estadoGeneralLabel}
                </span>
                <span className="text-xs text-zinc-500">
                  {resumen.avancePct}% ({resumen.terminadas}/{resumen.total})
                </span>
              </div>
            </div>

            <div className="px-5 pt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div className="h-full rounded-full bg-brand" style={{ width: `${resumen.avancePct}%` }} />
              </div>
            </div>

            <div className="px-5 py-4">
              {resumen.alertas.length === 0 ? (
                <p className="text-sm text-zinc-500">Sin compras urgentes esta semana.</p>
              ) : (
                <ul className="grid gap-2">
                  {resumen.alertas.map(({ etapa, catalogo, diasHastaInicio, materiales }) => {
                    const severidad: Severidad = severidadAlerta(diasHastaInicio);
                    const estilo = ALERTA_ESTILOS[severidad];
                    return (
                      <li key={etapa.id} className={`rounded-lg border ${estilo.box}`}>
                        <details open={severidad !== "proxima"}>
                          <summary className="cursor-pointer list-none px-4 py-2.5 select-none">
                            <div className="flex items-center justify-between gap-3">
                              <p className={`text-sm font-medium ${estilo.titulo}`}>
                                {etapa.estado === "en_curso"
                                  ? `"${catalogo.nombre}" en curso, con materiales sin comprar`
                                  : diasHastaInicio > 0
                                    ? `En ${diasHastaInicio} día${diasHastaInicio === 1 ? "" : "s"} comienza "${catalogo.nombre}"`
                                    : diasHastaInicio === 0
                                      ? `"${catalogo.nombre}" comienza hoy`
                                      : `"${catalogo.nombre}" debería haber comenzado hace ${Math.abs(diasHastaInicio)} día${Math.abs(diasHastaInicio) === 1 ? "" : "s"}`}
                              </p>
                              {materiales.length > 0 && (
                                <span className={`shrink-0 whitespace-nowrap text-xs ${estilo.label}`}>
                                  {materiales.length} material{materiales.length === 1 ? "" : "es"}
                                </span>
                              )}
                            </div>
                          </summary>
                          {materiales.length > 0 && (
                            <div className="px-4 pb-3">
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
            </div>
          </section>
        ))}
      </div>

      {postventasActivas.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Postventa activas</h2>
          <PostventasResumen proyectos={postventasActivas} />
        </section>
      )}
    </div>
  );
}

async function PostventasResumen({
  proyectos,
}: {
  proyectos: Database["public"]["Tables"]["proyectos"]["Row"][];
}) {
  const supabase = await createClient();
  const { data: gastos } = await supabase
    .from("gastos")
    .select("proyecto_id, monto_total")
    .in("proyecto_id", proyectos.map((p) => p.id));

  const gastadoPorProyecto = new Map<string, number>();
  for (const g of gastos ?? []) {
    gastadoPorProyecto.set(g.proyecto_id, (gastadoPorProyecto.get(g.proyecto_id) ?? 0) + g.monto_total);
  }

  return (
    <div className="grid gap-2">
      {proyectos.map((p) => (
        <Link
          key={p.id}
          href={`/proyectos/${p.id}`}
          className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 text-sm hover:border-brand dark:border-zinc-800"
        >
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{p.nombre}</span>
          <span className="text-zinc-500">{currencyFormatter.format(gastadoPorProyecto.get(p.id) ?? 0)} gastado</span>
        </Link>
      ))}
    </div>
  );
}
