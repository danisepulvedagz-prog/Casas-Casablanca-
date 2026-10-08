"use client";

import { eliminarDespacho } from "@/app/bodega/actions";

export function DeleteDespachoButton({ despachoId, descripcion }: { despachoId: string; descripcion: string }) {
  return (
    <form
      action={eliminarDespacho.bind(null, despachoId)}
      onSubmit={(e) => {
        if (
          !confirm(
            `¿Eliminar el despacho de "${descripcion}"? Se borra el gasto que quedó en el proyecto y la cantidad vuelve a Bodega.`
          )
        ) {
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
