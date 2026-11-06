"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { currencyFormatter, formatFecha } from "@/lib/format";

const numberFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export type CompraMaterial = {
  material: string;
  cantidad: number | null;
  unidad: string | null;
  costoUnitario: number;
  montoTotal: number;
  proveedor: string | null;
  fecha: string;
  proyectoNombre: string;
};

export function ComparadorPrecios({ compras }: { compras: CompraMaterial[] }) {
  // Agrupa sin importar mayúsculas/espacios (por si el mismo material quedó
  // escrito distinto en compras distintas) y usa como etiqueta la forma en
  // que más veces se escribió.
  const { opciones, comprasPorClave } = useMemo(() => {
    const porClave = new Map<string, CompraMaterial[]>();
    const conteoNombre = new Map<string, Map<string, number>>();
    for (const c of compras) {
      const clave = c.material.trim().toLowerCase();
      if (!porClave.has(clave)) porClave.set(clave, []);
      porClave.get(clave)!.push(c);

      const conteos = conteoNombre.get(clave) ?? new Map<string, number>();
      conteos.set(c.material, (conteos.get(c.material) ?? 0) + 1);
      conteoNombre.set(clave, conteos);
    }
    const opciones = Array.from(porClave.keys())
      .map((clave) => {
        const conteos = conteoNombre.get(clave)!;
        const nombreMasUsado = [...conteos.entries()].sort((a, b) => b[1] - a[1])[0][0];
        return { value: clave, label: nombreMasUsado };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
    return { opciones, comprasPorClave: porClave };
  }, [compras]);

  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const comprasDelMaterial = useMemo(() => {
    if (!seleccionado) return [];
    return [...(comprasPorClave.get(seleccionado) ?? [])].sort((a, b) => a.costoUnitario - b.costoUnitario);
  }, [seleccionado, comprasPorClave]);

  const costoMinimo = comprasDelMaterial.length > 0 ? comprasDelMaterial[0].costoUnitario : null;
  const costoPromedio =
    comprasDelMaterial.length > 0
      ? comprasDelMaterial.reduce((s, c) => s + c.costoUnitario, 0) / comprasDelMaterial.length
      : null;

  return (
    <div>
      <div className="mb-6">
        <SelectorMaterial opciones={opciones} seleccionado={seleccionado} onChange={setSeleccionado} />
      </div>

      {!seleccionado ? (
        <p className="text-sm text-zinc-500">Elige un material para ver todas sus compras.</p>
      ) : comprasDelMaterial.length === 0 ? (
        <p className="text-sm text-zinc-500">No hay compras registradas para este material.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            <span>
              {comprasDelMaterial.length} compra{comprasDelMaterial.length === 1 ? "" : "s"}
            </span>
            <span>
              Más barato:{" "}
              <strong className="text-brand-dark dark:text-emerald-300">{currencyFormatter.format(costoMinimo!)}</strong>
            </span>
            <span>Promedio: {currencyFormatter.format(costoPromedio!)}</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2">Proyecto</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2 text-right">Costo unitario</th>
                  <th className="px-3 py-2 text-right">Monto total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {comprasDelMaterial.map((c, i) => (
                  <tr key={i} className={c.costoUnitario === costoMinimo ? "bg-brand-tint" : undefined}>
                    <td className="px-3 py-2">{c.proveedor ?? "—"}</td>
                    <td className="px-3 py-2">{c.proyectoNombre}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatFecha(c.fecha)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      {c.cantidad != null ? `${numberFormatter.format(c.cantidad)} ${c.unidad ?? ""}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{currencyFormatter.format(c.costoUnitario)}</td>
                    <td className="px-3 py-2 text-right">{currencyFormatter.format(c.montoTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SelectorMaterial({
  opciones,
  seleccionado,
  onChange,
}: {
  opciones: { value: string; label: string }[];
  seleccionado: string | null;
  onChange: (valor: string) => void;
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

  useEffect(() => {
    if (abierto) busquedaRef.current?.focus();
  }, [abierto]);

  const opcionesFiltradas = busqueda.trim()
    ? opciones.filter((o) => o.label.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : opciones;

  const etiqueta = opciones.find((o) => o.value === seleccionado)?.label ?? "Elige un material...";

  return (
    <div ref={ref} className="relative">
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Material</label>
      <button
        type="button"
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        className={`${inputClass} flex w-72 items-center justify-between gap-2`}
      >
        <span className={`truncate ${seleccionado ? "" : "text-zinc-400"}`}>{etiqueta}</span>
        <span className="shrink-0 text-zinc-400">▾</span>
      </button>
      {abierto && (
        <div className="absolute z-20 mt-1 w-72 rounded-md border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <input
            ref={busquedaRef}
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar material..."
            className={`${inputClass} mb-2 w-full`}
          />
          <div className="max-h-64 overflow-y-auto">
            {opcionesFiltradas.length === 0 && (
              <p className="px-2 py-1 text-xs text-zinc-400">
                {opciones.length === 0 ? "No hay materiales registrados" : "Sin resultados"}
              </p>
            )}
            {opcionesFiltradas.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  cerrar();
                }}
                className={`block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  o.value === seleccionado ? "bg-brand-tint text-brand-dark dark:text-emerald-300" : ""
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
