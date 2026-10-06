"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/bodega/actions";
import type { StockMaterial } from "@/lib/bodega";
import { etapasSugeridasParaMaterial } from "@/lib/bodega";
import { BTN_PRIMARY } from "@/lib/ui";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass = "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={BTN_PRIMARY}>
      {pending ? "Guardando..." : "Despachar"}
    </button>
  );
}

export function DespachoForm({
  stock,
  proyectos,
  catalogoMateriales,
  etapasPorProyecto,
  materialInicial,
  action,
}: {
  stock: StockMaterial[];
  proyectos: { id: string; nombre: string }[];
  catalogoMateriales: { etapa_id: number | null; material: string }[];
  etapasPorProyecto: Record<string, { id: number; nombre: string; orden: number }[]>;
  materialInicial?: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [material, setMaterial] = useState(materialInicial ?? stock[0]?.material ?? "");
  const [proyectoDestino, setProyectoDestino] = useState("");
  const [cantidad, setCantidad] = useState("");

  const stockMaterial = useMemo(
    () => stock.find((s) => s.material === material),
    [stock, material]
  );

  const etapasDelProyecto = useMemo(
    () => etapasPorProyecto[proyectoDestino] ?? [],
    [etapasPorProyecto, proyectoDestino]
  );

  const etapasSugeridas = useMemo(
    () => (material ? etapasSugeridasParaMaterial(material, catalogoMateriales, etapasDelProyecto) : []),
    [material, catalogoMateriales, etapasDelProyecto]
  );

  // Si hay una sola etapa sugerida, se deja preseleccionada; si hay varias o
  // ninguna, se parte sin elegir y se usa el listado completo del proyecto.
  const etapaPreseleccionada = etapasSugeridas.length === 1 ? String(etapasSugeridas[0].id) : "";

  const hoy = new Date().toISOString().slice(0, 10);

  if (stock.length === 0) {
    return <p className="text-sm text-zinc-500">No hay materiales con stock disponible para despachar.</p>;
  }

  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div>
        <label className={labelClass} htmlFor="material">
          Material
        </label>
        <select
          id="material"
          name="material"
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          className={inputClass}
        >
          {stock.map((s) => (
            <option key={s.material} value={s.material}>
              {s.material} — {s.cantidadDisponible} {s.unidad ?? ""} disponibles
            </option>
          ))}
        </select>
      </div>

      <input type="hidden" name="unidad" value={stockMaterial?.unidad ?? ""} />
      <input type="hidden" name="costo_unitario" value={stockMaterial?.costoPromedio ?? 0} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="cantidad">
            Cantidad {stockMaterial ? `(máx. ${stockMaterial.cantidadDisponible} ${stockMaterial.unidad ?? ""})` : ""}
          </label>
          <input
            id="cantidad"
            name="cantidad"
            type="number"
            step="any"
            min="0"
            max={stockMaterial?.cantidadDisponible}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="fecha">
            Fecha
          </label>
          <input id="fecha" name="fecha" type="date" defaultValue={hoy} required className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="proyecto_destino_id">
          Proyecto destino
        </label>
        <select
          id="proyecto_destino_id"
          name="proyecto_destino_id"
          value={proyectoDestino}
          onChange={(e) => setProyectoDestino(e.target.value)}
          required
          className={inputClass}
        >
          <option value="" disabled>
            Selecciona un proyecto
          </option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      {proyectoDestino && etapasDelProyecto.length > 0 && (
        <div>
          <label className={labelClass} htmlFor="etapa_id">
            Etapa
            {etapasSugeridas.length > 0 && (
              <span className="ml-1 font-normal text-zinc-500">
                (sugerida según el catálogo: {etapasSugeridas.map((e) => e.nombre).join(" / ")})
              </span>
            )}
          </label>
          <select id="etapa_id" name="etapa_id" defaultValue={etapaPreseleccionada} required className={inputClass}>
            <option value="" disabled>
              Selecciona una etapa
            </option>
            {etapasDelProyecto.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className={labelClass} htmlFor="notas">
          Notas (opcional)
        </label>
        <input id="notas" name="notas" type="text" placeholder="Ej. entregado directo en obra" className={inputClass} />
      </div>

      <div>
        <label className={labelClass} htmlFor="registrado_por">
          Quién registra (opcional)
        </label>
        <input id="registrado_por" name="registrado_por" type="text" className={inputClass} />
      </div>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
