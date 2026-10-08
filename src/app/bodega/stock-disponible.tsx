import Link from "next/link";
import { currencyFormatter, formatFecha } from "@/lib/format";
import { LINK_MUTED } from "@/lib/ui";
import type { LoteBodega, StockMaterial } from "@/lib/bodega";

const numberFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

export interface LoteConComprobante extends LoteBodega {
  proveedor: string | null;
  nDocumento: string | null;
  fotoUrlFirmada: string | null;
}

export interface StockMaterialConLotes extends Omit<StockMaterial, "lotes"> {
  lotes: LoteConComprobante[];
}

function editarHref(bodegaId: string, lote: LoteConComprobante): string {
  if (lote.facturaId) return `/proyectos/${bodegaId}/gastos/factura/${lote.facturaId}/editar`;
  if (lote.transferenciaId) return `/proyectos/${bodegaId}/gastos/transferencia/${lote.transferenciaId}/editar`;
  return `/proyectos/${bodegaId}/gastos/${lote.gastoId}/editar`;
}

export function StockDisponible({ stock, bodegaId }: { stock: StockMaterialConLotes[]; bodegaId: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-3">Material</th>
            <th className="px-4 py-3">Disponible</th>
            <th className="px-4 py-3">Costo promedio</th>
            <th className="px-4 py-3">Valor</th>
          </tr>
        </thead>
        {stock.map((s) => (
          <tbody key={s.material} className="divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            <tr className="bg-white dark:bg-zinc-950">
              <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{s.material}</td>
              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                {numberFormatter.format(s.cantidadDisponible)} {s.unidad ?? ""}
              </td>
              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                {currencyFormatter.format(s.costoPromedio)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                {currencyFormatter.format(s.cantidadDisponible * s.costoPromedio)}
              </td>
            </tr>
            <tr className="bg-zinc-50 dark:bg-zinc-900/40">
              <td colSpan={4} className="px-4 py-2">
                <p className="mb-1 text-xs text-zinc-500">
                  {s.lotes.length === 1 ? "Compra de origen:" : `${s.lotes.length} compras de origen:`}
                </p>
                <ul className="grid gap-1">
                  {s.lotes.map((lote) => (
                    <li
                      key={lote.gastoId}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400"
                    >
                      <span>{formatFecha(lote.fecha)}</span>
                      <span>
                        {numberFormatter.format(lote.cantidadRestante)} {s.unidad ?? ""}
                      </span>
                      {lote.proveedor && <span>{lote.proveedor}</span>}
                      {lote.nDocumento && <span>N° {lote.nDocumento}</span>}
                      {lote.fotoUrlFirmada && (
                        <a href={lote.fotoUrlFirmada} target="_blank" rel="noreferrer" className={LINK_MUTED}>
                          Ver foto completa
                        </a>
                      )}
                      <Link href={editarHref(bodegaId, lote)} className={LINK_MUTED}>
                        {lote.facturaId ? "Editar factura" : lote.transferenciaId ? "Editar transferencia" : "Editar"}
                      </Link>
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          </tbody>
        ))}
      </table>
    </div>
  );
}
