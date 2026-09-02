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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

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
        onClick={() => setAbierto((v) => !v)}
        className={`${selectClass} flex max-w-[220px] items-center gap-2`}
      >
        <span className="truncate">{etiqueta}</span>
        <span className="shrink-0 text-zinc-400">▾</span>
      </button>
      {abierto && (
        <div className="absolute z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-md border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {opciones.length === 0 && <p className="px-2 py-1 text-xs text-zinc-400">Sin opciones</p>}
          {opciones.map((op) => (
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
