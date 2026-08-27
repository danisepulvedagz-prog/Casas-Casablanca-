import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createMaterial } from "@/app/catalogo-materiales/[etapaId]/actions";
import { MaterialForm } from "@/app/catalogo-materiales/[etapaId]/material-form";
import { LINK_MUTED } from "@/lib/ui";

export default async function NuevoMaterialPage({
  params,
}: {
  params: Promise<{ etapaId: string }>;
}) {
  const { etapaId } = await params;
  const id = Number(etapaId);
  const supabase = await createClient();

  const { data: etapa } = await supabase.from("catalogo_etapas").select("*").eq("id", id).single();
  if (!etapa) notFound();

  const action = createMaterial.bind(null, id);

  return (
    <div className="mx-auto w-full max-w-md px-6 py-10">
      <div className="mb-2">
        <Link href={`/catalogo-materiales/${id}`} className={LINK_MUTED}>
          ← {etapa.orden}. {etapa.nombre}
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Agregar material
      </h1>
      <MaterialForm action={action} />
    </div>
  );
}
