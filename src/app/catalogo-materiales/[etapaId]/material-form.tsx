"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/catalogo-materiales/[etapaId]/actions";
import type { Database } from "@/lib/supabase/types";
import { BTN_PRIMARY } from "@/lib/ui";

type CatalogoMaterial = Database["public"]["Tables"]["catalogo_materiales"]["Row"];

interface MaterialFormProps {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  material?: CatalogoMaterial;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={BTN_PRIMARY}>
      {pending ? "Guardando..." : label}
    </button>
  );
}

export function MaterialForm({ action, material }: MaterialFormProps) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div>
        <label className={labelClass} htmlFor="material">
          Material
        </label>
        <input
          id="material"
          name="material"
          required
          defaultValue={material?.material}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="unidad_default">
          Unidad
        </label>
        <input
          id="unidad_default"
          name="unidad_default"
          required
          placeholder="un, m2, kg, saco, rollo..."
          defaultValue={material?.unidad_default}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="escala_por">
          Escala por
        </label>
        <select
          id="escala_por"
          name="escala_por"
          defaultValue={material?.escala_por ?? "m2"}
          className={inputClass}
        >
          <option value="m2">m² de la casa</option>
          <option value="banos">N° de baños del proyecto</option>
          <option value="fijo">Valor fijo por proyecto</option>
        </select>
      </div>

      <div>
        <SubmitButton label={material ? "Guardar cambios" : "Agregar material"} />
      </div>
    </form>
  );
}
