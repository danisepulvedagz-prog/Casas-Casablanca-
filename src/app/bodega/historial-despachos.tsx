"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { currencyFormatter, formatFecha } from "@/lib/format";
import { MultiSelectFiltro } from "@/components/multi-select-filtro";
import { LINK_MUTED } from "@/lib/ui";

export interface DespachoRow {
  id: string;
  fecha: string;
  material: string;
  cantidad: number;
  unidad: string | null;
  costoUnitario: number;
  proyectoDestinoId: string;
  proyectoDestinoNombre: string;
  gastoGeneradoId: string;
  registradoPor: string | null;
  notas: string | null;
}

const selectClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function HistorialDespachos({ despachos }: { despachos: DespachoRow[] }) {
  const [filtroMateriales, setFiltroMateriales] = useState<string[]>([]);
  const [filtroProyectos, setFiltroProyectos] = useState<string[]>([]);
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");

  const materiales = useMemo(
    () => Array.from(new Set(despachos.map((d) => d.material))).sort((a, b) => a.localeCompare(b, "es")),
    [despachos]
  );
  const proyectos = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const d of despachos) vistos.set(d.proyectoDestinoId, d.proyectoDestinoNombre);
    return Array.from(vistos.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [despachos]);

  const hayFiltrosActivos = !!(
    filtroMateriales.length ||
    filtroProyectos.length ||
    filtroFechaDesde ||
    filtroFechaHasta
  );

  const filtrados = useMemo(
    () =>
      despachos
        .filter(
          (d) =>
            (filtroMateriales.length === 0 || filtroMateriales.includes(d.material)) &&
            (filtroProyectos.length === 0 || filtroProyectos.includes(d.proyectoDestinoId)) &&
            (!filtroFechaDesde || d.fecha >= filtroFechaDesde) &&
            (!filtroFechaHasta || d.fecha <= filtroFechaHasta)
        )
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [despachos, filtroMateriales, filtroProyectos, filtroFechaDesde, filtroFechaHasta]
  );

  if (despachos.length === 0) {
    return <p className="text-sm text-zinc-500">Todavía no se ha despachado nada desde Bodega.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <MultiSelectFiltro
          placeholder="Todos los materiales"
          opciones={materiales.map((m) => ({ value: m, label: m }))}
          seleccionados={filtroMateriales}
          onChange={setFiltroMateriales}
        />
        <MultiSelectFiltro
          placeholder="Todos los proyectos"
          opciones={proyectos.map((p) => ({ value: p.id, label: p.nombre }))}
          seleccionados={filtroProyectos}
          onChange={setFiltroProyectos}
        />
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={filtroFechaDesde}
            onChange={(e) => setFiltroFechaDesde(e.target.value)}
            max={filtroFechaHasta || undefined}
            aria-label="Desde"
            className={selectClass}
          />
          <span className="text-sm text-zinc-400">–</span>
          <input
            type="date"
            value={filtroFechaHasta}
            onChange={(e) => setFiltroFechaHasta(e.target.value)}
            min={filtroFechaDesde || undefined}
            aria-label="Hasta"
            className={selectClass}
          />
        </div>
        {hayFiltrosActivos && (
          <button
            type="button"
            onClick={() => {
              setFiltroMateriales([]);
              setFiltroProyectos([]);
              setFiltroFechaDesde("");
              setFiltroFechaHasta("");
            }}
            className={LINK_MUTED}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <p className="mb-2 text-sm text-zinc-500">
        {filtrados.length} de {despachos.length} despacho{despachos.length === 1 ? "" : "s"}
      </p>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Material</th>
              <th className="px-4 py-3">Cantidad</th>
              <th className="px-4 py-3">Costo</th>
              <th className="px-4 py-3">Proyecto</th>
              <th className="px-4 py-3">Registró</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filtrados.map((d) => (
              <tr key={d.id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">{formatFecha(d.fecha)}</td>
                <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {d.material}
                  {d.notas && <p className="mt-0.5 text-xs font-normal text-zinc-500">{d.notas}</p>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                  {d.cantidad} {d.unidad ?? ""}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                  {currencyFormatter.format(d.cantidad * d.costoUnitario)}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{d.proyectoDestinoNombre}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{d.registradoPor ?? "—"}</td>
                <td className="px-4 py-3">
                  <Link href={`/proyectos/${d.proyectoDestinoId}/gastos/${d.gastoGeneradoId}/editar`} className={LINK_MUTED}>
                    Ver gasto
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
