"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  esEtapaDeck,
  etapasDeckAExcluir,
  filtrarEtapasPorOpciones,
  generarProyectoEtapas,
  modalidadesIncluidas,
} from "@/lib/etapas";
import type { Modalidad, EstadoProyecto, TipoTecho, OpcionTechoInclinado } from "@/lib/supabase/types";

export interface ActionState {
  error?: string;
}

// El presupuesto de la casa es el 80% de lo que el cliente firma en total
// (Contrato + Anexo 1 + Anexo 2) — no es un campo libre.
const PORCENTAJE_PRESUPUESTO = 0.8;

function parseProyectoForm(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const modalidad = String(formData.get("modalidad") ?? "") as Modalidad;
  const m2 = Number(formData.get("m2"));
  const contratoRaw = String(formData.get("contrato") ?? "").trim();
  const contrato = contratoRaw ? Number(contratoRaw) : NaN;
  const anexo1Raw = String(formData.get("anexo_1") ?? "").trim();
  const anexo_1 = anexo1Raw ? Number(anexo1Raw) : 0;
  const anexo2Raw = String(formData.get("anexo_2") ?? "").trim();
  const anexo_2 = anexo2Raw ? Number(anexo2Raw) : 0;
  const fecha_inicio = String(formData.get("fecha_inicio") ?? "");
  const fecha_termino_estimada = String(formData.get("fecha_termino_estimada") ?? "") || null;
  const n_dormitorios = formData.get("n_dormitorios")
    ? Number(formData.get("n_dormitorios"))
    : null;
  const n_banos = formData.get("n_banos") ? Number(formData.get("n_banos")) : null;
  const cliente = String(formData.get("cliente") ?? "").trim() || null;
  const estado = String(formData.get("estado") ?? "En curso") as EstadoProyecto;
  const tiene_logia = formData.get("tiene_logia") === "on";
  const tiene_deck = formData.get("tiene_deck") === "on";
  const es_proyecto_referencia_m2 = formData.get("es_proyecto_referencia_m2") === "on";
  const tipo_techo = (String(formData.get("tipo_techo") ?? "") || null) as TipoTecho | null;
  const opcion_techo_inclinado = (String(formData.get("opcion_techo_inclinado") ?? "") || null) as
    | OpcionTechoInclinado
    | null;

  if (!nombre) return { error: "El nombre del proyecto es obligatorio." } as const;
  if (modalidad !== "Obra Gruesa Habitable" && modalidad !== "Llave en Mano") {
    return { error: "Modalidad inválida." } as const;
  }
  if (!Number.isFinite(m2) || m2 <= 0) return { error: "Los m² deben ser un número mayor a 0." } as const;
  if (!Number.isFinite(contrato) || contrato < 0) {
    return { error: "El Contrato debe ser un número válido." } as const;
  }
  if (!Number.isFinite(anexo_1) || anexo_1 < 0 || !Number.isFinite(anexo_2) || anexo_2 < 0) {
    return { error: "Los anexos deben ser números válidos (pueden quedar en 0)." } as const;
  }
  if (!fecha_inicio) return { error: "La fecha de inicio es obligatoria." } as const;
  if (n_banos != null && (!Number.isFinite(n_banos) || n_banos < 0 || Math.round(n_banos * 2) !== n_banos * 2)) {
    return {
      error: "El N° de baños debe ser 0 o un número positivo en pasos de 0,5 (ej. 2 o 2,5).",
    } as const;
  }
  if (tipo_techo !== "Inclinado" && opcion_techo_inclinado) {
    return { error: "La opción de techo inclinado solo aplica si el tipo de techo es Inclinado." } as const;
  }

  const presupuesto_total = Math.round(PORCENTAJE_PRESUPUESTO * (contrato + anexo_1 + anexo_2));

  return {
    values: {
      nombre,
      modalidad,
      m2,
      contrato,
      anexo_1,
      anexo_2,
      presupuesto_total,
      fecha_inicio,
      fecha_termino_estimada,
      n_dormitorios,
      n_banos,
      cliente,
      estado,
      tiene_logia,
      tiene_deck,
      es_proyecto_referencia_m2,
      tipo_techo,
      opcion_techo_inclinado: tipo_techo === "Inclinado" ? opcion_techo_inclinado : null,
    },
  } as const;
}

