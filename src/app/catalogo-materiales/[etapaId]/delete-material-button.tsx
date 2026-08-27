"use client";

import { deleteMaterial } from "@/app/catalogo-materiales/[etapaId]/actions";

export function DeleteMaterialButton({
  etapaId,
  materialId,
  nombre,
}: {
  etapaId: number;
  materialId: number;
  nombre: string;
}) {
  return (
    <form
      action={deleteMaterial.bind(null, etapaId, materialId)}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar "${nombre}" del catálogo?`)) {
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
