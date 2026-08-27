import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GastoWizard } from "@/app/proyectos/[id]/gastos/nuevo/gasto-wizard";
import { construirEtapasPorProyecto, modalidadesIncluidas } from "@/lib/etapas";

export default async function NuevoGastoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ etapa?: string; material?: string }>;
}) {
  const { id } = await params;
  const { etapa, material } = await searchParams;
  const supabase = await createClient();

  const { data: proyecto } = await supabase
    .from("proyectos")
    .select("id, nombre, modalidad")
    .eq("id", id)
    .single();

  if (!proyecto) notFound();

  const [
    { data: catalogoEtapas },
    { data: proyectoEtapas },
    { data: materialesRows },
    { data: todosLosProyectos },
    { data: catalogoEtapasCompleto },
    { data: proyectoEtapasTodas },
  ] = await Promise.all([
    supabase
      .from("catalogo_etapas")
      .select("*")
      .in("modalidad", modalidadesIncluidas(proyecto.modalidad))
      .order("orden"),
    supabase.from("proyecto_etapas").select("etapa_id").eq("proyecto_id", id),
    supabase.from("catalogo_materiales").select("etapa_id, material, unidad_default").order("material"),
    supabase.from("proyectos").select("id, nombre, modalidad").order("nombre"),
    supabase.from("catalogo_etapas").select("*").order("orden"),
    supabase.from("proyecto_etapas").select("proyecto_id, etapa_id"),
  ]);

  // Solo las etapas que el proyecto realmente tiene (ej. si no tiene deck, esa
  // etapa no aparece como opción acá).
  const etapaIdsProyecto = new Set((proyectoEtapas ?? []).map((pe) => pe.etapa_id));
  const etapas = (catalogoEtapas ?? []).filter((e) => etapaIdsProyecto.has(e.id));

  // Para cuando una factura se reparte entre varios proyectos: las etapas
  // disponibles de cada uno (pueden ser distintas entre sí).
  const etapasPorProyecto = construirEtapasPorProyecto(
    todosLosProyectos ?? [],
    catalogoEtapasCompleto ?? [],
    proyectoEtapasTodas ?? []
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-2">
        <Link href={`/proyectos/${id}/gastos`} className="text-sm text-zinc-500 hover:text-brand hover:underline">
          ← Gastos de {proyecto.nombre}
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Agregar gasto</h1>
      <GastoWizard
        proyectoId={id}
        etapas={etapas}
        materiales={materialesRows ?? []}
        proyectos={todosLosProyectos ?? []}
        etapasPorProyecto={etapasPorProyecto}
        etapaIdInicial={etapa ? Number(etapa) : undefined}
        materialInicial={material}
      />
    </div>
  );
}
