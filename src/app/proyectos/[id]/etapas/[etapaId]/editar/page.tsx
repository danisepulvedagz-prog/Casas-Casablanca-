import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProyectoEtapa } from "@/app/proyectos/[id]/etapas/actions";
import { EtapaForm } from "@/app/proyectos/[id]/etapas/etapa-form";

export default async function EditarEtapaPage({
  params,
}: {
  params: Promise<{ id: string; etapaId: string }>;
}) {
  const { id, etapaId } = await params;
  const supabase = await createClient();

  const [{ data: proyecto }, { data: proyectoEtapa }] = await Promise.all([
    supabase.from("proyectos").select("id, nombre").eq("id", id).single(),
    supabase.from("proyecto_etapas").select("*").eq("id", etapaId).eq("proyecto_id", id).single(),
  ]);

  if (!proyecto || !proyectoEtapa) notFound();

  const { data: catalogoEtapa } = await supabase
    .from("catalogo_etapas")
    .select("nombre")
    .eq("id", proyectoEtapa.etapa_id)
    .single();

  const action = updateProyectoEtapa.bind(null, id, etapaId);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-2">
        <Link href={`/proyectos/${id}`} className="text-sm text-zinc-500 hover:text-brand hover:underline">
          ← {proyecto.nombre}
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Actualizar avance de etapa
      </h1>
      <EtapaForm
        action={action}
        proyectoEtapa={proyectoEtapa}
        etapaNombre={catalogoEtapa?.nombre ?? "Etapa"}
      />
    </div>
  );
}
