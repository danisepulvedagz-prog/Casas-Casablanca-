"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { iniciarEtapasPorPrimeraCompra } from "@/app/proyectos/[id]/gastos/actions";
import { calcularStockBodega, tomarDeLotesFIFO } from "@/lib/bodega";
import { sugerirMaterialCatalogo, type SugerenciaMaterial } from "@/lib/ai/extraer-gasto";
import { esOtros } from "@/lib/materiales";

export interface ActionState {
  error?: string;
}

export async function obtenerBodegaId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data } = await supabase.from("proyectos").select("id").eq("modalidad", "Bodega").single();
  return data?.id ?? null;
}

/**
 * Despachar = mover material de Bodega a un proyecto real. Consume el stock
 * lote por lote (FIFO, de la compra más antigua a la más nueva); por cada
 * lote que toca:
 *  - resta la cantidad despachada de ESE gasto de compra en Bodega (lo borra
 *    si queda en 0) — nunca se deja la compra intacta, porque dejaría el
 *    monto duplicado bajo la misma factura (una vez en Bodega, otra en el
 *    proyecto destino) en vez de repartido.
 *  - crea un gasto normal en el proyecto destino enlazado a la MISMA factura
 *    o transferencia de esa compra, así el respaldo real (foto, proveedor)
 *    queda disponible ahí, igual que si esa boleta se hubiera repartido
 *    entre proyectos desde el principio.
 * Si la cantidad pedida cruza más de un lote, se repite esto por cada uno.
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
  const { data: gastosBodega } = await supabase
    .from("gastos")
    .select("*")
    .eq("proyecto_id", bodegaId)
    .eq("categoria", "Material");
  const stock = calcularStockBodega(gastosBodega ?? []);
  const stockMaterial = stock.find((s) => s.material.trim().toLowerCase() === materialOrigen.toLowerCase());
  const disponible = stockMaterial?.cantidadDisponible ?? 0;
  if (cantidad > disponible) {
    return { error: `Solo quedan ${disponible} ${unidad ?? ""} de "${materialOrigen}" en Bodega.` };
  }

  const tomas = tomarDeLotesFIFO(stockMaterial!.lotes, cantidad);

  // Si quedó como "Otros" (la IA no encontró con qué calzarlo, o se dejó
  // así a mano), se deja el nombre tal como estaba en Bodega en las notas —
  // mismo criterio que cualquier "Otros": sin eso no hay forma de saber
  // después a qué corresponde.
  const notaNombreOriginal = esOtros(materialDestino) ? ` Nombre en la boleta: "${materialOrigen}".` : "";
  const notasFinal = "Despacho desde Bodega." + notaNombreOriginal + (notas ? ` ${notas}` : "");

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
        notas: notasFinal,
      })
      .select("id")
      .single();

    if (gastoError || !gastoCreado) {
      return {
        error: `No se pudo registrar el gasto en el proyecto destino: ${gastoError?.message ?? "error desconocido"}`,
      };
    }

    // El registro de auditoría se guarda ANTES de tocar la compra de origen
    // (todavía existe, así que la referencia es válida) — después, si la
    // compra se agota y se borra, esta fila queda con gasto_origen_id en
    // null automáticamente (el resto de sus datos ya quedan copiados acá).
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

    const cantidadRestanteLote = lote.cantidadRestante - cantidadLote;
    if (cantidadRestanteLote > 0) {
      const { error: reduceError } = await supabase
        .from("gastos")
        .update({ cantidad: cantidadRestanteLote, monto_total: cantidadRestanteLote * lote.costoUnitario })
        .eq("id", lote.gastoId);
      if (reduceError) {
        return {
          error: `El gasto se creó en el proyecto pero no se pudo descontar de la compra en Bodega: ${reduceError.message}`,
        };
      }
    } else {
      // Se despachó todo lo que quedaba de esa compra — no tiene sentido
      // dejar una fila en $0 en Bodega (además rompería la validación de
      // "monto mayor a 0" al editar esa factura más adelante).
      const { error: deleteError } = await supabase.from("gastos").delete().eq("id", lote.gastoId);
      if (deleteError) {
        return {
          error: `El gasto se creó en el proyecto pero no se pudo cerrar la compra en Bodega: ${deleteError.message}`,
        };
      }
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

/**
 * Deshace un despacho por completo: borra el gasto que había quedado en el
 * proyecto destino, borra el registro del despacho, y devuelve la cantidad
 * a Bodega — sumándola a la compra de origen si todavía existe (quedó con
 * menos, pero no se agotó), o recreándola si esa compra ya se había agotado
 * y borrado (en ese caso la factura/transferencia de respaldo se recupera
 * del propio gasto que se está por borrar, que quedó con la misma).
 */
