import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateMaterial } from "@/app/catalogo-materiales/[etapaId]/actions";
import { MaterialForm } from "@/app/catalogo-materiales/[etapaId]/material-form";
import { LINK_MUTED } from "@/lib/ui";

export default async function EditarMaterialPage({
  params,
}: {
  params: Promise<{ etapaId: string; materialId: string }>;
}) {
  const { etapaId, materialId } = await params;
  const id = Number(etapaId);
  const matId = Number(materialId);
  const supabase = await createClient();

  const [{ data: etapa }, { data: material }] = await Promise.all([
    supabase.from("catalogo_etapas").select("*").eq("id", id).single(),
    supabase.from("catalogo_materiales").select("*").eq("id", matId).eq("etapa_id", id).single(),
  ]);

  if (!etapa || !material) notFound();

  const action = updateMaterial.bind(null, id, matId);

  return (
    <div className="mx-auto w-full max-w-md px-6 py-10">
      <div className="mb-2">
        <Link href={`/catalogo-materiales/${id}`} className={LINK_MUTED}>
          ← {etapa.orden}. {etapa.nombre}
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Editar material
      </h1>
      <MaterialForm action={action} material={material} />
    </div>
  );
}
