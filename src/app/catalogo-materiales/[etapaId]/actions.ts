"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EscalaPor } from "@/lib/supabase/types";

export interface ActionState {
  error?: string;
}

const ESCALAS_POR_VALIDAS: EscalaPor[] = ["m2", "banos", "fijo"];

function parseMaterialForm(formData: FormData) {
  const material = String(formData.get("material") ?? "").trim();
  const unidad_default = String(formData.get("unidad_default") ?? "").trim();
  const escalaPorRaw = String(formData.get("escala_por") ?? "");

  if (!material) return { error: "El nombre del material es obligatorio." } as const;
  if (!unidad_default) return { error: "La unidad es obligatoria." } as const;
  if (!ESCALAS_POR_VALIDAS.includes(escalaPorRaw as EscalaPor)) {
    return { error: "Selecciona una base de escala válida." } as const;
  }

  const escala_por = escalaPorRaw as EscalaPor;
  return { values: { material, unidad_default, escala_por } } as const;
}

export async function createMaterial(
  etapaId: number,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parseMaterialForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("catalogo_materiales")
    .insert({ etapa_id: etapaId, ...parsed.values });

  if (error) {
    return { error: `No se pudo agregar el material: ${error.message}` };
  }

  revalidatePath(`/catalogo-materiales/${etapaId}`);
  redirect(`/catalogo-materiales/${etapaId}`);
}

export async function updateMaterial(
  etapaId: number,
  materialId: number,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parseMaterialForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("catalogo_materiales")
    .update(parsed.values)
    .eq("id", materialId);

  if (error) {
    return { error: `No se pudo actualizar el material: ${error.message}` };
  }

  revalidatePath(`/catalogo-materiales/${etapaId}`);
  redirect(`/catalogo-materiales/${etapaId}`);
}

export async function deleteMaterial(etapaId: number, materialId: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_materiales").delete().eq("id", materialId);
  if (error) {
    throw new Error(`No se pudo eliminar el material: ${error.message}`);
  }
  revalidatePath(`/catalogo-materiales/${etapaId}`);
}
