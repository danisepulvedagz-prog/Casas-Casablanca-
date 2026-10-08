"use client";

import Link from "next/link";
import { DeleteGastoButton } from "@/app/proyectos/[id]/gastos/delete-gasto-button";
import { DeleteFacturaButton } from "@/app/proyectos/[id]/gastos/delete-factura-button";
import { DeleteTransferenciaButton } from "@/app/proyectos/[id]/gastos/delete-transferencia-button";
import { currencyFormatter, formatFecha } from "@/lib/format";
import { LINK_MUTED } from "@/lib/ui";
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

/**
 * Lista las compras de Bodega agrupadas por factura/transferencia, con el
 * mismo diseño que la página de gastos de un proyecto normal (ver
 * GastosListado) — pero sin columna de Etapa, porque en Bodega nunca se
 * asigna etapa al comprar (se elige recién al despachar a un proyecto).
 */
export function ComprasBodega({
  proyectoId,
  facturas,
  transferencias,
}: {
  proyectoId: string;
  facturas: FacturaConItems[];
  transferencias: TransferenciaConItems[];
}) {
  if (facturas.length === 0 && transferencias.length === 0) {
    return <p className="text-sm text-zinc-500">Todavía no hay compras registradas para Bodega.</p>;
  }

  return (
    <div className="grid gap-3">
      {facturas.map((factura) => {
        const totalFactura = factura.items.reduce((s, g) => s + g.monto_total, 0);
        const esCompartida = factura.monto_total != null && Math.abs(factura.monto_total - totalFactura) > 0.5;
        return (
          <details key={factura.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <summary className="cursor-pointer list-none px-4 py-3 select-none">
              <div className="flex items-center gap-4">
                <MiniaturaComprobante path={factura.foto_url} url={factura.fotoUrlFirmada} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {factura.proveedor ?? "Proveedor sin nombre"}
                    {factura.n_documento ? ` · N° ${factura.n_documento}` : ""}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatFecha(factura.fecha)} · {factura.items.length} ítem{factura.items.length === 1 ? "" : "s"}
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
                      <th className="px-4 py-2">Material</th>
                      <th className="px-4 py-2">Cant.</th>
                      <th className="px-4 py-2">Monto bruto</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {factura.items.map((gasto) => (
                      <tr key={gasto.id} className="bg-white dark:bg-zinc-950">
                        <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                          {gasto.material ?? "—"}
                          {gasto.notas && <p className="mt-0.5 text-xs font-normal text-zinc-500">{gasto.notas}</p>}
                        </td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                          {gasto.cantidad ? `${gasto.cantidad} ${gasto.unidad ?? ""}` : "—"}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                          {currencyFormatter.format(gasto.monto_total)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3 whitespace-nowrap">
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
              <div className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-4">
                  {factura.fotoUrlFirmada && (
                    <a href={factura.fotoUrlFirmada} target="_blank" rel="noreferrer" className={LINK_MUTED}>
                      Ver foto completa
                    </a>
                  )}
                  <Link href={`/proyectos/${proyectoId}/gastos/factura/${factura.id}/editar`} className={LINK_MUTED}>
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

      {transferencias.map((transferencia) => {
        const totalTransferencia = transferencia.items.reduce((s, g) => s + g.monto_total, 0);
        const esCompartida =
          transferencia.monto_total != null && Math.abs(transferencia.monto_total - totalTransferencia) > 0.5;
        return (
          <details key={transferencia.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800">
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
                      <th className="px-4 py-2">Material</th>
                      <th className="px-4 py-2">Cant.</th>
                      <th className="px-4 py-2">Monto bruto</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {transferencia.items.map((gasto) => (
                      <tr key={gasto.id} className="bg-white dark:bg-zinc-950">
                        <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                          {gasto.material ?? "—"}
                          {gasto.notas && <p className="mt-0.5 text-xs font-normal text-zinc-500">{gasto.notas}</p>}
                        </td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                          {gasto.cantidad ? `${gasto.cantidad} ${gasto.unidad ?? ""}` : "—"}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                          {currencyFormatter.format(gasto.monto_total)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3 whitespace-nowrap">
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
              <div className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-4">
                  {transferencia.fotoUrlFirmada && (
                    <a href={transferencia.fotoUrlFirmada} target="_blank" rel="noreferrer" className={LINK_MUTED}>
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
  );
}
