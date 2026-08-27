"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EstadoEtapa } from "@/lib/supabase/types";

export interface ActionState {
  error?: string;
}

const ESTADOS: EstadoEtapa[] = ["pendiente", "en_curso", "terminada"];

export async function updateProyectoEtapa(
  proyectoId: string,
  proyectoEtapaId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const estado = String(formData.get("estado") ?? "") as EstadoEtapa;
  const fecha_inicio_real = String(formData.get("fecha_inicio_real") ?? "") || null;
  const fecha_fin_real = String(formData.get("fecha_fin_real") ?? "") || null;

  if (!ESTADOS.includes(estado)) return { error: "Estado inválido." };
  if (estado === "terminada" && !fecha_fin_real) {
    return { error: "Si la etapa está terminada, indica su fecha de fin real." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("proyecto_etapas")
    .update({ estado, fecha_inicio_real, fecha_fin_real })
    .eq("id", proyectoEtapaId);

  if (error) {
    return { error: `No se pudo actualizar la etapa: ${error.message}` };
  }

  revalidatePath(`/proyectos/${proyectoId}`);
  redirect(`/proyectos/${proyectoId}`);
}
