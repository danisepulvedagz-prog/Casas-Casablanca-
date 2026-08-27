import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type CatalogoEtapa = Database["public"]["Tables"]["catalogo_etapas"]["Row"];

function TablaEtapas({
  etapas,
  countPorEtapa,
}: {
  etapas: CatalogoEtapa[];
  countPorEtapa: Map<number, number>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">Etapa</th>
            <th className="px-4 py-3">Materiales</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {etapas.map((etapa) => (
            <tr key={etapa.id} className="bg-white dark:bg-zinc-950">
              <td className="px-4 py-3 text-zinc-500">{etapa.orden}</td>
              <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                {etapa.nombre}
              </td>
              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                {countPorEtapa.get(etapa.id) ?? 0}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/catalogo-materiales/${etapa.id}`}
                  className="text-sm text-zinc-600 hover:text-brand hover:underline dark:text-zinc-400"
                >
                  Ver materiales
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CatalogoMaterialesPage() {
  const supabase = await createClient();

  const [{ data: etapas }, { data: materiales }] = await Promise.all([
    supabase.from("catalogo_etapas").select("*").order("orden"),
    supabase.from("catalogo_materiales").select("etapa_id"),
  ]);

  const countPorEtapa = new Map<number, number>();
  for (const m of materiales ?? []) {
    if (m.etapa_id == null) continue;
    countPorEtapa.set(m.etapa_id, (countPorEtapa.get(m.etapa_id) ?? 0) + 1);
  }

  const obraGruesa = (etapas ?? []).filter((e) => e.modalidad === "Obra Gruesa Habitable");
  const llaveEnMano = (etapas ?? []).filter((e) => e.modalidad === "Llave en Mano");

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Catálogo de materiales
      </h1>
      <p className="mb-8 text-sm text-zinc-500">
        Materiales típicos por etapa, usados para sugerir el formulario de gastos y para la
        calculadora de m². Elige una etapa para ver, agregar, editar o eliminar sus materiales.
      </p>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Obra Gruesa Habitable
        </h2>
        <TablaEtapas etapas={obraGruesa} countPorEtapa={countPorEtapa} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Llave en Mano
        </h2>
        <TablaEtapas etapas={llaveEnMano} countPorEtapa={countPorEtapa} />
      </section>
    </div>
  );
}
