"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DeleteGastoButton } from "@/app/proyectos/[id]/gastos/delete-gasto-button";
import { DeleteFacturaButton } from "@/app/proyectos/[id]/gastos/delete-factura-button";
import { DeleteTransferenciaButton } from "@/app/proyectos/[id]/gastos/delete-transferencia-button";
import { CATEGORIAS_GASTO, currencyFormatter, formatFecha } from "@/lib/format";
import { LINK_MUTED } from "@/lib/ui";
import { MultiSelectFiltro } from "@/components/multi-select-filtro";
import type { Database } from "@/lib/supabase/types";

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];
type FacturaConItems = Database["public"]["Tables"]["facturas"]["Row"] & {
  fotoUrlFirmada: string | null;
  items: Gasto[];
};
type TransferenciaConItems = Database["public"]["Tables"]["transferencias"]["Row"] & {
  fotoUrlFirmada: string | null;
  items: Gasto[];
};
type GastoSuelto = Gasto & { fotoUrlFirmada: string | null };

const selectClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function esPdf(path: string | null) {
  return !!path && path.toLowerCase().endsWith(".pdf");
}

function MiniaturaComprobante({ path, url }: { path: string | null; url: string | null }) {
  if (!url) return <div className="h-12 w-12 shrink-0 rounded bg-zinc-100 dark:bg-zinc-800" />;
  if (esPdf(path)) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-100 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        PDF
      </div>
    );
  }
  return <img src={url} alt="Foto del comprobante" className="h-12 w-12 shrink-0 rounded object-cover" />;
}

