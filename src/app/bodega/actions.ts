"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { iniciarEtapasPorPrimeraCompra } from "@/app/proyectos/[id]/gastos/actions";
import { calcularStockBodega } from "@/lib/bodega";

export interface ActionState {
  error?: string;
}

export async function obtenerBodegaId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data } = await supabase.from("proyectos").select("id").eq("modalidad", "Bodega").single();
  return data?.id ?? null;
}

/**
 * Despachar = mover material de Bodega a un proyecto real: resta del stock
 * (vía el registro en bodega_despachos) y crea un gasto normal en el
 * proyecto destino, con su etapa — desde ahí en adelante ese gasto se
 * comporta exactamente igual que cualquier otro (alertas, checklist,
 * auto-inicio de etapa, presupuesto).
 */
export async function despacharBodega(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const material = String(formData.get("material") ?? "").trim();
  const cantidad = Number(formData.get("cantidad") ?? "");
  const unidad = String(formData.get("unidad") ?? "").trim() || null;
  const costoUnitario = Number(formData.get("costo_unitario") ?? "0");
  const proyectoDestinoId = String(formData.get("proyecto_destino_id") ?? "");
  const etapaRaw = String(formData.get("etapa_id") ?? "");
  const etapaId = etapaRaw ? Number(etapaRaw) : null;
  const fecha = String(formData.get("fecha") ?? "");
  const notas = String(formData.get("notas") ?? "").trim() || null;
  const registradoPor = String(formData.get("registrado_por") ?? "").trim() || null;

  if (!material) return { error: "Falta el material." };
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: "La cantidad debe ser mayor a 0." };
  if (!Number.isFinite(costoUnitario) || costoUnitario < 0) return { error: "Costo unitario inválido." };
  if (!proyectoDestinoId) return { error: "Elige el proyecto destino." };
  if (!fecha) return { error: "La fecha es obligatoria." };

  const supabase = await createClient();
  const bodegaId = await obtenerBodegaId(supabase);
  if (!bodegaId) return { error: "No se encontró el proyecto Bodega." };

  // Revalida el stock disponible justo antes de guardar (por si cambió
  // entremedio, ej. otra persona despachó lo mismo recién).
  const [{ data: gastosBodega }, { data: despachosPrevios }] = await Promise.all([
    supabase.from("gastos").select("*").eq("proyecto_id", bodegaId).eq("categoria", "Material"),
    supabase.from("bodega_despachos").select("*"),
  ]);
  const stock = calcularStockBodega(gastosBodega ?? [], despachosPrevios ?? []);
  const disponible = stock.find((s) => s.material.trim().toLowerCase() === material.toLowerCase())?.cantidadDisponible ?? 0;
  if (cantidad > disponible) {
    return { error: `Solo quedan ${disponible} ${unidad ?? ""} de "${material}" en Bodega.` };
  }

  const { data: gastoCreado, error: gastoError } = await supabase
    .from("gastos")
    .insert({
      proyecto_id: proyectoDestinoId,
      etapa_id: etapaId,
      categoria: "Material",
      material,
      cantidad,
      unidad,
      costo_unitario: costoUnitario,
      monto_total: cantidad * costoUnitario,
      fecha,
      registrado_por: registradoPor,
      notas: "Despacho desde Bodega." + (notas ? ` ${notas}` : ""),
    })
    .select("id")
    .single();

  if (gastoError || !gastoCreado) {
    return {
      error: `No se pudo registrar el gasto en el proyecto destino: ${gastoError?.message ?? "error desconocido"}`,
    };
  }

  const { error: despachoError } = await supabase.from("bodega_despachos").insert({
    material,
    cantidad,
    unidad,
    costo_unitario: costoUnitario,
    proyecto_destino_id: proyectoDestinoId,
    gasto_generado_id: gastoCreado.id,
    fecha,
    registrado_por: registradoPor,
    notas,
  });

  if (despachoError) {
    return {
      error: `El gasto se creó en el proyecto pero no se pudo dejar el registro del despacho: ${despachoError.message}`,
    };
  }

  await iniciarEtapasPorPrimeraCompra(supabase, [
    { proyecto_id: proyectoDestinoId, etapa_id: etapaId, categoria: "Material", fecha },
  ]);

  revalidatePath("/bodega");
  revalidatePath(`/proyectos/${proyectoDestinoId}/gastos`);
  redirect("/bodega?despachado=1");
}
