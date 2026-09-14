"use client";

import { startTransition, useActionState, useState } from "react";
import type { ActionState } from "@/app/proyectos/[id]/gastos/actions";
import { Combobox } from "@/components/combobox";
import {
  cambiosAlCambiarEtapa,
  materialesParaEtapa,
  necesitaElegirEtapa,
  validarEtapasOtros,
  type CatalogoMaterial,
} from "@/lib/materiales";
import type { Database } from "@/lib/supabase/types";
import { BTN_PRIMARY, SELECT_ETAPA_FALTANTE } from "@/lib/ui";

type Factura = Database["public"]["Tables"]["facturas"]["Row"];
type Gasto = Database["public"]["Tables"]["gastos"]["Row"];
type CatalogoEtapa = Database["public"]["Tables"]["catalogo_etapas"]["Row"];

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1";

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className={BTN_PRIMARY}>
      {pending ? "Guardando..." : "Guardar cambios"}
    </button>
  );
}

interface ItemEditable {
  key: string;
  id?: string;
  proyectoId: string;
  etapaId: string;
  material: string;
  cantidad: string;
  unidad: string;
  montoTotal: string;
  notas: string;
}

function gastoAItem(g: Gasto): ItemEditable {
  return {
    key: g.id,
    id: g.id,
    proyectoId: g.proyecto_id,
    etapaId: g.etapa_id != null ? String(g.etapa_id) : "",
    material: g.material ?? "",
    cantidad: g.cantidad != null ? String(g.cantidad) : "",
    unidad: g.unidad ?? "",
    montoTotal: String(g.monto_total),
    notas: g.notas ?? "",
  };
}

function nuevoItemVacio(proyectoId: string): ItemEditable {
  return {
    key: crypto.randomUUID(),
    proyectoId,
    etapaId: "",
    material: "",
    cantidad: "",
    unidad: "",
    montoTotal: "",
    notas: "",
  };
}

