"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { currencyFormatter, formatFecha } from "@/lib/format";
import { LINK_MUTED } from "@/lib/ui";

export interface GastoTablaRow {
  id: string;
  fecha: string;
  categoria: string;
  etapaNombre: string;
  material: string | null;
  cantidad: number | null;
  unidad: string | null;
  monto_total: number;
  proveedor: string | null;
  nDocumento: string | null;
  // factura_id / transferencia_id del gasto, o un id propio si es un gasto
  // suelto sin documento — agrupa los ítems que vienen del mismo comprobante.
  documentoKey: string;
  documentoTipo: "factura" | "transferencia" | "suelto";
  documentoId: string | null;
  fotoUrlFirmada: string | null;
  fotoPath: string | null;
}

const selectClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function esPdf(path: string | null) {
  return !!path && path.toLowerCase().endsWith(".pdf");
}

function MiniaturaComprobante({ path, url }: { path: string | null; url: string | null }) {
  if (!url) return <div className="h-10 w-10 shrink-0 rounded bg-zinc-100 dark:bg-zinc-800" />;
  if (esPdf(path)) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-zinc-100 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        PDF
      </div>
    );
  }
  return <img src={url} alt="Foto del comprobante" className="h-10 w-10 shrink-0 rounded object-cover" />;
}

