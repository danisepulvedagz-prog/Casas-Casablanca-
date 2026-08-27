"use client";

import { deleteTransferencia } from "@/app/proyectos/[id]/gastos/actions";

export function DeleteTransferenciaButton({
  proyectoId,
  transferenciaId,
  descripcion,
}: {
  proyectoId: string;
  transferenciaId: string;
  descripcion: string;
}) {
  return (
    <form
      action={deleteTransferencia.bind(null, proyectoId, transferenciaId)}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar la transferencia "${descripcion}"? Esto borra su gasto asociado, no se puede deshacer.`)) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-sm text-red-600 hover:underline dark:text-red-400">
        Eliminar transferencia
      </button>
    </form>
  );
}
