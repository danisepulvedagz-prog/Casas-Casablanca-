"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { subirFotoGasto } from "@/lib/storage";
import { modalidadesIncluidas } from "@/lib/etapas";
import {
  extraerItemsFactura,
  extraerDatosTransferencia,
  type FacturaExtraida,
  type DatosTransferenciaExtraidos,
} from "@/lib/ai/extraer-gasto";
import type { CategoriaGasto, Database } from "@/lib/supabase/types";

type GastoInsert = Database["public"]["Tables"]["gastos"]["Insert"];

export interface ActionState {
  error?: string;
}

const CATEGORIAS: CategoriaGasto[] = ["Material", "Mano de Obra"];

function parseGastoForm(formData: FormData) {
  const categoria = String(formData.get("categoria") ?? "") as CategoriaGasto;
  const monto_total = Number(formData.get("monto_total"));
  const fecha = String(formData.get("fecha") ?? "");
  const etapaRaw = String(formData.get("etapa_id") ?? "");
  const etapa_id = etapaRaw ? Number(etapaRaw) : null;
  const material = String(formData.get("material") ?? "").trim() || null;
  const cantidadRaw = String(formData.get("cantidad") ?? "").trim();
  const cantidad = cantidadRaw ? Number(cantidadRaw) : null;
  const unidad = String(formData.get("unidad") ?? "").trim() || null;
  const proveedor = String(formData.get("proveedor") ?? "").trim() || null;
  const n_documento = String(formData.get("n_documento") ?? "").trim() || null;
  const registrado_por = String(formData.get("registrado_por") ?? "").trim() || null;
  const reembolso = formData.get("reembolso") === "on";
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!CATEGORIAS.includes(categoria)) return { error: "Selecciona una categoría válida." } as const;
  if (!Number.isFinite(monto_total) || monto_total <= 0) {
    return { error: "El monto total debe ser un número mayor a 0." } as const;
  }
  if (!fecha) return { error: "La fecha es obligatoria." } as const;
  if (etapaRaw && !Number.isFinite(etapa_id)) return { error: "Etapa inválida." } as const;
  if (cantidadRaw && (!Number.isFinite(cantidad) || (cantidad ?? 0) <= 0)) {
    return { error: "La cantidad debe ser un número mayor a 0." } as const;
  }

  const costo_unitario = cantidad && cantidad > 0 ? monto_total / cantidad : null;

  return {
    values: {
      categoria,
      monto_total,
      fecha,
      etapa_id,
      material,
      cantidad,
      unidad,
      costo_unitario,
      proveedor,
      n_documento,
      registrado_por,
      reembolso,
      notas,
    },
  } as const;
}

