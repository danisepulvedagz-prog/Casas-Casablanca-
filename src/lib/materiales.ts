import type { Database } from "@/lib/supabase/types";

export type CatalogoMaterial = Pick<
  Database["public"]["Tables"]["catalogo_materiales"]["Row"],
  "etapa_id" | "material" | "unidad_default"
>;

/**
 * Materiales del catálogo disponibles para una etapa (con "Otros" siempre
 * agregado como opción genérica). Se usa en cualquier campo de material con
 * autocompletado — el mismo cálculo, filtrado según la etapa elegida en ese
 * momento.
 */
export function materialesParaEtapa(materiales: CatalogoMaterial[], etapaId: string): CatalogoMaterial[] {
  const lista = etapaId ? materiales.filter((m) => String(m.etapa_id) === etapaId) : materiales;
  const vistos = new Set<string>();
  const dedup = lista.filter((m) => {
    const key = m.material.trim().toLowerCase();
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
  if (vistos.has("otros")) return dedup;
  return [...dedup, { etapa_id: etapaId ? Number(etapaId) : null, material: "Otros", unidad_default: "" }];
}
