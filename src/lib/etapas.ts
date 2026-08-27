import type { Database, Modalidad } from "@/lib/supabase/types";
import { avanzarDiasHabiles, siguienteDiaHabil } from "@/lib/fechas";

type CatalogoEtapa = Database["public"]["Tables"]["catalogo_etapas"]["Row"];
type ProyectoEtapaInsert = Database["public"]["Tables"]["proyecto_etapas"]["Insert"];

const DIAS_HABILES_POR_SEMANA = 5;

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Llave en Mano continúa después de Obra Gruesa (33 etapas en total): un
 * proyecto Llave en Mano necesita las etapas de ambas modalidades, no solo
 * las 19 propias. Obra Gruesa Habitable solo usa las suyas.
 */
export function modalidadesIncluidas(modalidad: Modalidad): Modalidad[] {
  return modalidad === "Llave en Mano" ? ["Obra Gruesa Habitable", "Llave en Mano"] : [modalidad];
}

/**
 * Las etapas de deck (Obra Gruesa: "Deck (opcional)"; Llave en Mano: "Deck
 * exterior") solo corresponden si el proyecto marcó tiene_deck. Se identifican
 * por nombre porque no hay una columna dedicada en catalogo_etapas para esto.
 */
export function esEtapaDeck(etapa: Pick<CatalogoEtapa, "nombre">): boolean {
  return etapa.nombre.toLowerCase().includes("deck");
}

/**
 * Un proyecto Llave en Mano arrastra las etapas de Obra Gruesa Habitable
 * además de las suyas — si ambas modalidades tienen su propia etapa de deck
 * ("Deck (opcional)" en Obra Gruesa, "Deck exterior" en Llave en Mano), el
 * deck se construye una sola vez y completo, así que solo corresponde la
 * etapa de deck de la modalidad propia del proyecto (la heredada de Obra
 * Gruesa se descarta para no duplicarlo).
 */
export function etapasDeckAExcluir(
  etapas: Pick<CatalogoEtapa, "id" | "nombre" | "modalidad">[],
  modalidadPropia: Modalidad
): Set<number> {
  const deck = etapas.filter(esEtapaDeck);
  if (deck.length <= 1) return new Set();
  const propia = deck.find((e) => e.modalidad === modalidadPropia);
  if (!propia) return new Set();
  return new Set(deck.filter((e) => e.id !== propia.id).map((e) => e.id));
}

export function filtrarEtapasPorOpciones(
  etapas: CatalogoEtapa[],
  opciones: { tieneDeck: boolean; modalidad: Modalidad }
): CatalogoEtapa[] {
  if (!opciones.tieneDeck) return etapas.filter((etapa) => !esEtapaDeck(etapa));
  const excluir = etapasDeckAExcluir(etapas, opciones.modalidad);
  return excluir.size === 0 ? etapas : etapas.filter((etapa) => !excluir.has(etapa.id));
}

/**
 * Arma las etapas disponibles de cada proyecto de una sola pasada (para
 * cuando se necesita saber las etapas de varios proyectos a la vez, ej. una
 * factura repartida entre obras) — mismo filtro que ya se hacía inline por
 * proyecto: por modalidad y por las etapas que el proyecto realmente tiene.
 */
export function construirEtapasPorProyecto(
  proyectos: { id: string; modalidad: Modalidad }[],
  catalogoEtapas: CatalogoEtapa[],
  proyectoEtapas: { proyecto_id: string; etapa_id: number }[]
): Record<string, CatalogoEtapa[]> {
  const etapaIdsPorProyecto = new Map<string, Set<number>>();
  for (const pe of proyectoEtapas) {
    const set = etapaIdsPorProyecto.get(pe.proyecto_id) ?? new Set<number>();
    set.add(pe.etapa_id);
    etapaIdsPorProyecto.set(pe.proyecto_id, set);
  }

  const resultado: Record<string, CatalogoEtapa[]> = {};
  for (const proyecto of proyectos) {
    const modalidades = modalidadesIncluidas(proyecto.modalidad);
    const idsProyecto = etapaIdsPorProyecto.get(proyecto.id) ?? new Set<number>();
    resultado[proyecto.id] = catalogoEtapas.filter(
      (e) => modalidades.includes(e.modalidad) && idsProyecto.has(e.id)
    );
  }
  return resultado;
}

/**
 * Genera las filas de proyecto_etapas para un proyecto nuevo: fechas plan a
 * partir de fecha_inicio, según duracion_semanas_est de cada etapa del
 * catálogo (orden ascendente), contando solo días hábiles (lunes a viernes).
 *
 * Las etapas marcadas es_paralelo (ventanas, deck, retiro de escombros, etc.)
 * corren junto a la etapa secuencial vigente en ese momento: empiezan en el
 * mismo punto de la línea de tiempo pero no atrasan el resto del proyecto.
 */
export function generarProyectoEtapas(
  proyectoId: string,
  fechaInicio: string,
  etapas: CatalogoEtapa[]
): ProyectoEtapaInsert[] {
  const ordenadas = [...etapas].sort((a, b) => a.orden - b.orden);
  let cursor = siguienteDiaHabil(new Date(`${fechaInicio}T00:00:00Z`));

  return ordenadas.map((etapa) => {
    const duracionDiasHabiles = Math.max(
      1,
      Math.round(etapa.duracion_semanas_est * DIAS_HABILES_POR_SEMANA)
    );
    const fechaInicioPlan = cursor;
    const fechaFinPlan = avanzarDiasHabiles(fechaInicioPlan, duracionDiasHabiles);

    if (!etapa.es_paralelo) {
      cursor = fechaFinPlan;
    }

    return {
      proyecto_id: proyectoId,
      etapa_id: etapa.id,
      fecha_inicio_plan: toDateString(fechaInicioPlan),
      fecha_fin_plan: toDateString(fechaFinPlan),
      estado: "pendiente",
    };
  });
}