export function GastosListado({
  proyectoId,
  facturas,
  transferencias,
  gastosSueltos,
  etapas,
}: {
  proyectoId: string;
  facturas: FacturaConItems[];
  transferencias: TransferenciaConItems[];
  gastosSueltos: GastoSuelto[];
  etapas: { id: number; nombre: string; orden: number }[];
}) {
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [busquedaDocumento, setBusquedaDocumento] = useState("");
  const [filtroEtapas, setFiltroEtapas] = useState<string[]>([]);
  const [filtroCategorias, setFiltroCategorias] = useState<string[]>([]);
  const [filtroMateriales, setFiltroMateriales] = useState<string[]>([]);

  const nombreEtapa = useMemo(() => new Map(etapas.map((e) => [e.id, e.nombre])), [etapas]);

  const todosLosItems = useMemo(
    () => [...facturas.flatMap((f) => f.items), ...transferencias.flatMap((t) => t.items), ...gastosSueltos],
    [facturas, transferencias, gastosSueltos]
  );

  const etapasPresentes = useMemo(() => {
    const ids = new Set(todosLosItems.map((g) => g.etapa_id).filter((id): id is number => id != null));
    return etapas.filter((e) => ids.has(e.id)).sort((a, b) => a.orden - b.orden);
  }, [todosLosItems, etapas]);

  // La lista de materiales del filtro depende de las etapas (y categorías)
  // elegidas: solo muestra materiales que efectivamente existen ahí, para no
  // ofrecer opciones que siempre dan 0 resultados.
  const materialesPresentes = useMemo(() => {
    const vistos = new Set(
      todosLosItems
        .filter(
          (g) =>
            (filtroEtapas.length === 0 || filtroEtapas.includes(String(g.etapa_id ?? ""))) &&
            (filtroCategorias.length === 0 || filtroCategorias.includes(g.categoria))
        )
        .map((g) => g.material)
        .filter((m): m is string => !!m)
    );
    return Array.from(vistos).sort((a, b) => a.localeCompare(b, "es"));
  }, [todosLosItems, filtroEtapas, filtroCategorias]);

  // Si al cambiar etapas/categorías algún material elegido deja de existir en
  // la nueva lista, se saca — ajustado durante el render (no en un efecto)
  // siguiendo el patrón recomendado por React para estado derivado de props.
  const [materialesPrevios, setMaterialesPrevios] = useState(materialesPresentes);
  if (materialesPresentes !== materialesPrevios) {
    setMaterialesPrevios(materialesPresentes);
    const disponiblesSet = new Set(materialesPresentes);
    const siguen = filtroMateriales.filter((m) => disponiblesSet.has(m));
    if (siguen.length !== filtroMateriales.length) setFiltroMateriales(siguen);
  }

  const hayFiltrosActivos = !!(
    filtroProveedor ||
    busquedaDocumento.trim() ||
    filtroEtapas.length ||
    filtroCategorias.length ||
    filtroMateriales.length
  );

  function coincide(gasto: Gasto, proveedorCabecera: string | null, docCabecera: string | null) {
    if (filtroProveedor && !(proveedorCabecera ?? "").toLowerCase().includes(filtroProveedor.toLowerCase())) {
      return false;
    }
    if (
      busquedaDocumento.trim() &&
      !(docCabecera ?? "").toLowerCase().includes(busquedaDocumento.trim().toLowerCase())
    ) {
      return false;
    }
    if (filtroEtapas.length > 0 && !filtroEtapas.includes(String(gasto.etapa_id ?? ""))) return false;
    if (filtroCategorias.length > 0 && !filtroCategorias.includes(gasto.categoria)) return false;
    if (filtroMateriales.length > 0 && (!gasto.material || !filtroMateriales.includes(gasto.material))) {
      return false;
    }
    return true;
  }

  const facturasFiltradas = useMemo(
    () =>
      facturas
        .map((f) => ({ ...f, itemsFiltrados: f.items.filter((g) => coincide(g, f.proveedor, f.n_documento)) }))
        .filter((f) => f.itemsFiltrados.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facturas, filtroProveedor, busquedaDocumento, filtroEtapas, filtroCategorias, filtroMateriales]
  );

  const transferenciasFiltradas = useMemo(
    () =>
      transferencias
        .map((t) => ({
          ...t,
          itemsFiltrados: t.items.filter((g) => coincide(g, t.destinatario, t.n_operacion)),
        }))
        .filter((t) => t.itemsFiltrados.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transferencias, filtroProveedor, busquedaDocumento, filtroEtapas, filtroCategorias, filtroMateriales]
  );

  const gastosSueltosFiltrados = useMemo(
    () => gastosSueltos.filter((g) => coincide(g, g.proveedor, g.n_documento)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gastosSueltos, filtroProveedor, busquedaDocumento, filtroEtapas, filtroCategorias, filtroMateriales]
  );

  const totalItems = todosLosItems.length;
  const totalItemsFiltrados =
    facturasFiltradas.reduce((s, f) => s + f.itemsFiltrados.length, 0) +
    transferenciasFiltradas.reduce((s, t) => s + t.itemsFiltrados.length, 0) +
    gastosSueltosFiltrados.length;

  const totalMontoFiltrado =
    facturasFiltradas.reduce((s, f) => s + f.itemsFiltrados.reduce((s2, g) => s2 + g.monto_total, 0), 0) +
    transferenciasFiltradas.reduce((s, t) => s + t.itemsFiltrados.reduce((s2, g) => s2 + g.monto_total, 0), 0) +
    gastosSueltosFiltrados.reduce((s, g) => s + g.monto_total, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <input
          type="text"
          value={filtroProveedor}
          onChange={(e) => setFiltroProveedor(e.target.value)}
          placeholder="Buscar proveedor..."
          className={selectClass}
        />
        <input
          type="text"
          value={busquedaDocumento}
          onChange={(e) => setBusquedaDocumento(e.target.value)}
          placeholder="Buscar N° de documento..."
          className={selectClass}
        />
        <MultiSelectFiltro
          placeholder="Todas las etapas"
          opciones={etapasPresentes.map((etapa) => ({ value: String(etapa.id), label: etapa.nombre }))}
          seleccionados={filtroEtapas}
          onChange={setFiltroEtapas}
        />
        <MultiSelectFiltro
          placeholder="Material y Mano de Obra"
          opciones={CATEGORIAS_GASTO.map((categoria) => ({ value: categoria, label: categoria }))}
          seleccionados={filtroCategorias}
          onChange={setFiltroCategorias}
        />
        <MultiSelectFiltro
          placeholder="Todos los materiales"
          opciones={materialesPresentes.map((material) => ({ value: material, label: material }))}
          seleccionados={filtroMateriales}
          onChange={setFiltroMateriales}
        />
        {hayFiltrosActivos && (
          <button
            type="button"
            onClick={() => {
              setFiltroProveedor("");
              setBusquedaDocumento("");
              setFiltroEtapas([]);
              setFiltroCategorias([]);
              setFiltroMateriales([]);
            }}
            className={LINK_MUTED}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">
          {hayFiltrosActivos ? "Total filtrado" : "Total de gastos"} · {totalItemsFiltrados} de {totalItems}{" "}
          ítem{totalItems === 1 ? "" : "s"}
        </p>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {currencyFormatter.format(totalMontoFiltrado)}
        </p>
      </div>

      {hayFiltrosActivos && totalItemsFiltrados === 0 && (
        <p className="text-sm text-zinc-500">No hay gastos que coincidan con el filtro.</p>
      )}

      {facturasFiltradas.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Facturas</h2>
          <div className="grid gap-3">
            {facturasFiltradas.map((factura) => {
              const items = factura.itemsFiltrados;
              const sinFiltrar = items.length === factura.items.length;
              const totalFactura = items.reduce((s, g) => s + g.monto_total, 0);
              const esCompartida =
                sinFiltrar &&
                factura.monto_total != null &&
                Math.abs(factura.monto_total - totalFactura) > 0.5;
              return (
                <details
                  key={factura.id}
                  open={hayFiltrosActivos}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800"
                >
                  <summary className="cursor-pointer list-none px-4 py-3 select-none">
                    <div className="flex items-center gap-4">
                      <MiniaturaComprobante path={factura.foto_url} url={factura.fotoUrlFirmada} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                          {factura.proveedor ?? "Proveedor sin nombre"}
                          {factura.n_documento ? ` · N° ${factura.n_documento}` : ""}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {formatFecha(factura.fecha)} · {items.length} ítem{items.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {currencyFormatter.format(totalFactura)}
                        </p>
                        {esCompartida && (
                          <p className="text-xs text-zinc-500">
                            factura completa: {currencyFormatter.format(factura.monto_total!)}
                          </p>
                        )}
                      </div>
                    </div>
                  </summary>
                  <div className="border-t border-zinc-200 dark:border-zinc-800">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                          <tr>
                            <th className="px-4 py-2">Etapa</th>
                            <th className="px-4 py-2">Material</th>
                            <th className="px-4 py-2">Cant.</th>
                            <th className="px-4 py-2">Monto bruto</th>
                            <th className="px-4 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {items.map((gasto) => (
                            <tr key={gasto.id} className="bg-white dark:bg-zinc-950">
                              <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                                {(gasto.etapa_id && nombreEtapa.get(gasto.etapa_id)) ?? "—"}
                              </td>
                              <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                                {gasto.material ?? "—"}
                                {gasto.notas && (
                                  <p className="mt-0.5 text-xs font-normal text-zinc-500">{gasto.notas}</p>
                                )}
                              </td>
                              <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                                {gasto.cantidad ? `${gasto.cantidad} ${gasto.unidad ?? ""}` : "—"}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                                {currencyFormatter.format(gasto.monto_total)}
                              </td>
                              <td className="px-4 py-2">
                                <DeleteGastoButton
                                  proyectoId={proyectoId}
                                  gastoId={gasto.id}
                                  descripcion={gasto.material ?? gasto.categoria}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2">
                      <div className="flex items-center gap-4">
                        {factura.fotoUrlFirmada && (
                          <a
                            href={factura.fotoUrlFirmada}
                            target="_blank"
                            rel="noreferrer"
                            className={LINK_MUTED}
                          >
                            Ver foto completa
                          </a>
                        )}
                        <Link
                          href={`/proyectos/${proyectoId}/gastos/factura/${factura.id}/editar`}
                          className={LINK_MUTED}
                        >
                          Editar factura
                        </Link>
                      </div>
                      <DeleteFacturaButton
                        proyectoId={proyectoId}
                        facturaId={factura.id}
                        descripcion={factura.proveedor ?? "sin proveedor"}
                        cantidadItems={factura.items.length}
                      />
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}

      {transferenciasFiltradas.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Transferencias</h2>
          <div className="grid gap-3">
            {transferenciasFiltradas.map((transferencia) => {
              const items = transferencia.itemsFiltrados;
              const sinFiltrar = items.length === transferencia.items.length;
              const totalTransferencia = items.reduce((s, g) => s + g.monto_total, 0);
              const esCompartida =
                sinFiltrar &&
                transferencia.monto_total != null &&
                Math.abs(transferencia.monto_total - totalTransferencia) > 0.5;
              return (
                <details
                  key={transferencia.id}
                  open={hayFiltrosActivos}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800"
                >
                  <summary className="cursor-pointer list-none px-4 py-3 select-none">
                    <div className="flex items-center gap-4">
                      <MiniaturaComprobante path={transferencia.foto_url} url={transferencia.fotoUrlFirmada} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                          {transferencia.destinatario ?? "Destinatario sin nombre"}
                          {transferencia.n_operacion ? ` · N° ${transferencia.n_operacion}` : ""}
                        </p>
                        <p className="text-xs text-zinc-500">{formatFecha(transferencia.fecha)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {currencyFormatter.format(totalTransferencia)}
                        </p>
                        {esCompartida && (
                          <p className="text-xs text-zinc-500">
                            transferencia completa: {currencyFormatter.format(transferencia.monto_total!)}
                          </p>
                        )}
                      </div>
                    </div>
                  </summary>
                  <div className="border-t border-zinc-200 dark:border-zinc-800">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                          <tr>
                            <th className="px-4 py-2">Categoría</th>
                            <th className="px-4 py-2">Etapa</th>
                            <th className="px-4 py-2">Material</th>
                            <th className="px-4 py-2">Monto bruto</th>
                            <th className="px-4 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {items.map((gasto) => (
                            <tr key={gasto.id} className="bg-white dark:bg-zinc-950">
                              <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{gasto.categoria}</td>
                              <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                                {(gasto.etapa_id && nombreEtapa.get(gasto.etapa_id)) ?? "—"}
                              </td>
                              <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                                {gasto.material ?? "—"}
                                {gasto.notas && (
                                  <p className="mt-0.5 text-xs font-normal text-zinc-500">{gasto.notas}</p>
                                )}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                                {currencyFormatter.format(gasto.monto_total)}
                              </td>
                              <td className="px-4 py-2">
                                <DeleteGastoButton
                                  proyectoId={proyectoId}
                                  gastoId={gasto.id}
                                  descripcion={gasto.material ?? gasto.categoria}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2">
                      <div className="flex items-center gap-4">
                        {transferencia.fotoUrlFirmada && (
                          <a
                            href={transferencia.fotoUrlFirmada}
                            target="_blank"
                            rel="noreferrer"
                            className={LINK_MUTED}
                          >
                            Ver foto completa
                          </a>
                        )}
                        <Link
                          href={`/proyectos/${proyectoId}/gastos/transferencia/${transferencia.id}/editar`}
                          className={LINK_MUTED}
                        >
                          Editar transferencia
                        </Link>
                      </div>
                      <DeleteTransferenciaButton
                        proyectoId={proyectoId}
                        transferenciaId={transferencia.id}
                        descripcion={transferencia.destinatario ?? "sin destinatario"}
                      />
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}

      {gastosSueltosFiltrados.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Otros gastos (Mano de Obra y materiales sueltos)
          </h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Etapa</th>
                  <th className="px-4 py-3">Material / concepto</th>
                  <th className="px-4 py-3">Cant.</th>
                  <th className="px-4 py-3">Monto bruto</th>
                  <th className="px-4 py-3">Foto</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {gastosSueltosFiltrados.map((gasto) => (
                  <tr key={gasto.id} className="bg-white dark:bg-zinc-950">
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {formatFecha(gasto.fecha)}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{gasto.categoria}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {(gasto.etapa_id && nombreEtapa.get(gasto.etapa_id)) ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      {gasto.material ?? gasto.proveedor ?? "—"}
                      {gasto.notas && <p className="mt-0.5 text-xs font-normal text-zinc-500">{gasto.notas}</p>}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {gasto.cantidad ? `${gasto.cantidad} ${gasto.unidad ?? ""}` : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {currencyFormatter.format(gasto.monto_total)}
                    </td>
                    <td className="px-4 py-3">
                      {gasto.fotoUrlFirmada ? (
                        <a href={gasto.fotoUrlFirmada} target="_blank" rel="noreferrer" className={LINK_MUTED}>
                          Ver
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link href={`/proyectos/${proyectoId}/gastos/${gasto.id}/editar`} className={LINK_MUTED}>
                          Editar
                        </Link>
                        <DeleteGastoButton
                          proyectoId={proyectoId}
                          gastoId={gasto.id}
                          descripcion={gasto.material ?? gasto.categoria}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