export async function updateGasto(
  proyectoId: string,
  gastoId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parseGastoForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  // Solo se reemplaza la foto si se subió una nueva; si no, se deja la que
  // ya tenía el gasto (no se pisa con null por editar otro campo).
  const foto = formData.get("foto");
  let fotoUpdate: { foto_boleta_url?: string } = {};
  if (foto instanceof File && foto.size > 0) {
    try {
      const path = await subirFotoGasto(foto, proyectoId);
      if (path) fotoUpdate = { foto_boleta_url: path };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "No se pudo subir la foto." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("gastos")
    .update({ ...parsed.values, ...fotoUpdate })
    .eq("id", gastoId);

  if (error) {
    return { error: `No se pudo actualizar el gasto: ${error.message}` };
  }

  revalidatePath(`/proyectos/${proyectoId}/gastos`);
  redirect(`/proyectos/${proyectoId}/gastos`);
}

// Una factura puede estar repartida entre varios proyectos (mismo documento,
// ítems con proyecto_id distintos) — borrar desde un proyecto solo debe
// quitar SUS ítems. La cabecera (facturas) recién se borra cuando ya no le
// queda ningún ítem en ningún proyecto.
export async function deleteFactura(proyectoId: string, facturaId: string) {
  const supabase = await createClient();
  const { error: gastosError } = await supabase
    .from("gastos")
    .delete()
    .eq("factura_id", facturaId)
    .eq("proyecto_id", proyectoId);
  if (gastosError) {
    throw new Error(`No se pudo eliminar los ítems: ${gastosError.message}`);
  }

  const { count } = await supabase
    .from("gastos")
    .select("id", { count: "exact", head: true })
    .eq("factura_id", facturaId);
  if (!count) {
    const { error: facturaError } = await supabase.from("facturas").delete().eq("id", facturaId);
    if (facturaError) {
      throw new Error(`No se pudo eliminar la factura: ${facturaError.message}`);
    }
  }

  revalidatePath(`/proyectos/${proyectoId}/gastos`);
}

/**
 * Edita la cabecera de la factura (proveedor, n° documento, fecha, monto
 * total, foto) — independiente de sus ítems/gastos. Como una factura puede
 * estar repartida entre varios proyectos, se revalida la página de gastos
 * de todos los proyectos que tienen algún ítem de esta factura, no solo el
 * actual.
 */
export async function updateFactura(
  proyectoId: string,
  facturaId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const proveedor = String(formData.get("proveedor") ?? "").trim() || null;
  const n_documento = String(formData.get("n_documento") ?? "").trim() || null;
  const fecha = String(formData.get("fecha") ?? "");
  const montoRaw = String(formData.get("monto_total") ?? "").trim();
  const monto_total = montoRaw ? Number(montoRaw) : null;

  if (!fecha) return { error: "La fecha es obligatoria." };
  if (montoRaw && (!Number.isFinite(monto_total) || (monto_total ?? 0) <= 0)) {
    return { error: "El monto total debe ser un número mayor a 0." };
  }

  const supabase = await createClient();

  const foto = formData.get("foto");
  let fotoUpdate: { foto_url?: string } = {};
  if (foto instanceof File && foto.size > 0) {
    try {
      const path = await subirFotoGasto(foto, proyectoId);
      if (path) fotoUpdate = { foto_url: path };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "No se pudo subir la foto." };
    }
  }

  const { error } = await supabase
    .from("facturas")
    .update({ proveedor, n_documento, fecha, monto_total, ...fotoUpdate })
    .eq("id", facturaId);

  if (error) {
    return { error: `No se pudo actualizar la factura: ${error.message}` };
  }

  const { data: gastosDeFactura } = await supabase
    .from("gastos")
    .select("proyecto_id")
    .eq("factura_id", facturaId);
  const proyectosAfectados = new Set((gastosDeFactura ?? []).map((g) => g.proyecto_id));
  proyectosAfectados.add(proyectoId);
  for (const pid of proyectosAfectados) {
    revalidatePath(`/proyectos/${pid}/gastos`);
  }
  redirect(`/proyectos/${proyectoId}/gastos`);
}

// Igual que deleteFactura: una transferencia de Material puede estar
// repartida entre varios proyectos, así que borrar desde uno solo debe
// quitar sus ítems — la cabecera recién se borra cuando ya no le queda
// ningún ítem en ningún proyecto.
export async function deleteTransferencia(proyectoId: string, transferenciaId: string) {
  const supabase = await createClient();
  const { error: gastosError } = await supabase
    .from("gastos")
    .delete()
    .eq("transferencia_id", transferenciaId)
    .eq("proyecto_id", proyectoId);
  if (gastosError) {
    throw new Error(`No se pudo eliminar los ítems: ${gastosError.message}`);
  }

  const { count } = await supabase
    .from("gastos")
    .select("id", { count: "exact", head: true })
    .eq("transferencia_id", transferenciaId);
  if (!count) {
    const { error: transferenciaError } = await supabase
      .from("transferencias")
      .delete()
      .eq("id", transferenciaId);
    if (transferenciaError) {
      throw new Error(`No se pudo eliminar la transferencia: ${transferenciaError.message}`);
    }
  }

  revalidatePath(`/proyectos/${proyectoId}/gastos`);
}

/**
 * Edita la cabecera de la transferencia (destinatario, n° operación, fecha,
 * monto total transferido, foto) — independiente de sus ítems/gastos. Igual
 * que updateFactura, revalida todos los proyectos que tienen algún ítem de
 * esta transferencia.
 */
export async function updateTransferencia(
  proyectoId: string,
  transferenciaId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const destinatario = String(formData.get("destinatario") ?? "").trim() || null;
  const n_operacion = String(formData.get("n_operacion") ?? "").trim() || null;
  const fecha = String(formData.get("fecha") ?? "");
  const montoRaw = String(formData.get("monto_total") ?? "").trim();
  const monto_total = montoRaw ? Number(montoRaw) : null;

  if (!fecha) return { error: "La fecha es obligatoria." };
  if (montoRaw && (!Number.isFinite(monto_total) || (monto_total ?? 0) <= 0)) {
    return { error: "El monto total debe ser un número mayor a 0." };
  }

  const supabase = await createClient();

  const foto = formData.get("foto");
  let fotoUpdate: { foto_url?: string } = {};
  if (foto instanceof File && foto.size > 0) {
    try {
      const path = await subirFotoGasto(foto, proyectoId);
      if (path) fotoUpdate = { foto_url: path };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "No se pudo subir la foto." };
    }
  }

  const { error } = await supabase
    .from("transferencias")
    .update({ destinatario, n_operacion, fecha, monto_total, ...fotoUpdate })
    .eq("id", transferenciaId);

  if (error) {
    return { error: `No se pudo actualizar la transferencia: ${error.message}` };
  }

  const { data: gastosDeTransferencia } = await supabase
    .from("gastos")
    .select("proyecto_id")
    .eq("transferencia_id", transferenciaId);
  const proyectosAfectados = new Set((gastosDeTransferencia ?? []).map((g) => g.proyecto_id));
  proyectosAfectados.add(proyectoId);
  for (const pid of proyectosAfectados) {
    revalidatePath(`/proyectos/${pid}/gastos`);
  }
  redirect(`/proyectos/${proyectoId}/gastos`);
}

