import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BTN_PRIMARY, LINK_MUTED } from "@/lib/ui";
import { escalaPorLabels } from "@/lib/format";
import { DeleteMaterialButton } from "@/app/catalogo-materiales/[etapaId]/delete-material-button";

export default async function MaterialesEtapaPage({
  params,
}: {
  params: Promise<{ etapaId: string }>;
}) {
  const { etapaId } = await params;
  const id = Number(etapaId);
  const supabase = await createClient();

  const { data: etapa } = await supabase.from("catalogo_etapas").select("*").eq("id", id).single();
  if (!etapa) notFound();

  const { data: materiales, error } = await supabase
    .from("catalogo_materiales")
    .select("*")
    .eq("etapa_id", id)
    .order("material");

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-2">
        <Link href="/catalogo-materiales" className={LINK_MUTED}>
          ← Catálogo de materiales
        </Link>
      </div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {etapa.orden}. {etapa.nombre}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">{etapa.modalidad}</p>
        </div>
        <Link href={`/catalogo-materiales/${id}/nuevo`} className={BTN_PRIMARY}>
          + Agregar material
        </Link>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          No se pudieron cargar los materiales: {error.message}
        </p>
      )}

      {!error && materiales && materiales.length === 0 && (
        <p className="text-sm text-zinc-500">Esta etapa todavía no tiene materiales cargados.</p>
      )}

      {!error && materiales && materiales.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3">Unidad</th>
                <th className="px-4 py-3">Escala por</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {materiales.map((m) => (
                <tr key={m.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {m.material}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{m.unidad_default}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {escalaPorLabels[m.escala_por]}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/catalogo-materiales/${id}/${m.id}/editar`} className={LINK_MUTED}>
                        Editar
                      </Link>
                      <DeleteMaterialButton etapaId={id} materialId={m.id} nombre={m.material} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
