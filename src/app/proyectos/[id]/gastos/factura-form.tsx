"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/proyectos/[id]/gastos/actions";
import { materialesParaEtapa, type CatalogoMaterial } from "@/lib/materiales";
import type { Database } from "@/lib/supabase/types";
import { BTN_PRIMARY } from "@/lib/ui";

type Factura = Database["public"]["Tables"]["facturas"]["Row"];
type Gasto = Database["public"]["Tables"]["gastos"]["Row"];
type CatalogoEtapa = Database["public"]["Tables"]["catalogo_etapas"]["Row"];

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1";

function SubmitButton() {
  const { pending } = useFormStatus();
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
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [items, setItems] = useState<ItemEditable[]>(gastos.map(gastoAItem));
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

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

  function handleSubmit(formData: FormData) {
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
    return formAction(formData);
  }

  return (
    <form action={handleSubmit} className="grid gap-6">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
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
        <div className="col-span-2">
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

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
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
                    <input
                      value={it.material}
                      list={`materiales-list-${it.key}`}
                      onChange={(e) => {
                        const value = e.target.value;
                        const match = materialesFila.find(
                          (m) => m.material.trim().toLowerCase() === value.trim().toLowerCase()
                        );
                        actualizarItem(it.key, {
                          material: value,
                          ...(match ? { unidad: match.unidad_default } : {}),
                        });
                      }}
                      className={`${inputClass} min-w-[180px]`}
                    />
                    <datalist id={`materiales-list-${it.key}`}>
                      {materialesFila.map((m) => (
                        <option key={m.material} value={m.material} />
                      ))}
                    </datalist>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={it.cantidad}
                      onChange={(e) => {
                        const nuevaCantidad = e.target.value;
                        const cantidadAnterior = Number(it.cantidad);
                        const montoAnterior = Number(it.montoTotal);
                        const precioUnitario =
                          cantidadAnterior > 0 && it.montoTotal !== "" ? montoAnterior / cantidadAnterior : null;
                        const nuevoMonto =
                          precioUnitario != null && nuevaCantidad
                            ? String(Math.round(precioUnitario * Number(nuevaCantidad)))
                            : it.montoTotal;
                        actualizarItem(it.key, { cantidad: nuevaCantidad, montoTotal: nuevoMonto });
                      }}
                      className={`${inputClass} w-24`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={it.unidad}
                      onChange={(e) => actualizarItem(it.key, { unidad: e.target.value })}
                      className={`${inputClass} w-24`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={it.montoTotal}
                      onChange={(e) => actualizarItem(it.key, { montoTotal: e.target.value })}
                      className={`${inputClass} w-40`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={it.proyectoId}
                      onChange={(e) => {
                        const nuevoProyectoId = e.target.value;
                        const etapasNuevoProyecto = etapasPorProyecto[nuevoProyectoId] ?? [];
                        const etapaSigueValida = etapasNuevoProyecto.some((et) => String(et.id) === it.etapaId);
                        actualizarItem(it.key, {
                          proyectoId: nuevoProyectoId,
                          etapaId: etapaSigueValida ? it.etapaId : "",
                        });
                      }}
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
                      onChange={(e) =>
                        actualizarItem(it.key, { etapaId: e.target.value, material: "", unidad: "" })
                      }
                      className={`${inputClass} min-w-[220px]`}
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
        <SubmitButton />
      </div>
    </form>
  );
}