export async function deleteGasto(proyectoId: string, gastoId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("gastos").delete().eq("id", gastoId);
  if (error) {
    throw new Error(`No se pudo eliminar el gasto: ${error.message}`);
  }
  revalidatePath(`/proyectos/${proyectoId}/gastos`);
}

// ---------------------------------------------------------------------
// Factura con varios ítems (Material, leída con IA)
// ---------------------------------------------------------------------

export type ExtraccionFactura = { data: FacturaExtraida } | { error: string };

/**
 * Lee una foto de factura/boleta con IA: identifica cada producto como un
 * ítem separado y sugiere a qué etapa pertenece cada uno (comparando contra
 * el catálogo real de etapas del proyecto). El usuario siempre revisa/edita
 * la lista antes de guardar — esto nunca crea gastos directamente.
 */
export async function extraerFactura(
  imagenBase64: string,
  mimeType: string,
  proyectoId: string
): Promise<ExtraccionFactura> {
  try {
    const supabase = await createClient();
    const { data: proyecto } = await supabase
      .from("proyectos")
      .select("modalidad")
      .eq("id", proyectoId)
      .single();
    if (!proyecto) return { error: "Proyecto no encontrado." };

    const [{ data: catalogoEtapas }, { data: proyectoEtapas }] = await Promise.all([
      supabase
        .from("catalogo_etapas")
        .select("id, nombre")
        .in("modalidad", modalidadesIncluidas(proyecto.modalidad))
        .order("orden"),
      supabase.from("proyecto_etapas").select("etapa_id").eq("proyecto_id", proyectoId),
    ]);

    // Solo las etapas que el proyecto realmente tiene (ej. si no tiene deck,
    // esa etapa no debe sugerirse).
    const etapaIdsProyecto = new Set((proyectoEtapas ?? []).map((pe) => pe.etapa_id));
    const etapas = (catalogoEtapas ?? []).filter((e) => etapaIdsProyecto.has(e.id));

    const { data: catalogoMaterialesRaw } = await supabase
      .from("catalogo_materiales")
      .select("material, unidad_default, etapa_id")
      .in("etapa_id", etapas.length > 0 ? etapas.map((e) => e.id) : [-1]);

    const catalogoMateriales = (catalogoMaterialesRaw ?? [])
      .filter((m): m is typeof m & { etapa_id: number } => m.etapa_id != null)
      .map((m) => ({ material: m.material, unidad: m.unidad_default, etapaId: m.etapa_id }));

    const data = await extraerItemsFactura(imagenBase64, mimeType, etapas, catalogoMateriales);
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo leer la imagen." };
  }
}

export type ExtraccionTransferencia = { data: DatosTransferenciaExtraidos } | { error: string };

export async function extraerTransferencia(
  imagenBase64: string,
  mimeType: string
): Promise<ExtraccionTransferencia> {
  try {
    const data = await extraerDatosTransferencia(imagenBase64, mimeType);
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo leer la imagen." };
  }
}

interface ItemFacturaInput {
  material: string;
  cantidad: number | null;
  unidad: string | null;
  monto_total: number;
  etapa_id: number | null;
  proyecto_id?: string;
  notas?: string | null;
}

/**
 * Crea la factura (cabecera: proveedor, n° documento, fecha, foto, total) y
 * un gasto de Material por cada ítem revisado/editado por el usuario,
 * enlazados a esa factura vía factura_id. Cada ítem puede pertenecer a un
 * proyecto distinto del que originó la factura (una misma boleta puede
 * repartir productos entre varias obras) — si un ítem no trae proyecto_id
 * propio (ej. viene de "Agregar factura a mano"), usa el proyectoId
 * principal.
 */