export async function eliminarDespacho(despachoId: string) {
  const supabase = await createClient();
  const bodegaId = await obtenerBodegaId(supabase);
  if (!bodegaId) throw new Error("No se encontró el proyecto Bodega.");

  const { data: despacho, error: despachoFetchError } = await supabase
    .from("bodega_despachos")
    .select("*")
    .eq("id", despachoId)
    .single();
  if (despachoFetchError || !despacho) {
    throw new Error(`No se encontró el despacho: ${despachoFetchError?.message ?? "error desconocido"}`);
  }

  const { data: gastoDestino, error: gastoDestinoError } = await supabase
    .from("gastos")
    .select("factura_id, transferencia_id")
    .eq("id", despacho.gasto_generado_id)
    .single();
  if (gastoDestinoError || !gastoDestino) {
    throw new Error(`No se encontró el gasto del proyecto destino: ${gastoDestinoError?.message ?? "error desconocido"}`);
  }

  // Se borra el registro del despacho ANTES que el gasto destino: la fila
  // apunta a ambos (gasto_generado_id y gasto_origen_id) y no se puede
  // borrar un gasto mientras un despacho todavía lo referencia.
  const { error: deleteDespachoError } = await supabase.from("bodega_despachos").delete().eq("id", despachoId);
  if (deleteDespachoError) {
    throw new Error(`No se pudo eliminar el despacho: ${deleteDespachoError.message}`);
  }

  const { error: deleteGastoError } = await supabase.from("gastos").delete().eq("id", despacho.gasto_generado_id);
  if (deleteGastoError) {
    throw new Error(`No se pudo eliminar el gasto del proyecto destino: ${deleteGastoError.message}`);
  }

  if (despacho.gasto_origen_id) {
    const { data: loteOrigen } = await supabase
      .from("gastos")
      .select("cantidad")
      .eq("id", despacho.gasto_origen_id)
      .maybeSingle();
    if (loteOrigen) {
      const nuevaCantidad = (loteOrigen.cantidad ?? 0) + despacho.cantidad;
      const { error: restoreError } = await supabase
        .from("gastos")
        .update({ cantidad: nuevaCantidad, monto_total: nuevaCantidad * despacho.costo_unitario })
        .eq("id", despacho.gasto_origen_id);
      if (restoreError) throw new Error(`No se pudo devolver la cantidad a Bodega: ${restoreError.message}`);
      revalidatePath("/bodega");
      revalidatePath(`/proyectos/${despacho.proyecto_destino_id}/gastos`);
      return;
    }
  }

  // La compra de origen ya no existe (se había agotado con este despacho) —
  // se recrea con los datos que quedaron copiados en el propio despacho,
  // usando la factura/transferencia que el gasto destino tenía (la misma).
  const { error: recreateError } = await supabase.from("gastos").insert({
    proyecto_id: bodegaId,
    etapa_id: null,
    factura_id: gastoDestino.factura_id,
    transferencia_id: gastoDestino.transferencia_id,
    categoria: "Material",
    material: despacho.material,
    cantidad: despacho.cantidad,
    unidad: despacho.unidad,
    costo_unitario: despacho.costo_unitario,
    monto_total: despacho.cantidad * despacho.costo_unitario,
    fecha: despacho.fecha,
    registrado_por: despacho.registrado_por,
  });
  if (recreateError) {
    throw new Error(`No se pudo recrear la compra en Bodega: ${recreateError.message}`);
  }

  revalidatePath("/bodega");
  revalidatePath(`/proyectos/${despacho.proyecto_destino_id}/gastos`);
}
