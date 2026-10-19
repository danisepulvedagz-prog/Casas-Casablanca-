"use client";

import { useEffect, useRef, useState } from "react";

const selectClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

/**
 * Dropdown de selección múltiple (checkboxes) — mismo look que un <select>
 * simple, pero permite elegir varias opciones a la vez (ej. varias etapas o
 * materiales) en vez de una sola.
 */
export function MultiSelectFiltro({
  placeholder,
  opciones,
  seleccionados,
  onChange,
}: {
  placeholder: string;
  opciones: { value: string; label: string }[];
  seleccionados: string[];
  onChange: (valores: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const busquedaRef = useRef<HTMLInputElement>(null);

  function cerrar() {
    setAbierto(false);
    setBusqueda("");
  }

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar();
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  // El cursor queda listo para escribir y buscar apenas se abre.
  useEffect(() => {
    if (abierto) busquedaRef.current?.focus();
  }, [abierto]);

  const opcionesFiltradas = busqueda.trim()
    ? opciones.filter((op) => op.label.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : opciones;

  function toggle(valor: string) {
    onChange(
      seleccionados.includes(valor) ? seleccionados.filter((v) => v !== valor) : [...seleccionados, valor]
    );
  }

  const etiquetaPorValor = new Map(opciones.map((o) => [o.value, o.label]));
  const etiqueta =
    seleccionados.length === 0
      ? placeholder
      : seleccionados.length === 1
        ? (etiquetaPorValor.get(seleccionados[0]) ?? placeholder)
        : `${placeholder.replace(/^Tod[ao]s? l[ao]s? /i, "")} (${seleccionados.length})`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        className={`${selectClass} flex max-w-[220px] items-center gap-2`}
      >
        <span className="truncate">{etiqueta}</span>
        <span className="shrink-0 text-zinc-400">▾</span>
      </button>
      {abierto && (
        <div className="absolute z-20 mt-1 w-64 rounded-md border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {opciones.length > 5 && (
            <input
              ref={busquedaRef}
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar..."
              className="mb-2 w-full rounded border border-zinc-300 px-2 py-1 text-sm text-zinc-900 focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          )}
          <div className="max-h-56 overflow-y-auto">
            {opcionesFiltradas.length === 0 && (
              <p className="px-2 py-1 text-xs text-zinc-400">
                {opciones.length === 0 ? "Sin opciones" : "Sin resultados"}
              </p>
            )}
            {opcionesFiltradas.map((op) => (
              <label
                key={op.value}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <input
                  type="checkbox"
                  checked={seleccionados.includes(op.value)}
                  onChange={() => toggle(op.value)}
                />
                <span className="truncate">{op.label}</span>
              </label>
            ))}
          </div>
          {seleccionados.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-zinc-500 hover:text-brand hover:underline"
            >
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