export async function crearFacturaConGastos(
  proyectoId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const proveedor = String(formData.get("proveedor") ?? "").trim() || null;
  const n_documento = String(formData.get("n_documento") ?? "").trim() || null;
  const fecha = String(formData.get("fecha") ?? "");
  const montoFacturaRaw = String(formData.get("monto_total_factura") ?? "").trim();
  const monto_total_factura = montoFacturaRaw ? Number(montoFacturaRaw) : null;
  const itemsRaw = String(formData.get("items_json") ?? "[]");

  if (!fecha) return { error: "La fecha es obligatoria." };

  let items: ItemFacturaInput[];
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { error: "No se pudieron leer los ítems." };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Agrega al menos un ítem antes de guardar." };
  }
  for (const item of items) {
    if (!item.material || !String(item.material).trim()) {
      return { error: "Todos los ítems necesitan un nombre de material." };
    }
    if (!Number.isFinite(item.monto_total) || item.monto_total <= 0) {
      return { error: `El monto de "${item.material}" debe ser un número mayor a 0.` };
    }
  }

  const foto = formData.get("foto");
  let foto_url: string | null = null;
  try {
    foto_url = await subirFotoGasto(foto instanceof File ? foto : null, proyectoId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo subir la foto." };
  }

  const supabase = await createClient();
  const { data: facturaCreada, error: facturaError } = await supabase
    .from("facturas")
    .insert({
      proyecto_id: proyectoId,
      proveedor,
      n_documento,
      fecha,
      foto_url,
      monto_total: monto_total_factura,
    })
    .select("id")
    .single();

  if (facturaError || !facturaCreada) {
    return { error: `No se pudo crear la factura: ${facturaError?.message ?? "error desconocido"}` };
  }

  const gastosAInsertar = items.map((item) => {
    const cantidad = item.cantidad != null ? Number(item.cantidad) : null;
    const monto_total = Number(item.monto_total);
    return {
      proyecto_id: item.proyecto_id || proyectoId,
      factura_id: facturaCreada.id,
      etapa_id: item.etapa_id != null ? Number(item.etapa_id) : null,
      categoria: "Material" as const,
      material: String(item.material).trim(),
      cantidad,
      unidad: item.unidad ? String(item.unidad) : null,
      costo_unitario: cantidad && cantidad > 0 ? monto_total / cantidad : null,
      monto_total,
      notas: item.notas?.trim() || null,
      fecha,
    };
  });

  const { error: gastosError } = await supabase.from("gastos").insert(gastosAInsertar);
  if (gastosError) {
    return { error: `Se creó la factura pero no se pudieron guardar los ítems: ${gastosError.message}` };
  }

  const proyectosAfectados = new Set(gastosAInsertar.map((g) => g.proyecto_id));
  proyectosAfectados.add(proyectoId);
  for (const pid of proyectosAfectados) {
    revalidatePath(`/proyectos/${pid}/gastos`);
  }
  redirect(`/proyectos/${proyectoId}/gastos`);
}

// ---------------------------------------------------------------------
// Transferencia (Material con varios ítems, o Mano de Obra con uno solo)
// ---------------------------------------------------------------------

interface ItemTransferenciaInput {
  material: string;
  cantidad: number | null;
  unidad: string | null;
  monto_total: number | null;
  etapa_id: number | null;
  notas?: string | null;
  proyecto_id?: string;
}

/**
 * Crea la transferencia (cabecera: destinatario, n° operación, fecha, foto,
 * total transferido) y sus gastos enlazados vía transferencia_id. Para
 * Mano de Obra es siempre un solo gasto (una transferencia = un pago a un
 * contratista). Para Material puede traer varios ítems — no hay factura que
 * los desglose, pero la misma transferencia puede haber cubierto más de un
 * material (cantidad es opcional en cada uno: de una transferencia no
 * siempre se sabe cuánto se compró de cada cosa, solo cuánto costó).
 */
