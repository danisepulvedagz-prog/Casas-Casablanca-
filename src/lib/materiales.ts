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

export function esOtros(material: string): boolean {
  return material.trim().toLowerCase() === "otros";
}

/**
 * "Otros" (ej. un producto que la IA no pudo relacionar con el catálogo al
 * leer una boleta) necesita que la persona elija a mano a qué etapa
 * pertenece — mientras esa etapa siga sin elegirse, el ítem se marca como
 * pendiente (ver SELECT_ETAPA_FALTANTE en lib/ui.ts para el estilo).
 */
export function necesitaElegirEtapa(material: string, etapaId: string): boolean {
  return esOtros(material) && !etapaId;
}

/**
 * Al cambiar la etapa de un ítem, el material se limpia SOLO si ya no es
 * válido para la nueva etapa (ej. era un material específico de otra etapa
 * del catálogo). "Otros" es una opción válida en cualquier etapa, así que un
 * ítem marcado así conserva su valor al elegir la etapa que le faltaba — la
 * persona no tiene que volver a escribirlo, solo elegir la etapa.
 */
export function cambiosAlCambiarEtapa(
  materiales: CatalogoMaterial[],
  material: string,
  nuevaEtapaId: string
): { material?: string; unidad?: string } {
  const materialesNuevaEtapa = materialesParaEtapa(materiales, nuevaEtapaId);
  const materialSigueValido = materialesNuevaEtapa.some(
    (m) => m.material.trim().toLowerCase() === material.trim().toLowerCase()
  );
  return materialSigueValido ? {} : { material: "", unidad: "" };
}

/**
 * Bloquea el guardado mientras queden ítems "Otros" sin etapa elegida — debe
 * llamarse ANTES de armar el FormData y disparar la acción de servidor, para
 * que si falla no se pierda nada de lo ya editado.
 */
export function validarEtapasOtros(items: { material: string; etapaId: string }[]): string | null {
  const faltantes = items.filter((it) => necesitaElegirEtapa(it.material, it.etapaId));
  if (faltantes.length === 0) return null;
  return faltantes.length === 1
    ? 'Falta elegir la etapa del material marcado como "Otros" (recuadro en rojo) antes de guardar.'
    : `Falta elegir la etapa de ${faltantes.length} materiales marcados como "Otros" (recuadros en rojo) antes de guardar.`;
}
