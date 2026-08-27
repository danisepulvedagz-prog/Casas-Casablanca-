import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DeleteProyectoButton } from "@/app/proyectos/delete-proyecto-button";
import { currencyFormatter, estadoProyectoStyles } from "@/lib/format";
import { BTN_PRIMARY, LINK_MUTED } from "@/lib/ui";

export default async function ProyectosPage() {
  const supabase = await createClient();
  const [{ data: proyectos, error }, { data: todasEtapas }] = await Promise.all([
    supabase.from("proyectos").select("*").order("created_at", { ascending: false }),
    supabase.from("proyecto_etapas").select("proyecto_id, estado"),
  ]);

  const avancePorProyecto = new Map<string, { terminadas: number; total: number }>();
  for (const e of todasEtapas ?? []) {
    const actual = avancePorProyecto.get(e.proyecto_id) ?? { terminadas: 0, total: 0 };
    actual.total += 1;
    if (e.estado === "terminada") actual.terminadas += 1;
    avancePorProyecto.set(e.proyecto_id, actual);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Proyectos</h1>
        <Link href="/proyectos/nuevo" className={BTN_PRIMARY}>
          + Nuevo proyecto
        </Link>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          No se pudieron cargar los proyectos: {error.message}
        </p>
      )}

      {!error && proyectos && proyectos.length === 0 && (
        <p className="text-sm text-zinc-500">Todavía no hay proyectos. Crea el primero.</p>
      )}

      {!error && proyectos && proyectos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {proyectos.map((proyecto) => {
            const avance = avancePorProyecto.get(proyecto.id);
            const avancePct =
              avance && avance.total > 0 ? Math.round((avance.terminadas / avance.total) * 100) : 0;

            return (
              <div
                key={proyecto.id}
                className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/proyectos/${proyecto.id}`}
                      className="font-medium text-zinc-900 hover:text-brand hover:underline dark:text-zinc-100"
                    >
                      {proyecto.nombre}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {proyecto.modalidad} · {proyecto.m2} m²
                      {proyecto.cliente ? ` · ${proyecto.cliente}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${estadoProyectoStyles[proyecto.estado] ?? ""}`}
                  >
                    {proyecto.estado}
                  </span>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                    <span>Avance de etapas</span>
                    <span>{avance && avance.total > 0 ? `${avancePct}%` : "Sin etapas"}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-brand transition-[width]"
                      style={{ width: `${avancePct}%` }}
                    />
                  </div>
                </div>

                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Presupuesto:{" "}
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {currencyFormatter.format(proyecto.presupuesto_total)}
                  </span>
                </p>

                {proyecto.es_proyecto_referencia_m2 && (
                  <span
                    title="Este proyecto se usa como base para estimar cantidades de materiales en la Calculadora m²"
                    className="w-fit cursor-help rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    Proyecto de referencia (m²)
                  </span>
                )}

                <div className="mt-auto flex items-center gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-900">
                  <Link href={`/proyectos/${proyecto.id}/gastos`} className={LINK_MUTED}>
                    Gastos
                  </Link>
                  <Link href={`/proyectos/${proyecto.id}/editar`} className={LINK_MUTED}>
                    Editar
                  </Link>
                  <div className="ml-auto">
                    <DeleteProyectoButton id={proyecto.id} nombre={proyecto.nombre} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