export async function crearTransferenciaConGasto(
  proyectoId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const categoria = String(formData.get("categoria") ?? "") as CategoriaGasto;
  const destinatario = String(formData.get("destinatario") ?? "").trim() || null;
  const n_operacion = String(formData.get("n_operacion") ?? "").trim() || null;
  const fecha = String(formData.get("fecha") ?? "");
  const montoRaw = String(formData.get("monto_total") ?? "").trim();
  const monto_total = Number(montoRaw);

  if (!CATEGORIAS.includes(categoria)) return { error: "Selecciona una categoría válida." };
  if (!fecha) return { error: "La fecha es obligatoria." };
  if (!Number.isFinite(monto_total) || monto_total <= 0) {
    return { error: "El monto total debe ser un número mayor a 0." };
  }

  let items: ItemTransferenciaInput[] = [];
  let etapa_id: number | null = null;

  if (categoria === "Material") {
    const itemsRaw = String(formData.get("items_json") ?? "[]");
    try {
      items = JSON.parse(itemsRaw);
    } catch {
      return { error: "No se pudieron leer los ítems." };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { error: "Agrega al menos un material antes de guardar." };
    }
    for (const item of items) {
      if (!item.material || !String(item.material).trim()) {
        return { error: "Todos los ítems necesitan un nombre de material." };
      }
      if (item.monto_total != null && (!Number.isFinite(item.monto_total) || item.monto_total < 0)) {
        return { error: `El monto de "${item.material}" no es válido.` };
      }
    }

    // El monto por ítem es opcional — de una transferencia no siempre se
    // sabe cuánto costó cada material, solo el total transferido. Lo que
    // falte se reparte en partes iguales entre los ítems sin monto.
    const itemsConMonto = items.filter((it) => it.monto_total != null && it.monto_total > 0);
    const itemsSinMonto = items.filter((it) => it.monto_total == null || it.monto_total <= 0);
    if (itemsSinMonto.length > 0) {
      const montoConocido = itemsConMonto.reduce((s, it) => s + (it.monto_total ?? 0), 0);
      const montoRestante = monto_total - montoConocido;
      if (montoRestante <= 0) {
        return {
          error:
            "La suma de los montos ya ingresados es mayor o igual al monto total transferido — no queda nada para repartir en los ítems sin monto.",
        };
      }
      const montoPorItem = Math.floor(montoRestante / itemsSinMonto.length);
      let acumulado = 0;
      itemsSinMonto.forEach((it, idx) => {
        const esUltimo = idx === itemsSinMonto.length - 1;
        it.monto_total = esUltimo ? montoRestante - acumulado : montoPorItem;
        acumulado += it.monto_total;
      });
    }
  } else {
    const etapaRaw = String(formData.get("etapa_id") ?? "");
    etapa_id = etapaRaw ? Number(etapaRaw) : null;
  }

  const notasManoDeObra = String(formData.get("notas") ?? "").trim() || null;

  const foto = formData.get("foto");
  let foto_url: string | null = null;
  try {
    foto_url = await subirFotoGasto(foto instanceof File ? foto : null, proyectoId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo subir la foto." };
  }

  const supabase = await createClient();
  const { data: transferenciaCreada, error: transferenciaError } = await supabase
    .from("transferencias")
    .insert({
      proyecto_id: proyectoId,
      destinatario,
      n_operacion,
      fecha,
      foto_url,
      monto_total,
    })
    .select("id")
    .single();

  if (transferenciaError || !transferenciaCreada) {
    return {
      error: `No se pudo crear la transferencia: ${transferenciaError?.message ?? "error desconocido"}`,
    };
  }

  const gastosAInsertar: GastoInsert[] =
    categoria === "Material"
      ? items.map((item) => {
          const cantidad = item.cantidad != null ? Number(item.cantidad) : null;
          const montoItem = Number(item.monto_total);
          return {
            proyecto_id: item.proyecto_id || proyectoId,
            transferencia_id: transferenciaCreada.id,
            etapa_id: item.etapa_id != null ? Number(item.etapa_id) : null,
            categoria: "Material" as const,
            material: String(item.material).trim(),
            cantidad,
            unidad: item.unidad ? String(item.unidad) : null,
            costo_unitario: cantidad && cantidad > 0 ? montoItem / cantidad : null,
            monto_total: montoItem,
            notas: item.notas?.trim() || null,
            fecha,
          };
        })
      : [
          {
            proyecto_id: proyectoId,
            transferencia_id: transferenciaCreada.id,
            etapa_id,
            categoria,
            notas: notasManoDeObra,
            material: null,
            cantidad: null,
            unidad: null,
            costo_unitario: null,
            monto_total,
            fecha,
          },
        ];

  const { error: gastosError } = await supabase.from("gastos").insert(gastosAInsertar);
  if (gastosError) {
    return { error: `Se creó la transferencia pero no se pudieron guardar los ítems: ${gastosError.message}` };
  }

  const proyectosAfectados = new Set(gastosAInsertar.map((g) => g.proyecto_id));
  proyectosAfectados.add(proyectoId);
  for (const pid of proyectosAfectados) {
    revalidatePath(`/proyectos/${pid}/gastos`);
  }
  redirect(`/proyectos/${proyectoId}/gastos`);
}

export interface FacturaDuplicada {
  id: string;
  fecha: string;
  monto_total: number | null;
}

/**
 * Advertencia blanda (no bloquea el guardado): busca si ya existe una
 * factura con el mismo proveedor + n° documento, para avisar antes de
 * ingresar la misma boleta dos veces por error.
 */
export async function buscarFacturaDuplicada(
  proveedor: string,
  nDocumento: string
): Promise<FacturaDuplicada | null> {
  const proveedorTrim = proveedor.trim();
  const nDocumentoTrim = nDocumento.trim();
  if (!proveedorTrim || !nDocumentoTrim) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("facturas")
    .select("id, fecha, monto_total")
    // ilike sin comodines exige coincidencia EXACTA (salvo mayúsculas) — con
    // %...% queda como "contiene", más tolerante a que la IA transcriba el
    // proveedor con espacios/tildes/puntos levemente distintos entre una
    // subida y otra del mismo documento.
    .ilike("proveedor", `%${proveedorTrim}%`)
    .ilike("n_documento", `%${nDocumentoTrim}%`)
    .limit(1)
    .maybeSingle();

  return data;
}

export interface TransferenciaDuplicada {
  id: string;
  fecha: string;
  monto_total: number | null;
}

/**
 * Igual que buscarFacturaDuplicada, pero para transferencias: busca por
 * destinatario + n° de operación.
 */
export async function buscarTransferenciaDuplicada(
  destinatario: string,
  nOperacion: string
): Promise<TransferenciaDuplicada | null> {
  const destinatarioTrim = destinatario.trim();
  const nOperacionTrim = nOperacion.trim();
  if (!destinatarioTrim || !nOperacionTrim) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("transferencias")
    .select("id, fecha, monto_total")
    // Ver el mismo comentario en buscarFacturaDuplicada: sin %...% ilike
    // exige coincidencia exacta, muy estricta para texto leído por IA.
    .ilike("destinatario", `%${destinatarioTrim}%`)
    .ilike("n_operacion", `%${nOperacionTrim}%`)
    .limit(1)
    .maybeSingle();

  return data;
}

interface ItemFacturaEditable {
  id?: string;
  proyecto_id: string;
  etapa_id: number | null;
  material: string;
  cantidad: number | null;
  unidad: string | null;
  monto_total: number;
  notas?: string | null;
}

/**
 * Edita la factura completa de una sola vez: cabecera (proveedor, n°
 * documento, fecha, monto total, foto) y todos sus ítems/gastos juntos —
 * misma tabla editable que se usa al crearla. Ítems con `id` se actualizan,
 * ítems sin `id` son nuevos (se insertan), y los que estaban antes pero ya
 * no vienen en la lista se borran (deleted_ids).
 */
export async function updateFacturaConGastos(
  proyectoId: string,
  facturaId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const proveedor = String(formData.get("proveedor") ?? "").trim() || null;
  const n_documento = String(formData.get("n_documento") ?? "").trim() || null;
  const fecha = String(formData.get("fecha") ?? "");
  const montoRaw = String(formData.get("monto_total") ?? "").trim();
  const monto_total = montoRaw ? Number(montoRaw) : null;
  const itemsRaw = String(formData.get("items_json") ?? "[]");
  const deletedIdsRaw = String(formData.get("deleted_ids_json") ?? "[]");

  if (!fecha) return { error: "La fecha es obligatoria." };
  if (montoRaw && (!Number.isFinite(monto_total) || (monto_total ?? 0) <= 0)) {
    return { error: "El monto total debe ser un número mayor a 0." };
  }

  let items: ItemFacturaEditable[];
  let deletedIds: string[];
  try {
    items = JSON.parse(itemsRaw);
    deletedIds = JSON.parse(deletedIdsRaw);
  } catch {
    return { error: "No se pudieron leer los ítems." };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "La factura necesita al menos un ítem." };
  }
  for (const item of items) {
    if (!item.material || !String(item.material).trim()) {
      return { error: "Todos los ítems necesitan un nombre de material." };
    }
    if (!Number.isFinite(item.monto_total) || item.monto_total <= 0) {
      return { error: `El monto de "${item.material}" debe ser un número mayor a 0.` };
    }
  }

  const supabase = await createClient();

  const { data: gastosPrevios } = await supabase
    .from("gastos")
    .select("proyecto_id")
    .eq("factura_id", facturaId);
  const proyectosAfectados = new Set((gastosPrevios ?? []).map((g) => g.proyecto_id));

  const foto = formData.get("foto");
  let fotoUpdate: { foto_url?: string } = {};
  if (foto instanceof File && foto.size > 0) {
    try {
      const path = await subirFotoGasto(foto, proyectoId);
      if (path) fotoUpdate = { foto_url: path };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "No se pudo subir la foto." };
    }
  }

  const { error: facturaError } = await supabase
    .from("facturas")
    .update({ proveedor, n_documento, fecha, monto_total, ...fotoUpdate })
    .eq("id", facturaId);
  if (facturaError) {
    return { error: `No se pudo actualizar la factura: ${facturaError.message}` };
  }

  if (deletedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("gastos")
      .delete()
      .eq("factura_id", facturaId)
      .in("id", deletedIds);
    if (deleteError) {
      return { error: `No se pudieron borrar los ítems quitados: ${deleteError.message}` };
    }
  }

  const nuevos = items.filter((item) => !item.id);
  const existentes = items.filter((item) => item.id);

  if (nuevos.length > 0) {
    const gastosAInsertar: GastoInsert[] = nuevos.map((item) => {
      const cantidad = item.cantidad != null ? Number(item.cantidad) : null;
      const monto = Number(item.monto_total);
      return {
        proyecto_id: item.proyecto_id || proyectoId,
        factura_id: facturaId,
        etapa_id: item.etapa_id != null ? Number(item.etapa_id) : null,
        categoria: "Material" as const,
        material: String(item.material).trim(),
        cantidad,
        unidad: item.unidad ? String(item.unidad) : null,
        costo_unitario: cantidad && cantidad > 0 ? monto / cantidad : null,
        monto_total: monto,
        notas: item.notas?.trim() || null,
        fecha,
      };
    });
    const { error: insertError } = await supabase.from("gastos").insert(gastosAInsertar);
    if (insertError) {
      return { error: `No se pudieron guardar los ítems nuevos: ${insertError.message}` };
    }
  }

  for (const item of existentes) {
    const cantidad = item.cantidad != null ? Number(item.cantidad) : null;
    const monto = Number(item.monto_total);
    const { error: updateError } = await supabase
      .from("gastos")
      .update({
        proyecto_id: item.proyecto_id || proyectoId,
        etapa_id: item.etapa_id != null ? Number(item.etapa_id) : null,
        material: String(item.material).trim(),
        cantidad,
        unidad: item.unidad ? String(item.unidad) : null,
        costo_unitario: cantidad && cantidad > 0 ? monto / cantidad : null,
        monto_total: monto,
        notas: item.notas?.trim() || null,
      })
      .eq("id", item.id!)
      .eq("factura_id", facturaId);
    if (updateError) {
      return { error: `No se pudo actualizar "${item.material}": ${updateError.message}` };
    }
  }

  for (const item of items) proyectosAfectados.add(item.proyecto_id || proyectoId);
  proyectosAfectados.add(proyectoId);
  for (const pid of proyectosAfectados) {
    revalidatePath(`/proyectos/${pid}/gastos`);
  }
  redirect(`/proyectos/${proyectoId}/gastos`);
}

