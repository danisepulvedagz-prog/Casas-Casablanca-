"use client";

import { deleteProyecto } from "@/app/proyectos/actions";

export function DeleteProyectoButton({ id, nombre }: { id: string; nombre: string }) {
  return (
    <form
      action={deleteProyecto.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar el proyecto "${nombre}"? Esto borra también sus etapas y gastos.`)) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="text-sm text-red-600 hover:underline dark:text-red-400"
      >
        Eliminar
      </button>
    </form>
  );
}
