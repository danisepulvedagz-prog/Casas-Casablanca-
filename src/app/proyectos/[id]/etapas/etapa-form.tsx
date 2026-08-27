"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/proyectos/[id]/etapas/actions";
import type { Database } from "@/lib/supabase/types";
import { BTN_PRIMARY } from "@/lib/ui";

type ProyectoEtapa = Database["public"]["Tables"]["proyecto_etapas"]["Row"];

interface EtapaFormProps {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  proyectoEtapa: ProyectoEtapa;
  etapaNombre: string;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={BTN_PRIMARY}>
      {pending ? "Guardando..." : "Guardar avance"}
    </button>
  );
}

export function EtapaForm({ action, proyectoEtapa, etapaNombre }: EtapaFormProps) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      <div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{etapaNombre}</p>
        <p className="text-xs text-zinc-500">
          Plan: {proyectoEtapa.fecha_inicio_plan} → {proyectoEtapa.fecha_fin_plan}
        </p>
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div>
        <label className={labelClass} htmlFor="estado">
          Estado
        </label>
        <select
          id="estado"
          name="estado"
          defaultValue={proyectoEtapa.estado}
          className={inputClass}
        >
          <option value="pendiente">Pendiente</option>
          <option value="en_curso">En curso</option>
          <option value="terminada">Terminada</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="fecha_inicio_real">
            Fecha inicio real
          </label>
          <input
            id="fecha_inicio_real"
            name="fecha_inicio_real"
            type="date"
            defaultValue={proyectoEtapa.fecha_inicio_real ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="fecha_fin_real">
            Fecha fin real
          </label>
          <input
            id="fecha_fin_real"
            name="fecha_fin_real"
            type="date"
            defaultValue={proyectoEtapa.fecha_fin_real ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
