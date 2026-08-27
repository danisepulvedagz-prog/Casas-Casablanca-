"use client";

import { deleteFactura } from "@/app/proyectos/[id]/gastos/actions";

export function DeleteFacturaButton({
  proyectoId,
  facturaId,
  descripcion,
  cantidadItems,
}: {
  proyectoId: string;
  facturaId: string;
  descripcion: string;
  cantidadItems: number;
}) {
  return (
    <form
      action={deleteFactura.bind(null, proyectoId, facturaId)}
      onSubmit={(e) => {
        if (
          !confirm(
            `¿Eliminar la factura "${descripcion}"? Esto borra sus ${cantidadItems} ítem${cantidadItems === 1 ? "" : "s"} también, no se puede deshacer.`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-sm text-red-600 hover:underline dark:text-red-400">
        Eliminar factura
      </button>
    </form>
  );
}
