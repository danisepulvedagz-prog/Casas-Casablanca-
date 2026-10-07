"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/bodega/actions";
import { sugerirMaterialDespacho } from "@/app/bodega/actions";
import type { StockMaterial } from "@/lib/bodega";
import { etapasSugeridasParaMaterial } from "@/lib/bodega";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/lib/ui";

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

type Sugerencia = { tipo: "match"; material: string; etapaId: number } | { tipo: "sin-match" };

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
  const materialPorDefecto = materialInicial ?? stock[0]?.material ?? "";
  const [material, setMaterial] = useState(materialPorDefecto);
  // Nombre con el que el material queda registrado en el gasto del proyecto
  // destino — parte igual al de Bodega, pero puede quedar distinto si la IA
  // lo hace calzar con el catálogo (o "Otros" si no encuentra con qué).
  const [materialDestino, setMaterialDestino] = useState(materialPorDefecto);
  const [proyectoDestino, setProyectoDestino] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [etapaElegida, setEtapaElegida] = useState("");

  const [sugiriendo, startSugerencia] = useTransition();
  const [sugerencia, setSugerencia] = useState<Sugerencia | undefined>(undefined);

  const stockMaterial = useMemo(() => stock.find((s) => s.material === material), [stock, material]);

  const etapasDelProyecto = useMemo(() => etapasPorProyecto[proyectoDestino] ?? [], [etapasPorProyecto, proyectoDestino]);

  // Se sugiere según el nombre que va a quedar guardado (materialDestino), no
  // el de Bodega — una vez que la IA lo hace calzar con el catálogo, esto ya
  // encuentra la etapa sola por nombre exacto, igual que cualquier material normal.
  const etapasSugeridas = useMemo(
    () => (materialDestino ? etapasSugeridasParaMaterial(materialDestino, catalogoMateriales, etapasDelProyecto) : []),
    [materialDestino, catalogoMateriales, etapasDelProyecto]
  );
  const etapaPreseleccionada = etapasSugeridas.length === 1 ? String(etapasSugeridas[0].id) : "";

  const hoy = new Date().toISOString().slice(0, 10);

  function elegirMaterial(nuevoMaterial: string) {
    setMaterial(nuevoMaterial);
    setMaterialDestino(nuevoMaterial);
    setSugerencia(undefined);
    setEtapaElegida("");
  }

  function pedirSugerencia() {
    setSugerencia(undefined);
    startSugerencia(async () => {
      const resultado = await sugerirMaterialDespacho(material);
      if (resultado) {
        setSugerencia({ tipo: "match", material: resultado.material, etapaId: resultado.etapaId });
        setMaterialDestino(resultado.material);
        const etapaEnProyecto = etapasDelProyecto.find((e) => e.id === resultado.etapaId);
        setEtapaElegida(etapaEnProyecto ? String(etapaEnProyecto.id) : "");
      } else {
        setSugerencia({ tipo: "sin-match" });
        setMaterialDestino("Otros");
        setEtapaElegida("");
      }
    });
  }

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
        <label className={labelClass} htmlFor="material_origen">
          Material (de Bodega)
        </label>
        <select
          id="material_origen"
          name="material_origen"
          value={material}
          onChange={(e) => elegirMaterial(e.target.value)}
          className={inputClass}
        >
          {stock.map((s) => (
            <option key={s.material} value={s.material}>
              {s.material} — {s.cantidadDisponible} {s.unidad ?? ""} disponibles
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className={labelClass} htmlFor="material_destino">
            Nombre con el que queda en el proyecto
          </label>
          <button
            type="button"
            onClick={pedirSugerencia}
            disabled={sugiriendo || !material}
            className={`${BTN_SECONDARY} shrink-0 whitespace-nowrap text-xs disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {sugiriendo ? "Consultando..." : "Sugerir con IA"}
          </button>
        </div>
        <input
          id="material_destino"
          name="material_destino"
          type="text"
          value={materialDestino}
          onChange={(e) => setMaterialDestino(e.target.value)}
          required
          className={inputClass}
        />
        {sugerencia?.tipo === "sin-match" && (
          <p className="mt-1.5 text-xs text-zinc-500">
            La IA no encontró un material del catálogo que corresponda con confianza — quedó como &quot;Otros&quot;,
            elige la etapa a mano.
          </p>
        )}
        {sugerencia?.tipo === "match" && (
          <p className="mt-1.5 text-xs text-brand-dark">
            La IA lo hizo calzar con &quot;{sugerencia.material}&quot; del catálogo
            {etapaElegida ? "" : " — esa etapa no está en el proyecto destino elegido, selecciónala a mano"}.
          </p>
        )}
      </div>

      <input type="hidden" name="unidad" value={stockMaterial?.unidad ?? ""} />

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
          onChange={(e) => {
            setProyectoDestino(e.target.value);
            setEtapaElegida("");
          }}
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
          <select
            id="etapa_id"
            name="etapa_id"
            value={etapaElegida || etapaPreseleccionada}
            onChange={(e) => setEtapaElegida(e.target.value)}
            required
            className={inputClass}
          >
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
