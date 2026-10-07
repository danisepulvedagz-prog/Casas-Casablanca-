"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { iniciarEtapasPorPrimeraCompra } from "@/app/proyectos/[id]/gastos/actions";
import { calcularStockBodega, tomarDeLotesFIFO } from "@/lib/bodega";
import { sugerirMaterialCatalogo, type SugerenciaMaterial } from "@/lib/ai/extraer-gasto";

export interface ActionState {
  error?: string;
}

export async function obtenerBodegaId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data } = await supabase.from("proyectos").select("id").eq("modalidad", "Bodega").single();
  return data?.id ?? null;
}

/**
 * Despachar = mover material de Bodega a un proyecto real. Consume el stock
 * lote por lote (FIFO, de la compra más antigua a la más nueva) y por cada
 * lote que toca crea un gasto normal en el proyecto destino enlazado a la
 * MISMA factura o transferencia de esa compra — así el respaldo real (foto,
 * proveedor) queda disponible en el proyecto destino, igual que si esa
 * boleta se hubiera repartido entre proyectos desde el principio. Si la
 * cantidad pedida cruza más de un lote, se crea un gasto por cada uno.
 */
export async function despacharBodega(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  // material_origen identifica qué lote de Bodega se consume (el nombre tal
  // como se compró); material_destino es con el nombre que queda el gasto en
  // el proyecto destino — puede ser el mismo, o uno que la IA hizo calzar con
  // el catálogo (o "Otros" si no encontró con qué).
  const materialOrigen = String(formData.get("material_origen") ?? "").trim();
  const materialDestino = String(formData.get("material_destino") ?? "").trim() || materialOrigen;
  const cantidad = Number(formData.get("cantidad") ?? "");
  const unidad = String(formData.get("unidad") ?? "").trim() || null;
  const proyectoDestinoId = String(formData.get("proyecto_destino_id") ?? "");
  const etapaRaw = String(formData.get("etapa_id") ?? "");
  const etapaId = etapaRaw ? Number(etapaRaw) : null;
  const fecha = String(formData.get("fecha") ?? "");
  const notas = String(formData.get("notas") ?? "").trim() || null;
  const registradoPor = String(formData.get("registrado_por") ?? "").trim() || null;

  if (!materialOrigen) return { error: "Falta el material." };
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: "La cantidad debe ser mayor a 0." };
  if (!proyectoDestinoId) return { error: "Elige el proyecto destino." };
  if (!fecha) return { error: "La fecha es obligatoria." };

  const supabase = await createClient();
  const bodegaId = await obtenerBodegaId(supabase);
  if (!bodegaId) return { error: "No se encontró el proyecto Bodega." };

  // Revalida el stock (y los lotes) justo antes de guardar, por si cambió
  // entremedio — ej. otra persona despachó lo mismo recién.
  const [{ data: gastosBodega }, { data: despachosPrevios }] = await Promise.all([
    supabase.from("gastos").select("*").eq("proyecto_id", bodegaId).eq("categoria", "Material"),
    supabase.from("bodega_despachos").select("*"),
  ]);
  const stock = calcularStockBodega(gastosBodega ?? [], despachosPrevios ?? []);
  const stockMaterial = stock.find((s) => s.material.trim().toLowerCase() === materialOrigen.toLowerCase());
  const disponible = stockMaterial?.cantidadDisponible ?? 0;
  if (cantidad > disponible) {
    return { error: `Solo quedan ${disponible} ${unidad ?? ""} de "${materialOrigen}" en Bodega.` };
  }

  const tomas = tomarDeLotesFIFO(stockMaterial!.lotes, cantidad);

  for (const { lote, cantidad: cantidadLote } of tomas) {
    const montoLote = cantidadLote * lote.costoUnitario;

    const { data: gastoCreado, error: gastoError } = await supabase
      .from("gastos")
      .insert({
        proyecto_id: proyectoDestinoId,
        etapa_id: etapaId,
        factura_id: lote.facturaId,
        transferencia_id: lote.transferenciaId,
        categoria: "Material",
        material: materialDestino,
        cantidad: cantidadLote,
        unidad,
        costo_unitario: lote.costoUnitario,
        monto_total: montoLote,
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
      material: materialOrigen,
      cantidad: cantidadLote,
      unidad,
      costo_unitario: lote.costoUnitario,
      proyecto_destino_id: proyectoDestinoId,
      gasto_generado_id: gastoCreado.id,
      gasto_origen_id: lote.gastoId,
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
  }

  revalidatePath("/bodega");
  revalidatePath(`/proyectos/${proyectoDestinoId}/gastos`);
  redirect("/bodega?despachado=1");
}

/**
 * Le pide a la IA que compare un material de Bodega (que quedó con el
 * nombre de la boleta porque no calzó con el catálogo al comprarlo) contra
 * el catálogo completo, para sugerir a cuál corresponde — se usa como botón
 * aparte en el formulario de despacho (no automático, porque es una llamada
 * real a la IA con costo y demora de 1-2 segundos).
 */
export async function sugerirMaterialDespacho(material: string): Promise<SugerenciaMaterial | null> {
  if (!material.trim()) return null;
  const supabase = await createClient();
  const { data: catalogoMaterialesRaw } = await supabase
    .from("catalogo_materiales")
    .select("material, unidad_default, etapa_id");

  const catalogoMateriales = (catalogoMaterialesRaw ?? [])
    .filter((m): m is typeof m & { etapa_id: number } => m.etapa_id != null)
    .map((m) => ({ material: m.material, unidad: m.unidad_default, etapaId: m.etapa_id }));

  try {
    return await sugerirMaterialCatalogo(material, catalogoMateriales);
  } catch {
    return null;
  }
}
