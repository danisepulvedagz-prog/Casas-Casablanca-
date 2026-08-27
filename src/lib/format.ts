import type { EscalaPor } from "@/lib/supabase/types";

export const escalaPorLabels: Record<EscalaPor, string> = {
  m2: "m²",
  banos: "N° de baños",
  fijo: "Fijo",
};

export const currencyFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export const compactCurrencyFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const dateFormatter = new Intl.DateTimeFormat("es-CL");

export function formatFecha(fecha: string | null) {
  if (!fecha) return "—";
  return dateFormatter.format(new Date(`${fecha}T00:00:00`));
}

export const estadoProyectoStyles: Record<string, string> = {
  "En curso": "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Terminado: "bg-brand-tint text-brand-dark dark:bg-brand-tint dark:text-emerald-300",
  Pausado: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

export const estadoEtapaStyles: Record<string, string> = {
  pendiente: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  en_curso: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  terminada: "bg-brand-tint text-brand-dark dark:bg-brand-tint dark:text-emerald-300",
};

export const estadoEtapaLabels: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  terminada: "Terminada",
};

// Orden fijo (coincide con el check constraint de la tabla gastos) — nunca
// reordenar: el orden es lo que mantiene los colores CVD-seguros.
export const CATEGORIAS_GASTO = ["Material", "Mano de Obra"] as const;

export const categoriaChartColorVar: Record<string, string> = {
  Material: "var(--chart-cat-material)",
  "Mano de Obra": "var(--chart-cat-mano-obra)",
};
