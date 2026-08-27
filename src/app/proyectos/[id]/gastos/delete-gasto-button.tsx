"use client";

import { deleteGasto } from "@/app/proyectos/[id]/gastos/actions";

export function DeleteGastoButton({
  proyectoId,
  gastoId,
  descripcion,
}: {
  proyectoId: string;
  gastoId: string;
  descripcion: string;
}) {
  return (
    <form
      action={deleteGasto.bind(null, proyectoId, gastoId)}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar el gasto "${descripcion}"?`)) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-sm text-red-600 hover:underline dark:text-red-400">
        Eliminar
      </button>
    </form>
  );
}