export function FacturaForm({
  action,
  factura,
  fotoUrlFirmada,
  gastos,
  proyectoId,
  proyectos,
  etapasPorProyecto,
  materiales,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  factura: Factura;
  fotoUrlFirmada: string | null;
  gastos: Gasto[];
  proyectoId: string;
  proyectos: { id: string; nombre: string }[];
  etapasPorProyecto: Record<string, CatalogoEtapa[]>;
  materiales: CatalogoMaterial[];
}) {
  // Se captura isPending del propio useActionState (en vez de useFormStatus)
  // porque el envío no pasa por action={...} en el <form> — ver el
  // comentario de handleSubmit más abajo.
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, {});
  const [items, setItems] = useState<ItemEditable[]>(gastos.map(gastoAItem));
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [errorEtapas, setErrorEtapas] = useState<string | null>(null);
  const error = errorEtapas ?? state.error;

  function actualizarItem(key: string, cambios: Partial<ItemEditable>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...cambios } : it)));
  }

  function eliminarItem(key: string) {
    setItems((prev) => {
      const item = prev.find((it) => it.key === key);
      if (item?.id) setDeletedIds((ids) => [...ids, item.id!]);
      return prev.filter((it) => it.key !== key);
    });
  }

  function handleEtapaChange(it: ItemEditable, nuevaEtapaId: string) {
    actualizarItem(it.key, {
      etapaId: nuevaEtapaId,
      ...cambiosAlCambiarEtapa(materiales, it.material, nuevaEtapaId),
    });
  }

  function handleProyectoChange(it: ItemEditable, nuevoProyectoId: string) {
    const etapasNuevoProyecto = etapasPorProyecto[nuevoProyectoId] ?? [];
    const etapaSigueValida = etapasNuevoProyecto.some((et) => String(et.id) === it.etapaId);
    actualizarItem(it.key, {
      proyectoId: nuevoProyectoId,
      etapaId: etapaSigueValida ? it.etapaId : "",
    });
  }

  function handleCantidadChange(it: ItemEditable, nuevaCantidad: string) {
    const cantidadAnterior = Number(it.cantidad);
    const montoAnterior = Number(it.montoTotal);
    const precioUnitario =
      cantidadAnterior > 0 && it.montoTotal !== "" ? montoAnterior / cantidadAnterior : null;
    const nuevoMonto =
      precioUnitario != null && nuevaCantidad
        ? String(Math.round(precioUnitario * Number(nuevaCantidad)))
        : it.montoTotal;
    actualizarItem(it.key, { cantidad: nuevaCantidad, montoTotal: nuevoMonto });
  }

  // Los campos de cabecera (proveedor, n° documento, fecha, monto, foto) van
  // sin controlar y se leen directo del <form> con FormData al enviar — solo
  // los ítems viven en estado de React. El <form> NO usa action={...}
  // directo: React 19 resetea el <form> a nivel del navegador apenas termina
  // esa acción (éxito o error, da lo mismo), y eso pisa los <select> de cada
  // ítem aunque estén controlados por React. Se arma el FormData a mano y se
  // llama a formAction() desde onSubmit para que eso nunca pase — así, si
  // falta elegir una etapa, la tabla queda exactamente como estaba.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const mensajeEtapas = validarEtapasOtros(
      items.map((it) => ({
        material: it.material,
        etapaId: it.etapaId,
        hayEtapasDisponibles: (etapasPorProyecto[it.proyectoId] ?? []).length > 0,
      }))
    );
    if (mensajeEtapas) {
      setErrorEtapas(mensajeEtapas);
      return;
    }
    setErrorEtapas(null);

    const formData = new FormData(e.currentTarget);
    formData.set(
      "items_json",
      JSON.stringify(
        items.map((it) => ({
          id: it.id,
          material: it.material,
          cantidad: it.cantidad ? Number(it.cantidad) : null,
          unidad: it.unidad || null,
          monto_total: Number(it.montoTotal) || 0,
          etapa_id: it.etapaId ? Number(it.etapaId) : null,
          proyecto_id: it.proyectoId,
          notas: it.notas || null,
        }))
      )
    );
    formData.set("deleted_ids_json", JSON.stringify(deletedIds));
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800">
        <div>
          <label className={labelClass} htmlFor="proveedor">
            Proveedor
          </label>
          <input id="proveedor" name="proveedor" defaultValue={factura.proveedor ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="n_documento">
            N° documento
          </label>
          <input
            id="n_documento"
            name="n_documento"
            defaultValue={factura.n_documento ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="fecha">
            Fecha
          </label>
          <input
            id="fecha"
            name="fecha"
            type="date"
            required
            defaultValue={factura.fecha}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="monto_total">
            Monto bruto total factura
          </label>
          <input
            id="monto_total"
            name="monto_total"
            type="number"
            step="1"
            min="0"
            defaultValue={factura.monto_total ?? ""}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="foto">
            Foto (opcional)
          </label>
          <input
            id="foto"
            name="foto"
            type="file"
            accept="image/*,application/pdf"
            className={`${inputClass} file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:text-zinc-700 dark:file:bg-zinc-800 dark:file:text-zinc-200`}
          />
          {fotoUrlFirmada && (
            <a
              href={fotoUrlFirmada}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-sm text-brand hover:underline"
            >
              Ver foto actual
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:hidden">
        {items.map((it) => {
          const etapasFila = etapasPorProyecto[it.proyectoId] ?? [];
          const materialesFila = materialesParaEtapa(materiales, it.etapaId);
          return (
            <div key={it.key} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="mb-3">
                <label className={labelClass}>Material</label>
                <Combobox
                  value={it.material}
                  onChange={(value) => {
                    const match = materialesFila.find(
                      (m) => m.material.trim().toLowerCase() === value.trim().toLowerCase()
                    );
                    actualizarItem(it.key, {
                      material: value,
                      ...(match ? { unidad: match.unidad_default } : {}),
                    });
                  }}
                  options={materialesFila.map((m) => m.material)}
                  className={inputClass}
                />
              </div>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Cant.</label>
                  <input
                    type="number"
                    value={it.cantidad}
                    onChange={(e) => handleCantidadChange(it, e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Unidad</label>
                  <input
                    value={it.unidad}
                    onChange={(e) => actualizarItem(it.key, { unidad: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className={labelClass}>Monto bruto</label>
                <input
                  type="number"
                  value={it.montoTotal}
                  onChange={(e) => actualizarItem(it.key, { montoTotal: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="mb-3">
                <label className={labelClass}>Proyecto</label>
                <select
                  value={it.proyectoId}
                  onChange={(e) => handleProyectoChange(it, e.target.value)}
                  className={inputClass}
                >
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className={labelClass}>Etapa</label>
                <select
                  value={it.etapaId}
                  onChange={(e) => handleEtapaChange(it, e.target.value)}
                  className={`${inputClass} ${necesitaElegirEtapa(it.material, it.etapaId, etapasFila.length > 0) ? SELECT_ETAPA_FALTANTE : ""}`}
                >
                  <option value="">Sin etapa</option>
                  {etapasFila.map((etapa) => (
                    <option key={etapa.id} value={etapa.id}>
                      {etapa.orden}. {etapa.nombre}
                    </option>
                  ))}
                </select>
                {necesitaElegirEtapa(it.material, it.etapaId, etapasFila.length > 0) && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    Elige a qué etapa pertenece este material.
                  </p>
                )}
              </div>
              <div className="mb-3">
                <label className={labelClass}>Notas</label>
                <input
                  value={it.notas}
                  placeholder="opcional"
                  onChange={(e) => actualizarItem(it.key, { notas: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => eliminarItem(it.key)}
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  Quitar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 sm:block dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Material</th>
              <th className="px-3 py-2">Cant.</th>
              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2">Monto bruto</th>
              <th className="px-3 py-2">Proyecto</th>
              <th className="px-3 py-2">Etapa</th>
              <th className="px-3 py-2">Notas</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {items.map((it) => {
              const etapasFila = etapasPorProyecto[it.proyectoId] ?? [];
              const materialesFila = materialesParaEtapa(materiales, it.etapaId);
              return (
                <tr key={it.key} className="bg-white dark:bg-zinc-950">
                  <td className="px-3 py-2">
                    <Combobox
                      value={it.material}
                      onChange={(value) => {
                        const match = materialesFila.find(
                          (m) => m.material.trim().toLowerCase() === value.trim().toLowerCase()
                        );
                        actualizarItem(it.key, {
                          material: value,
                          ...(match ? { unidad: match.unidad_default } : {}),
                        });
                      }}
                      options={materialesFila.map((m) => m.material)}
                      className={`${inputClass} min-w-[180px]`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={it.cantidad}
                      onChange={(e) => handleCantidadChange(it, e.target.value)}
                      className={`${inputClass} !w-24`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={it.unidad}
                      onChange={(e) => actualizarItem(it.key, { unidad: e.target.value })}
                      className={`${inputClass} !w-24`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={it.montoTotal}
                      onChange={(e) => actualizarItem(it.key, { montoTotal: e.target.value })}
                      className={`${inputClass} !w-40`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={it.proyectoId}
                      onChange={(e) => handleProyectoChange(it, e.target.value)}
                      className={`${inputClass} min-w-[180px]`}
                    >
                      {proyectos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={it.etapaId}
                      onChange={(e) => handleEtapaChange(it, e.target.value)}
                      className={`${inputClass} min-w-[220px] ${necesitaElegirEtapa(it.material, it.etapaId, etapasFila.length > 0) ? SELECT_ETAPA_FALTANTE : ""}`}
                    >
                      <option value="">Sin etapa</option>
                      {etapasFila.map((etapa) => (
                        <option key={etapa.id} value={etapa.id}>
                          {etapa.orden}. {etapa.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={it.notas}
                      placeholder="opcional"
                      onChange={(e) => actualizarItem(it.key, { notas: e.target.value })}
                      className={`${inputClass} min-w-[160px]`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => eliminarItem(it.key)}
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, nuevoItemVacio(proyectoId)])}
          className="text-sm text-brand hover:underline"
        >
          + Agregar ítem
        </button>
        <SubmitButton pending={isPending} />
      </div>
    </form>
  );
}
