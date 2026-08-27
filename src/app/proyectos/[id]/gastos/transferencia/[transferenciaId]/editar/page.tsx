import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateTransferenciaConGastos } from "@/app/proyectos/[id]/gastos/actions";
import { TransferenciaForm } from "@/app/proyectos/[id]/gastos/transferencia-form";
import { construirEtapasPorProyecto } from "@/lib/etapas";
import { crearUrlFirmada } from "@/lib/storage";

export default async function EditarTransferenciaPage({
  params,
}: {
  params: Promise<{ id: string; transferenciaId: string }>;
}) {
  const { id, transferenciaId } = await params;
  const supabase = await createClient();

  const [
    { data: proyecto },
    { data: transferencia },
    { data: gastos },
    { data: proyectos },
    { data: catalogoEtapas },
    { data: proyectoEtapas },
    { data: materiales },
  ] = await Promise.all([
    supabase.from("proyectos").select("id, nombre").eq("id", id).single(),
    supabase.from("transferencias").select("*").eq("id", transferenciaId).single(),
    supabase.from("gastos").select("*").eq("transferencia_id", transferenciaId).order("created_at"),
    supabase.from("proyectos").select("id, nombre, modalidad").order("nombre"),
    supabase.from("catalogo_etapas").select("*").order("orden"),
    supabase.from("proyecto_etapas").select("proyecto_id, etapa_id"),
    supabase.from("catalogo_materiales").select("etapa_id, material, unidad_default").order("material"),
  ]);

  if (!proyecto || !transferencia) notFound();

  const fotoUrlFirmada = await crearUrlFirmada(transferencia.foto_url);
  const action = updateTransferenciaConGastos.bind(null, id, transferenciaId);
  const etapasPorProyecto = construirEtapasPorProyecto(proyectos ?? [], catalogoEtapas ?? [], proyectoEtapas ?? []);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-2">
        <Link href={`/proyectos/${id}/gastos`} className="text-sm text-zinc-500 hover:text-brand hover:underline">
          ← Gastos de {proyecto.nombre}
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Editar transferencia</h1>
      <TransferenciaForm
        action={action}
        transferencia={transferencia}
        fotoUrlFirmada={fotoUrlFirmada}
        gastos={gastos ?? []}
        proyectoId={id}
        proyectos={proyectos ?? []}
        etapasPorProyecto={etapasPorProyecto}
        materiales={materiales ?? []}
      />
    </div>
  );
}
