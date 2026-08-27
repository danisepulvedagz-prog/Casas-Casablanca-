"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { calcularPresupuestoSugerido, type ActionState } from "@/app/proyectos/actions";
import type { Database, Modalidad, TipoTecho } from "@/lib/supabase/types";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/lib/ui";

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

  const formRef = useRef<HTMLFormElement>(null);
  const presupuestoRef = useRef<HTMLInputElement>(null);
  const [calculando, startCalculo] = useTransition();
  const [calculoError, setCalculoError] = useState<string | null>(null);
  const [calculoInfo, setCalculoInfo] = useState<string | null>(null);

  function handleCalcularPresupuesto() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    const modalidad = String(fd.get("modalidad") ?? "") as Modalidad;
    const m2 = Number(fd.get("m2"));
    const nBanosRaw = String(fd.get("n_banos") ?? "").trim();
    const nBanos = nBanosRaw ? Number(nBanosRaw) : null;
    const tieneDeck = fd.get("tiene_deck") === "on";

    setCalculoInfo(null);
    if (!modalidad || !Number.isFinite(m2) || m2 <= 0) {
      setCalculoError("Completa modalidad y m² antes de calcular.");
      return;
    }
    setCalculoError(null);

    startCalculo(async () => {
      try {
        const resultado = await calcularPresupuestoSugerido({
          modalidad,
          m2,
          nBanos,
          tieneDeck,
          excludeId: proyecto?.id,
        });
        if ("error" in resultado) {
          setCalculoError(resultado.error);
          return;
        }
        if (presupuestoRef.current) presupuestoRef.current.value = String(resultado.presupuesto);
        setCalculoInfo(
          `Estimado con datos de ${resultado.proyectosConsiderados} proyecto${resultado.proyectosConsiderados === 1 ? "" : "s"} Terminado${resultado.proyectosConsiderados === 1 ? "" : "s"}. Puedes ajustarlo a mano si quieres.`
        );
      } catch (err) {
        setCalculoError(err instanceof Error ? err.message : "Error inesperado al calcular.");
      }
    });
  }

  return (
    <form ref={formRef} action={formAction} className="grid max-w-2xl gap-4">
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

      <div className="grid grid-cols-2 gap-4">
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
        <div>
          <label className={labelClass} htmlFor="presupuesto_total">
            Presupuesto total
          </label>
          <input
            ref={presupuestoRef}
            id="presupuesto_total"
            name="presupuesto_total"
            type="number"
            step="1"
            min="0"
            required
            defaultValue={proyecto?.presupuesto_total}
            className={inputClass}
          />
          <button
            type="button"
            disabled={calculando}
            onClick={handleCalcularPresupuesto}
            className={`${BTN_SECONDARY} mt-2 w-full text-xs`}
          >
            {calculando ? "Calculando..." : "Calcular presupuesto sugerido"}
          </button>
          {calculoError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{calculoError}</p>}
          {calculoInfo && <p className="mt-1 text-xs text-zinc-500">{calculoInfo}</p>}
        </div>
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
