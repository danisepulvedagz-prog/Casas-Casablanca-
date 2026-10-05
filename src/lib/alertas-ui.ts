export type Severidad = "atrasada" | "hoy" | "proxima";

export function severidadAlerta(diasHastaInicio: number): Severidad {
  return diasHastaInicio < 0 ? "atrasada" : diasHastaInicio === 0 ? "hoy" : "proxima";
}

export const ALERTA_ESTILOS: Record<
  Severidad,
  { box: string; titulo: string; label: string; item: string; cantidad: string }
> = {
  atrasada: {
    box: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950",
    titulo: "text-red-900 dark:text-red-200",
    label: "text-red-700 dark:text-red-400",
    item: "text-red-900 dark:text-red-200",
    cantidad: "text-red-700 dark:text-red-400",
  },
  hoy: {
    box: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950",
    titulo: "text-amber-900 dark:text-amber-200",
    label: "text-amber-700 dark:text-amber-400",
    item: "text-amber-900 dark:text-amber-200",
    cantidad: "text-amber-700 dark:text-amber-400",
  },
  proxima: {
    box: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900",
    titulo: "text-zinc-800 dark:text-zinc-100",
    label: "text-zinc-500 dark:text-zinc-400",
    item: "text-zinc-700 dark:text-zinc-300",
    cantidad: "text-zinc-600 dark:text-zinc-400",
  },
};
