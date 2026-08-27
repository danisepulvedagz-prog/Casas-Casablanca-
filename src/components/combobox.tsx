"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reemplaza <input list> + <datalist>: Safari/iOS prácticamente no muestra
 * el listado nativo de sugerencias (no aparece nada al tocar el campo), así
 * que se arma el dropdown a mano. Se posiciona con position:fixed medido
 * desde el input en vez de depender del flujo normal, para que no quede
 * recortado por contenedores con overflow (ej. la tabla de ítems con scroll
 * horizontal).
 */
export function Combobox({
  value,
  onChange,
  options,
  className,
  placeholder,
  id,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  className?: string;
  placeholder?: string;
  id?: string;
  name?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtradas = value.trim()
    ? options.filter((o) => o.toLowerCase().includes(value.trim().toLowerCase()))
    : options;

  function abrir() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom, left: rect.left, width: rect.width });
    setAbierto(true);
  }

  useEffect(() => {
    if (!abierto) return;
    function onClickFuera(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, [abierto]);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          abrir();
        }}
        onFocus={abrir}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {abierto && filtradas.length > 0 && coords && (
        <ul
          style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
          className="z-50 max-h-56 overflow-y-auto rounded-md border border-zinc-300 bg-white text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {filtradas.map((opcion) => (
            <li key={opcion}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(opcion);
                  setAbierto(false);
                }}
                className="block w-full px-3 py-2 text-left text-zinc-900 hover:bg-brand-tint dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {opcion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