interface ItemTransferenciaEditable {
  id?: string;
  proyecto_id: string;
  etapa_id: number | null;
  categoria: CategoriaGasto;
  material: string | null;
  cantidad: number | null;
  unidad: string | null;
  monto_total: number;
  notas?: string | null;
}

/**
 * Igual que updateFacturaConGastos, pero para transferencias. La categoría
 * es por ítem: en "Mano de Obra" el material es opcional (un pago a un
 * contratista no tiene material asociado), en "Material" sigue siendo
 * obligatorio.
 */
export async function updateTransferenciaConGastos(
  proyectoId: string,
  transferenciaId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const destinatario = String(formData.get("destinatario") ?? "").trim() || null;
  const n_operacion = String(formData.get("n_operacion") ?? "").trim() || null;
  const fecha = String(formData.get("fecha") ?? "");
  const montoRaw = String(formData.get("monto_total") ?? "").trim();
  const monto_total = montoRaw ? Number(montoRaw) : null;
  const itemsRaw = String(formData.get("items_json") ?? "[]");
  const deletedIdsRaw = String(formData.get("deleted_ids_json") ?? "[]");

  if (!fecha) return { error: "La fecha es obligatoria." };
  if (montoRaw && (!Number.isFinite(monto_total) || (monto_total ?? 0) <= 0)) {
    return { error: "El monto total debe ser un número mayor a 0." };
  }

  let items: ItemTransferenciaEditable[];
  let deletedIds: string[];
  try {
    items = JSON.parse(itemsRaw);
    deletedIds = JSON.parse(deletedIdsRaw);
  } catch {
    return { error: "No se pudieron leer los ítems." };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "La transferencia necesita al menos un ítem." };
  }
  for (const item of items) {
    if (!CATEGORIAS.includes(item.categoria)) return { error: "Selecciona una categoría válida en cada ítem." };
    if (item.categoria === "Material" && (!item.material || !String(item.material).trim())) {
      return { error: "Todos los ítems de Material necesitan un nombre." };
    }
    if (!Number.isFinite(item.monto_total) || item.monto_total <= 0) {
      return { error: `El monto de "${item.material ?? item.categoria}" debe ser un número mayor a 0.` };
    }
  }

  const supabase = await createClient();

  const { data: gastosPrevios } = await supabase
    .from("gastos")
    .select("proyecto_id")
    .eq("transferencia_id", transferenciaId);
  const proyectosAfectados = new Set((gastosPrevios ?? []).map((g) => g.proyecto_id));

  const foto = formData.get("foto");
  let fotoUpdate: { foto_url?: string } = {};
  if (foto instanceof File && foto.size > 0) {
    try {
      const path = await subirFotoGasto(foto, proyectoId);
      if (path) fotoUpdate = { foto_url: path };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "No se pudo subir la foto." };
    }
  }

  const { error: transferenciaError } = await supabase
    .from("transferencias")
    .update({ destinatario, n_operacion, fecha, monto_total, ...fotoUpdate })
    .eq("id", transferenciaId);
  if (transferenciaError) {
    return { error: `No se pudo actualizar la transferencia: ${transferenciaError.message}` };
  }

  if (deletedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("gastos")
      .delete()
      .eq("transferencia_id", transferenciaId)
      .in("id", deletedIds);
    if (deleteError) {
      return { error: `No se pudieron borrar los ítems quitados: ${deleteError.message}` };
    }
  }

  const nuevos = items.filter((item) => !item.id);
  const existentes = items.filter((item) => item.id);

  if (nuevos.length > 0) {
    const gastosAInsertar: GastoInsert[] = nuevos.map((item) => {
      const cantidad = item.cantidad != null ? Number(item.cantidad) : null;
      const monto = Number(item.monto_total);
      return {
        proyecto_id: item.proyecto_id || proyectoId,
        transferencia_id: transferenciaId,
        etapa_id: item.etapa_id != null ? Number(item.etapa_id) : null,
        categoria: item.categoria,
        material: item.material?.trim() || null,
        cantidad,
        unidad: item.unidad ? String(item.unidad) : null,
        costo_unitario: cantidad && cantidad > 0 ? monto / cantidad : null,
        monto_total: monto,
        notas: item.notas?.trim() || null,
        fecha,
      };
    });
    const { error: insertError } = await supabase.from("gastos").insert(gastosAInsertar);
    if (insertError) {
      return { error: `No se pudieron guardar los ítems nuevos: ${insertError.message}` };
    }
  }

  for (const item of existentes) {
    const cantidad = item.cantidad != null ? Number(item.cantidad) : null;
    const monto = Number(item.monto_total);
    const { error: updateError } = await supabase
      .from("gastos")
      .update({
        proyecto_id: item.proyecto_id || proyectoId,
        etapa_id: item.etapa_id != null ? Number(item.etapa_id) : null,
        categoria: item.categoria,
        material: item.material?.trim() || null,
        cantidad,
        unidad: item.unidad ? String(item.unidad) : null,
        costo_unitario: cantidad && cantidad > 0 ? monto / cantidad : null,
        monto_total: monto,
        notas: item.notas?.trim() || null,
      })
      .eq("id", item.id!)
      .eq("transferencia_id", transferenciaId);
    if (updateError) {
      return { error: `No se pudo actualizar "${item.material ?? item.categoria}": ${updateError.message}` };
    }
  }

  for (const item of items) proyectosAfectados.add(item.proyecto_id || proyectoId);
  proyectosAfectados.add(proyectoId);
  for (const pid of proyectosAfectados) {
    revalidatePath(`/proyectos/${pid}/gastos`);
  }
  redirect(`/proyectos/${proyectoId}/gastos`);
}