export async function createProyecto(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parseProyectoForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();

  const { data: proyecto, error: insertError } = await supabase
    .from("proyectos")
    .insert(parsed.values)
    .select("id")
    .single();

  if (insertError || !proyecto) {
    return { error: `No se pudo crear el proyecto: ${insertError?.message ?? "error desconocido"}` };
  }

  const { data: etapas, error: etapasError } = await supabase
    .from("catalogo_etapas")
    .select("*")
    .in("modalidad", modalidadesIncluidas(parsed.values.modalidad));

  if (etapasError) {
    return { error: `Proyecto creado, pero no se pudieron cargar sus etapas: ${etapasError.message}` };
  }

  if (etapas && etapas.length > 0) {
    const etapasFiltradas = filtrarEtapasPorOpciones(etapas, {
      tieneDeck: parsed.values.tiene_deck,
      modalidad: parsed.values.modalidad,
    });
    const proyectoEtapas = generarProyectoEtapas(proyecto.id, parsed.values.fecha_inicio, etapasFiltradas);
    const { error: insertEtapasError } = await supabase.from("proyecto_etapas").insert(proyectoEtapas);
    if (insertEtapasError) {
      return {
        error: `Proyecto creado, pero no se pudieron generar sus etapas: ${insertEtapasError.message}`,
      };
    }
  }

  revalidatePath("/proyectos");
  redirect("/proyectos");
}

export async function updateProyecto(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parseProyectoForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  // La modalidad no se puede editar: cambia el set de etapas y el formulario
  // la muestra como solo lectura, así que se ignora aquí por si acaso.
  const { modalidad: _modalidad, ...resto } = parsed.values;
  void _modalidad;

  const { error } = await supabase.from("proyectos").update(resto).eq("id", id);

  if (error) {
    return { error: `No se pudo actualizar el proyecto: ${error.message}` };
  }

  await sincronizarEtapaDeck(supabase, id, parsed.values.modalidad, parsed.values.fecha_inicio, parsed.values.tiene_deck);

  revalidatePath("/proyectos");
  redirect("/proyectos");
}

/**
 * Al editar un proyecto puede cambiar tiene_deck: agrega la(s) etapa(s) de
 * deck que falten (con fechas plan calculadas igual que en la creación, ya
 * que son paralelas y no mueven el resto del cronograma) o quita las que
 * sobren, siempre que no tengan gastos registrados (para no perder historial
 * real por un cambio de checkbox).
 */
async function sincronizarEtapaDeck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  proyectoId: string,
  modalidad: Modalidad,
  fechaInicio: string,
  tieneDeck: boolean
) {
  const { data: catalogoEtapas } = await supabase
    .from("catalogo_etapas")
    .select("*")
    .in("modalidad", modalidadesIncluidas(modalidad))
    .order("orden");

  const excluirIds = etapasDeckAExcluir(catalogoEtapas ?? [], modalidad);
  const etapasDeckIds = (catalogoEtapas ?? [])
    .filter(esEtapaDeck)
    .filter((e) => !excluirIds.has(e.id))
    .map((e) => e.id);
  if (etapasDeckIds.length === 0) return;

  const { data: existentes } = await supabase
    .from("proyecto_etapas")
    .select("etapa_id")
    .eq("proyecto_id", proyectoId)
    .in("etapa_id", etapasDeckIds);
  const existentesIds = new Set((existentes ?? []).map((e) => e.etapa_id));

  if (tieneDeck) {
    const faltantesIds = new Set(etapasDeckIds.filter((eid) => !existentesIds.has(eid)));
    if (faltantesIds.size === 0) return;
    const todasCalculadas = generarProyectoEtapas(proyectoId, fechaInicio, catalogoEtapas ?? []);
    const nuevas = todasCalculadas.filter((pe) => faltantesIds.has(pe.etapa_id));
    if (nuevas.length > 0) {
      await supabase.from("proyecto_etapas").insert(nuevas);
    }
    return;
  }

  const idsAEliminar = etapasDeckIds.filter((eid) => existentesIds.has(eid));
  if (idsAEliminar.length === 0) return;

  const { data: gastosDeck } = await supabase
    .from("gastos")
    .select("etapa_id")
    .eq("proyecto_id", proyectoId)
    .in("etapa_id", idsAEliminar);
  const conGasto = new Set((gastosDeck ?? []).map((g) => g.etapa_id));
  const sinGasto = idsAEliminar.filter((eid) => !conGasto.has(eid));
  if (sinGasto.length > 0) {
    await supabase.from("proyecto_etapas").delete().eq("proyecto_id", proyectoId).in("etapa_id", sinGasto);
  }
}

export async function deleteProyecto(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("proyectos").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo eliminar el proyecto: ${error.message}`);
  }
  revalidatePath("/proyectos");
}
