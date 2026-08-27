import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GastoWizard } from "@/app/proyectos/[id]/gastos/nuevo/gasto-wizard";
import { construirEtapasPorProyecto, modalidadesIncluidas } from "@/lib/etapas";
import { BTN_SECONDARY } from "@/lib/ui";
import type { Database } from "@/lib/supabase/types";

type CatalogoEtapa = Database["public"]["Tables"]["catalogo_etapas"]["Row"];
type CatalogoMaterial = Pick<
  Database["public"]["Tables"]["catalogo_materiales"]["Row"],
  "etapa_id" | "material" | "unidad_default"
>;

export default async function NuevoGastoGlobalPage({
  searchParams,
}: {
  searchParams: Promise<{ proyecto?: string }>;
}) {
  const { proyecto: proyectoId } = await searchParams;
  const supabase = await createClient();

  const { data: proyectos } = await supabase
    .from("proyectos")
    .select("id, nombre, modalidad")
    .order("nombre");

  const proyectoSeleccionado = proyectoId
    ? (proyectos ?? []).find((p) => p.id === proyectoId)
    : undefined;

  let etapas: CatalogoEtapa[] = [];
  let materiales: CatalogoMaterial[] = [];
  let etapasPorProyecto: Record<string, CatalogoEtapa[]> = {};
  if (proyectoSeleccionado) {
    const [
      { data: catalogoEtapas },
      { data: proyectoEtapas },
      { data: materialesRows },
      { data: catalogoEtapasCompleto },
      { data: proyectoEtapasTodas },
    ] = await Promise.all([
      supabase
        .from("catalogo_etapas")
        .select("*")
        .in("modalidad", modalidadesIncluidas(proyectoSeleccionado.modalidad))
        .order("orden"),
      supabase.from("proyecto_etapas").select("etapa_id").eq("proyecto_id", proyectoSeleccionado.id),
      supabase.from("catalogo_materiales").select("etapa_id, material, unidad_default").order("material"),
      supabase.from("catalogo_etapas").select("*").order("orden"),
      supabase.from("proyecto_etapas").select("proyecto_id, etapa_id"),
    ]);
    // Solo las etapas que el proyecto realmente tiene (ej. si no tiene deck,
    // esa etapa no aparece como opción acá).
    const etapaIdsProyecto = new Set((proyectoEtapas ?? []).map((pe) => pe.etapa_id));
    etapas = (catalogoEtapas ?? []).filter((e) => etapaIdsProyecto.has(e.id));
    materiales = materialesRows ?? [];
    // Para cuando una factura se reparte entre varios proyectos: las etapas
    // disponibles de cada uno (pueden ser distintas entre sí).
    etapasPorProyecto = construirEtapasPorProyecto(
      proyectos ?? [],
      catalogoEtapasCompleto ?? [],
      proyectoEtapasTodas ?? []
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-2">
        <Link href="/proyectos" className="text-sm text-zinc-500 hover:text-brand hover:underline">
          ← Proyectos
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Agregar gasto</h1>

      <form method="GET" className="mb-8 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="proyecto">
            Proyecto
          </label>
          <select
            id="proyecto"
            name="proyecto"
            defaultValue={proyectoId ?? ""}
            className="w-72 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="" disabled>
              Selecciona un proyecto
            </option>
            {(proyectos ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={BTN_SECONDARY}>
          Continuar
        </button>
      </form>

      {(proyectos ?? []).length === 0 && (
        <p className="text-sm text-zinc-500">
          Todavía no hay proyectos. Crea uno primero desde la sección Proyectos.
        </p>
      )}

      {proyectoId && !proyectoSeleccionado && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Ese proyecto ya no está disponible.
        </p>
      )}

      {proyectoSeleccionado && (
        <GastoWizard
          proyectoId={proyectoSeleccionado.id}
          etapas={etapas}
          materiales={materiales}
          proyectos={proyectos ?? []}
          etapasPorProyecto={etapasPorProyecto}
        />
      )}
    </div>
  );
}
