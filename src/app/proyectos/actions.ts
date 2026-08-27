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
import { calcularRatiosPromedio, estimar } from "@/lib/calculadora-m2";
import type {
  Modalidad,
  EstadoProyecto,
  TipoTecho,
  OpcionTechoInclinado,
  Database,
} from "@/lib/supabase/types";

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];

export interface ActionState {
  error?: string;
}

function parseProyectoForm(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const modalidad = String(formData.get("modalidad") ?? "") as Modalidad;
  const m2 = Number(formData.get("m2"));
  const presupuesto_total = Number(formData.get("presupuesto_total"));
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
  if (!Number.isFinite(presupuesto_total) || presupuesto_total < 0) {
    return { error: "El presupuesto debe ser un número válido." } as const;
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

  return {
    values: {
      nombre,
      modalidad,
      m2,
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

export interface PresupuestoSugerido {
  presupuesto: number;
  proyectosConsiderados: number;
}

/**
 * Presupuesto teórico en base al promedio de costos de materiales de los
 * proyectos Terminados, acotado a las etapas que le corresponden a este
 * proyecto (según su modalidad y si tiene o no deck) para no mezclar costos
 * de etapas que ni siquiera va a tener. Por ahora solo considera gastos de
 * categoría Material (mano de obra y otras categorías quedan pendientes).
 */
export async function calcularPresupuestoSugerido(input: {
  modalidad: Modalidad;
  m2: number;
  nBanos: number | null;
  tieneDeck: boolean;
  excludeId?: string;
}): Promise<PresupuestoSugerido | { error: string }> {
  if (!Number.isFinite(input.m2) || input.m2 <= 0) {
    return { error: "Ingresa m² válidos antes de calcular." };
  }

  const supabase = await createClient();

  const { data: catalogoEtapasRaw } = await supabase
    .from("catalogo_etapas")
    .select("*")
    .in("modalidad", modalidadesIncluidas(input.modalidad));
  const catalogoEtapas = filtrarEtapasPorOpciones(catalogoEtapasRaw ?? [], {
    tieneDeck: input.tieneDeck,
    modalidad: input.modalidad,
  });
  const etapaIds = new Set(catalogoEtapas.map((e) => e.id));

  if (etapaIds.size === 0) {
    return { error: "No hay etapas configuradas para esta modalidad todavía." };
  }

  const { data: catalogoMateriales } = await supabase
    .from("catalogo_materiales")
    .select("*")
    .in("etapa_id", Array.from(etapaIds));

  let proyectosQuery = supabase.from("proyectos").select("id, m2, n_banos").eq("estado", "Terminado");
  if (input.excludeId) proyectosQuery = proyectosQuery.neq("id", input.excludeId);
  const { data: proyectosTerminados } = await proyectosQuery;

  if (!proyectosTerminados || proyectosTerminados.length === 0) {
    return { error: "Todavía no hay proyectos Terminados para calcular un presupuesto teórico." };
  }

  const { data: gastos } = await supabase
    .from("gastos")
    .select("*")
    .in(
      "proyecto_id",
      proyectosTerminados.map((p) => p.id)
    )
    .eq("categoria", "Material");

  // Solo gastos de etapas que le corresponden a este proyecto (su modalidad + tiene_deck),
  // aunque vengan de un proyecto Terminado de otra modalidad (ej. un dato de Obra Gruesa de
  // un proyecto Llave en Mano sirve igual para un proyecto nuevo Obra Gruesa).
  const gastosRelevantes = (gastos ?? []).filter(
    (g): g is Gasto => g.etapa_id != null && etapaIds.has(g.etapa_id)
  );

  const gastosPorProyecto = new Map<string, Gasto[]>();
  for (const g of gastosRelevantes) {
    const lista = gastosPorProyecto.get(g.proyecto_id) ?? [];
    lista.push(g);
    gastosPorProyecto.set(g.proyecto_id, lista);
  }

  const proyectosConDatos = proyectosTerminados.filter((p) => gastosPorProyecto.has(p.id));
  if (proyectosConDatos.length === 0) {
    return {
      error: "Los proyectos Terminados todavía no tienen gastos de Material para estas etapas.",
    };
  }

  const ratios = calcularRatiosPromedio(proyectosConDatos, gastosPorProyecto, catalogoMateriales ?? []);
  const estimaciones = estimar(ratios, input.m2, input.nBanos);
  const presupuesto = Math.round(estimaciones.reduce((sum, e) => sum + e.costoEstimado, 0));

  return { presupuesto, proyectosConsiderados: proyectosConDatos.length };
}

export async function deleteProyecto(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("proyectos").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo eliminar el proyecto: ${error.message}`);
  }
  revalidatePath("/proyectos");
}
