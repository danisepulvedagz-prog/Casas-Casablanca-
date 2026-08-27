import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { modalidadesIncluidas } from "@/lib/etapas";
import { currencyFormatter } from "@/lib/format";
import { LINK_MUTED } from "@/lib/ui";
import type { Database } from "@/lib/supabase/types";

type CatalogoMaterial = Database["public"]["Tables"]["catalogo_materiales"]["Row"];

function claveMaterial(etapaId: number | null, material: string) {
  return `${etapaId ?? "sin-etapa"}::${material.trim().toLowerCase()}`;
}

export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proyecto } = await supabase
    .from("proyectos")
    .select("id, nombre, modalidad")
    .eq("id", id)
    .single();

  if (!proyecto) notFound();

  const catalogoEtapasPromise = supabase
    .from("catalogo_etapas")
    .select("*")
    .in("modalidad", modalidadesIncluidas(proyecto.modalidad))
    .order("orden");

  const [{ data: catalogoEtapas }, { data: proyectoEtapas }, { data: gastosMaterial }] = await Promise.all([
    catalogoEtapasPromise,
    supabase.from("proyecto_etapas").select("etapa_id").eq("proyecto_id", id),
    supabase.from("gastos").select("*").eq("proyecto_id", id).eq("categoria", "Material"),
  ]);

  // Solo las etapas que el proyecto realmente tiene (ej. si no tiene deck, esa
  // etapa no está en proyecto_etapas y no debe aparecer acá tampoco).
  const etapaIdsProyecto = new Set((proyectoEtapas ?? []).map((pe) => pe.etapa_id));
  const etapas = (catalogoEtapas ?? []).filter((e) => etapaIdsProyecto.has(e.id));

  const etapaIds = etapas.map((e) => e.id);
  const { data: materiales } = await supabase
    .from("catalogo_materiales")
    .select("*")
    .in("etapa_id", etapaIds.length > 0 ? etapaIds : [-1])
    .order("material");

  // Suma monto/cantidad ya gastado por (etapa, material) para marcar el check y mostrar el detalle.
  const gastoPorClave = new Map<string, { monto: number; cantidad: number; unidad: string | null }>();
  for (const g of gastosMaterial ?? []) {
    if (!g.material) continue;
    const clave = claveMaterial(g.etapa_id, g.material);
    const actual = gastoPorClave.get(clave) ?? { monto: 0, cantidad: 0, unidad: g.unidad };
    actual.monto += g.monto_total;
    actual.cantidad += g.cantidad ?? 0;
    if (!actual.unidad) actual.unidad = g.unidad;
    gastoPorClave.set(clave, actual);
  }

  const materialesPorEtapa = new Map<number, CatalogoMaterial[]>();
  for (const m of materiales ?? []) {
    if (m.etapa_id == null) continue;
    const lista = materialesPorEtapa.get(m.etapa_id) ?? [];
    lista.push(m);
    materialesPorEtapa.set(m.etapa_id, lista);
  }

  const totalMateriales = materiales?.length ?? 0;
  const totalComprados = (materiales ?? []).filter((m) =>
    gastoPorClave.has(claveMaterial(m.etapa_id, m.material))
  ).length;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-2">
        <Link href={`/proyectos/${id}`} className={LINK_MUTED}>
          ← {proyecto.nombre}
        </Link>
      </div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Checklist de materiales
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {totalComprados} de {totalMateriales} materiales con al menos un gasto registrado. Se
            marca solo con lo que ya cargaste en Gastos — no hay que tildar nada a mano.
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        {(etapas ?? []).map((etapa) => {
          const materialesEtapa = materialesPorEtapa.get(etapa.id) ?? [];
          if (materialesEtapa.length === 0) return null;
          const compradosEtapa = materialesEtapa.filter((m) =>
            gastoPorClave.has(claveMaterial(m.etapa_id, m.material))
          ).length;

          return (
            <details key={etapa.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800">
              <summary className="cursor-pointer list-none px-4 py-3 select-none">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {etapa.orden}. {etapa.nombre}
                  </span>
                  <span className="text-sm text-zinc-500">
                    {compradosEtapa} / {materialesEtapa.length}
                  </span>
                </div>
              </summary>
              <div className="border-t border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {materialesEtapa.map((m) => {
                      const clave = claveMaterial(m.etapa_id, m.material);
                      const gasto = gastoPorClave.get(clave);
                      const comprado = !!gasto;
                      return (
                        <tr key={m.id} className="bg-white dark:bg-zinc-950">
                          <td className="w-8 px-4 py-2">
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                                comprado
                                  ? "bg-brand-tint text-brand-dark"
                                  : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                              }`}
                            >
                              {comprado ? "✓" : ""}
                            </span>
                          </td>
                          <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                            {m.material}
                          </td>
                          <td className="px-4 py-2 text-zinc-500">{m.unidad_default}</td>
                          <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                            {gasto
                              ? `${gasto.cantidad || "—"} ${gasto.unidad ?? ""} · ${currencyFormatter.format(gasto.monto)}`
                              : "Pendiente"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Link
                              href={`/proyectos/${id}/gastos/nuevo?etapa=${m.etapa_id}&material=${encodeURIComponent(m.material)}`}
                              className={LINK_MUTED}
                            >
                              {comprado ? "Agregar otro" : "Registrar gasto"}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
