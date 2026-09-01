"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/proyectos/actions";
import type { Database, TipoTecho } from "@/lib/supabase/types";
import { BTN_PRIMARY } from "@/lib/ui";

// El presupuesto de la casa es el 80% de lo que el cliente firma en total
// (Contrato + Anexo 1 + Anexo 2) — mismo porcentaje que actions.ts.
const PORCENTAJE_PRESUPUESTO = 0.8;

const currencyFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

type Proyecto = Database["public"]["Tables"]["proyectos"]["Row"];

interface ProyectoFormProps {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  proyecto?: Proyecto;
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

export function ProyectoForm({ action, proyecto }: ProyectoFormProps) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [tipoTecho, setTipoTecho] = useState<TipoTecho | "">(proyecto?.tipo_techo ?? "");

  const [contrato, setContrato] = useState(proyecto ? String(proyecto.contrato) : "");
  const [anexo1, setAnexo1] = useState(proyecto ? String(proyecto.anexo_1) : "");
  const [anexo2, setAnexo2] = useState(proyecto ? String(proyecto.anexo_2) : "");

  const presupuestoCalculado = useMemo(() => {
    const suma = (Number(contrato) || 0) + (Number(anexo1) || 0) + (Number(anexo2) || 0);
    return Math.round(suma * PORCENTAJE_PRESUPUESTO);
  }, [contrato, anexo1, anexo2]);

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div>
        <label className={labelClass} htmlFor="nombre">
          Nombre del proyecto
        </label>
        <input
          id="nombre"
          name="nombre"
          required
          defaultValue={proyecto?.nombre}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="modalidad">
          Modalidad
        </label>
        {proyecto ? (
          <>
            <input
              className={`${inputClass} bg-zinc-100 dark:bg-zinc-800`}
              value={proyecto.modalidad}
              disabled
            />
            <input type="hidden" name="modalidad" value={proyecto.modalidad} />
            <p className="mt-1 text-xs text-zinc-500">
              La modalidad no se puede cambiar después de creado el proyecto.
            </p>
          </>
        ) : (
          <select
            id="modalidad"
            name="modalidad"
            required
            defaultValue="Obra Gruesa Habitable"
            className={inputClass}
          >
            <option value="Obra Gruesa Habitable">Obra Gruesa Habitable</option>
            <option value="Llave en Mano">Llave en Mano</option>
          </select>
        )}
      </div>

      <div>
        <label className={labelClass} htmlFor="m2">
          m²
        </label>
        <input
          id="m2"
          name="m2"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={proyecto?.m2}
          className={inputClass}
        />
      </div>

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Lo que firma el cliente
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass} htmlFor="contrato">
              Contrato
            </label>
            <input
              id="contrato"
              name="contrato"
              type="number"
              step="1"
              min="0"
              required
              value={contrato}
              onChange={(e) => setContrato(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="anexo_1">
              Anexo 1
            </label>
            <input
              id="anexo_1"
              name="anexo_1"
              type="number"
              step="1"
              min="0"
              placeholder="0"
              value={anexo1}
              onChange={(e) => setAnexo1(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="anexo_2">
              Anexo 2
            </label>
            <input
              id="anexo_2"
              name="anexo_2"
              type="number"
              step="1"
              min="0"
              placeholder="0"
              value={anexo2}
              onChange={(e) => setAnexo2(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <p className="mt-3 text-sm text-zinc-500">
          Presupuesto de la casa (80% de la suma de arriba):{" "}
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {currencyFormatter.format(presupuestoCalculado)}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="n_dormitorios">
            N° dormitorios
          </label>
          <input
            id="n_dormitorios"
            name="n_dormitorios"
            type="number"
            min="0"
            defaultValue={proyecto?.n_dormitorios ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="n_banos">
            N° baños (0,5 = baño de visita: wc + lavamanos, sin ducha)
          </label>
          <input
            id="n_banos"
            name="n_banos"
            type="number"
            min="0"
            step="0.5"
            defaultValue={proyecto?.n_banos ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="fecha_inicio">
            Fecha de inicio
          </label>
          <input
            id="fecha_inicio"
            name="fecha_inicio"
            type="date"
            required
            defaultValue={proyecto?.fecha_inicio}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="fecha_termino_estimada">
            Fecha término estimada
          </label>
          <input
            id="fecha_termino_estimada"
            name="fecha_termino_estimada"
            type="date"
            defaultValue={proyecto?.fecha_termino_estimada ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="cliente">
          Cliente
        </label>
        <input
          id="cliente"
          name="cliente"
          defaultValue={proyecto?.cliente ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="estado">
          Estado
        </label>
        <select
          id="estado"
          name="estado"
          defaultValue={proyecto?.estado ?? "En curso"}
          className={inputClass}
        >
          <option value="En curso">En curso</option>
          <option value="Terminado">Terminado</option>
          <option value="Pausado">Pausado</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="tipo_techo">
            Tipo de techo
          </label>
          <select
            id="tipo_techo"
            name="tipo_techo"
            value={tipoTecho}
            onChange={(e) => setTipoTecho(e.target.value as TipoTecho | "")}
            className={inputClass}
          >
            <option value="">Sin definir</option>
            <option value="Mediterráneo">Mediterráneo</option>
            <option value="Inclinado">Inclinado</option>
          </select>
        </div>
        {tipoTecho === "Inclinado" && (
          <div>
            <label className={labelClass} htmlFor="opcion_techo_inclinado">
              Opción de techo inclinado
            </label>
            <select
              id="opcion_techo_inclinado"
              name="opcion_techo_inclinado"
              defaultValue={proyecto?.opcion_techo_inclinado ?? ""}
              className={inputClass}
            >
              <option value="">Sin definir</option>
              <option value="Teja asfáltica">Teja asfáltica</option>
              <option value="Zinc prepintado">Zinc prepintado</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            name="tiene_logia"
            defaultChecked={proyecto?.tiene_logia ?? false}
          />
          Tiene logia
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            name="tiene_deck"
            defaultChecked={proyecto?.tiene_deck ?? false}
          />
          Tiene deck
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            name="es_proyecto_referencia_m2"
            defaultChecked={proyecto?.es_proyecto_referencia_m2 ?? false}
          />
          Usar como proyecto de referencia para calculadora de m²
        </label>
      </div>

      <div>
        <SubmitButton label={proyecto ? "Guardar cambios" : "Crear proyecto"} />
      </div>
    </form>
  );
}