export function GastosTabla({
  proyectoId,
  gastos,
  etapas,
  categorias,
}: {
  proyectoId: string;
  gastos: GastoTablaRow[];
  etapas: string[];
  categorias: string[];
}) {
  const [filtroEtapa, setFiltroEtapa] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroMaterial, setFiltroMaterial] = useState("");

  const hayFiltrosActivos = !!(filtroEtapa || filtroCategoria || filtroMaterial);

  // La lista de materiales del filtro depende de la etapa (y categoría)
  // elegida: solo muestra materiales que efectivamente existen ahí, para no
  // ofrecer opciones que siempre dan 0 resultados.
  const materialesDisponibles = useMemo(() => {
    const vistos = new Set(
      gastos
        .filter(
          (g) =>
            (!filtroEtapa || g.etapaNombre === filtroEtapa) &&
            (!filtroCategoria || g.categoria === filtroCategoria)
        )
        .map((g) => g.material)
        .filter((m): m is string => !!m)
    );
    return Array.from(vistos).sort((a, b) => a.localeCompare(b, "es"));
  }, [gastos, filtroEtapa, filtroCategoria]);

  // Si al cambiar etapa/categoría el material elegido deja de existir en la
  // nueva lista, se limpia — ajustado durante el render (no en un efecto)
  // siguiendo el patrón recomendado por React para estado derivado de props.
  const [materialesPrevios, setMaterialesPrevios] = useState(materialesDisponibles);
  if (materialesDisponibles !== materialesPrevios) {
    setMaterialesPrevios(materialesDisponibles);
    if (filtroMaterial && !materialesDisponibles.includes(filtroMaterial)) {
      setFiltroMaterial("");
    }
  }

  const filtrados = useMemo(
    () =>
      gastos.filter(
        (g) =>
          (!filtroEtapa || g.etapaNombre === filtroEtapa) &&
          (!filtroCategoria || g.categoria === filtroCategoria) &&
          (!filtroMaterial || g.material === filtroMaterial)
      ),
    [gastos, filtroEtapa, filtroCategoria, filtroMaterial]
  );

  // Se agrupan por documento (factura/transferencia) para poder desplegar
  // "qué comprobantes componen este material" — útil para pescar errores
  // (un monto que se ve raro, un ítem mal asignado, etc.) sin tener que
  // revisar cada gasto suelto por separado.
  const grupos = useMemo(() => {
    const mapa = new Map<string, GastoTablaRow[]>();
    for (const g of filtrados) {
      const lista = mapa.get(g.documentoKey) ?? [];
      lista.push(g);
      mapa.set(g.documentoKey, lista);
    }
    return Array.from(mapa.values())
      .map((items) => ({
        items,
        proveedor: items[0].proveedor,
        nDocumento: items[0].nDocumento,
        documentoTipo: items[0].documentoTipo,
        documentoId: items[0].documentoId,
        fotoUrlFirmada: items[0].fotoUrlFirmada,
        fotoPath: items[0].fotoPath,
        fechaMax: items.reduce((max, r) => (r.fecha > max ? r.fecha : max), items[0].fecha),
        total: items.reduce((s, r) => s + r.monto_total, 0),
      }))
      .sort((a, b) => b.fechaMax.localeCompare(a.fechaMax));
  }, [filtrados]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          value={filtroEtapa}
          onChange={(e) => setFiltroEtapa(e.target.value)}
          className={selectClass}
        >
          <option value="">Todas las etapas</option>
          {etapas.map((nombre) => (
            <option key={nombre} value={nombre}>
              {nombre}
            </option>
          ))}
        </select>
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className={selectClass}
        >
          <option value="">Todas las categorías</option>
          {categorias.map((categoria) => (
            <option key={categoria} value={categoria}>
              {categoria}
            </option>
          ))}
        </select>
        <select
          value={filtroMaterial}
          onChange={(e) => setFiltroMaterial(e.target.value)}
          className={selectClass}
        >
          <option value="">Todos los materiales</option>
          {materialesDisponibles.map((material) => (
            <option key={material} value={material}>
              {material}
            </option>
          ))}
        </select>
        {hayFiltrosActivos && (
          <button
            type="button"
            onClick={() => {
              setFiltroEtapa("");
              setFiltroCategoria("");
              setFiltroMaterial("");
            }}
            className="text-sm text-zinc-500 hover:text-brand hover:underline"
          >
            Limpiar filtros
          </button>
        )}
        <span className="text-sm text-zinc-500">
          {filtrados.length} de {gastos.length} gastos
        </span>
      </div>

      {filtrados.length === 0 && (
        <p className="text-sm text-zinc-500">No hay gastos que coincidan con el filtro.</p>
      )}

      {grupos.length > 0 && (
        <div className="grid gap-2">
          {grupos.map((grupo) => (
            <details
              key={grupo.items[0].documentoKey}
              open={hayFiltrosActivos}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800"
            >
              <summary className="cursor-pointer list-none px-4 py-3 select-none">
                <div className="flex items-center gap-4">
                  <MiniaturaComprobante path={grupo.fotoPath} url={grupo.fotoUrlFirmada} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                      {grupo.proveedor ?? "Proveedor sin nombre"}
                      {grupo.nDocumento ? ` · N° ${grupo.nDocumento}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatFecha(grupo.fechaMax)} · {grupo.items.length} ítem
                      {grupo.items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium text-zinc-900 dark:text-zinc-100">
                    {currencyFormatter.format(grupo.total)}
                  </p>
                </div>
              </summary>
              <div className="overflow-x-auto border-t border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">Categoría</th>
                      <th className="px-4 py-2">Etapa</th>
                      <th className="px-4 py-2">Material / concepto</th>
                      <th className="px-4 py-2">Cant.</th>
                      <th className="px-4 py-2">Monto bruto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {grupo.items.map((g) => (
                      <tr key={g.id} className="bg-white dark:bg-zinc-950">
                        <td className="px-4 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                          {formatFecha(g.fecha)}
                        </td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{g.categoria}</td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{g.etapaNombre}</td>
                        <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                          {g.material ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                          {g.cantidad ? `${g.cantidad} ${g.unidad ?? ""}` : "—"}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                          {currencyFormatter.format(g.monto_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {grupo.documentoTipo !== "suelto" && (
                <div className="flex items-center gap-4 border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
                  {grupo.fotoUrlFirmada && (
                    <a href={grupo.fotoUrlFirmada} target="_blank" rel="noreferrer" className={LINK_MUTED}>
                      Ver foto completa
                    </a>
                  )}
                  <Link
                    href={`/proyectos/${proyectoId}/gastos/${grupo.documentoTipo}/${grupo.documentoId}/editar`}
                    className={LINK_MUTED}
                  >
                    {grupo.documentoTipo === "factura" ? "Editar factura" : "Editar transferencia"}
                  </Link>
                </div>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
