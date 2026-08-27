import { createClient } from "@/lib/supabase/server";
import { calcularRatiosPromedio, esEscalaBanos } from "@/lib/calculadora-m2";
import { currencyFormatter, escalaPorLabels } from "@/lib/format";
import { Estimacion } from "@/app/calculadora-m2/estimacion";
import type { Database } from "@/lib/supabase/types";

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];

const numberFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });

export default async function CalculadoraM2Page() {
  const supabase = await createClient();

  const { data: proyectosTerminados } = await supabase
    .from("proyectos")
    .select("id, nombre, m2, n_banos")
    .eq("estado", "Terminado")
    .order("nombre");

  let ratios: ReturnType<typeof calcularRatiosPromedio> = [];
  let proyectosConDatos: typeof proyectosTerminados = [];

  if (proyectosTerminados && proyectosTerminados.length > 0) {
    const { data: gastosMaterial } = await supabase
      .from("gastos")
      .select("*")
      .in(
        "proyecto_id",
        proyectosTerminados.map((p) => p.id)
      )
      .eq("categoria", "Material");
    const { data: catalogoMateriales } = await supabase.from("catalogo_materiales").select("*");

    const gastosPorProyecto = new Map<string, Gasto[]>();
    for (const g of gastosMaterial ?? []) {
      const lista = gastosPorProyecto.get(g.proyecto_id) ?? [];
      lista.push(g);
      gastosPorProyecto.set(g.proyecto_id, lista);
    }

    proyectosConDatos = proyectosTerminados.filter((p) => gastosPorProyecto.has(p.id));
    ratios = calcularRatiosPromedio(proyectosConDatos, gastosPorProyecto, catalogoMateriales ?? []);
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Calculadora de materiales por m²
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Estima cuánto material y costo va a necesitar una casa nueva, en base al promedio de lo
        realmente gastado en los proyectos Terminados. Se recalcula solo a medida que terminas más
        proyectos: mientras más datos reales haya, más ajustada queda la estimación.
      </p>

      {(!proyectosTerminados || proyectosTerminados.length === 0) && (
        <p className="text-sm text-zinc-500">
          Todavía no hay proyectos en estado Terminado. En cuanto termines el primero, sus gastos van a
          alimentar esta calculadora automáticamente.
        </p>
      )}

      {proyectosTerminados && proyectosTerminados.length > 0 && ratios.length === 0 && (
        <p className="text-sm text-zinc-500">
          Hay {proyectosTerminados.length} proyecto{proyectosTerminados.length === 1 ? "" : "s"} Terminado
          {proyectosTerminados.length === 1 ? "" : "s"}, pero todavía sin gastos de categoría Material
          registrados.
        </p>
      )}

      {ratios.length > 0 && (
        <>
          <section className="mb-10">
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Ratios promedio ({proyectosConDatos?.length ?? 0} proyecto
              {(proyectosConDatos?.length ?? 0) === 1 ? "" : "s"} terminado
              {(proyectosConDatos?.length ?? 0) === 1 ? "" : "s"} considerado
              {(proyectosConDatos?.length ?? 0) === 1 ? "" : "s"})
            </h2>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">Material</th>
                    <th className="px-4 py-3">Base</th>
                    <th className="px-4 py-3">Cantidad prom.</th>
                    <th className="px-4 py-3">Costo prom.</th>
                    <th className="px-4 py-3">Ratio cantidad</th>
                    <th className="px-4 py-3">Ratio costo</th>
                    <th className="px-4 py-3">N° proyectos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {ratios.map((r) => (
                    <tr key={r.material} className="bg-white dark:bg-zinc-950">
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                        {r.material}
                        {!r.enCatalogo && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            no catalogado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {escalaPorLabels[r.escalaPor]}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {r.cantidadTotal != null
                          ? `${numberFormatter.format(r.cantidadTotal)} ${r.unidad ?? ""}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {currencyFormatter.format(r.montoTotal)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {r.escalaPor === "m2"
                          ? r.ratioCantidadPorM2 != null
                            ? `${numberFormatter.format(r.ratioCantidadPorM2)} ${r.unidad ?? ""}/m²`
                            : "—"
                          : esEscalaBanos(r.escalaPor)
                            ? r.ratioCantidadPorBano != null
                              ? `${numberFormatter.format(r.ratioCantidadPorBano)} ${r.unidad ?? ""}/baño`
                              : "—"
                            : "valor fijo"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {r.escalaPor === "m2"
                          ? `${currencyFormatter.format(r.ratioCostoPorM2)}/m²`
                          : esEscalaBanos(r.escalaPor)
                            ? `${currencyFormatter.format(r.ratioCostoPorBano)}/baño`
                            : "valor fijo"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {r.proyectosConsiderados}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Estimación para un proyecto nuevo
            </h2>
            <Estimacion ratios={ratios} />
          </section>
        </>
      )}
    </div>
  );
}
