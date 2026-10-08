import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { crearUrlFirmada } from "@/lib/storage";
import { calcularStockBodega } from "@/lib/bodega";
import { construirEtapasPorProyecto } from "@/lib/etapas";
import { currencyFormatter } from "@/lib/format";
import { BTN_SECONDARY } from "@/lib/ui";
import { despacharBodega, obtenerBodegaId } from "@/app/bodega/actions";
import { DespachoForm } from "@/app/bodega/despacho-form";
import { HistorialDespachos, type DespachoRow } from "@/app/bodega/historial-despachos";
import { ComprasBodega } from "@/app/bodega/compras-bodega";
import type { Database } from "@/lib/supabase/types";

const numberFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];

export default async function BodegaPage({
  searchParams,
}: {
  searchParams: Promise<{ despachado?: string; material?: string }>;
}) {
  const { despachado, material: materialInicial } = await searchParams;
  const supabase = await createClient();

  const bodegaId = await obtenerBodegaId(supabase);
  if (!bodegaId) notFound();

  const [
    { data: gastosBodega },
    { data: despachosRaw },
    { data: proyectos },
    { data: catalogoMateriales },
    { data: catalogoEtapas },
    { data: proyectoEtapas },
  ] = await Promise.all([
    supabase
      .from("gastos")
      .select("*")
      .eq("proyecto_id", bodegaId)
      .eq("categoria", "Material")
      .order("created_at", { ascending: false }),
    supabase.from("bodega_despachos").select("*").order("fecha", { ascending: false }),
    supabase.from("proyectos").select("id, nombre, modalidad").neq("modalidad", "Bodega").order("nombre"),
    supabase.from("catalogo_materiales").select("etapa_id, material"),
    supabase.from("catalogo_etapas").select("*"),
    supabase.from("proyecto_etapas").select("proyecto_id, etapa_id"),
  ]);

  const stock = calcularStockBodega(gastosBodega ?? []);

  // Las compras de Bodega se muestran agrupadas por factura/transferencia
  // (igual que en la página de gastos de un proyecto normal), para poder
  // ver foto, editar o eliminar cada una directo desde acá.
  const facturaIds = [...new Set((gastosBodega ?? []).flatMap((g) => (g.factura_id ? [g.factura_id] : [])))];
  const transferenciaIds = [
    ...new Set((gastosBodega ?? []).flatMap((g) => (g.transferencia_id ? [g.transferencia_id] : []))),
  ];
  const [{ data: facturas }, { data: transferencias }] = await Promise.all([
    facturaIds.length
      ? supabase.from("facturas").select("*").in("id", facturaIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    transferenciaIds.length
      ? supabase.from("transferencias").select("*").in("id", transferenciaIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const gastosPorFactura = new Map<string, Gasto[]>();
  const gastosPorTransferencia = new Map<string, Gasto[]>();
  for (const g of gastosBodega ?? []) {
    if (g.factura_id) {
      const lista = gastosPorFactura.get(g.factura_id) ?? [];
      lista.push(g);
      gastosPorFactura.set(g.factura_id, lista);
    } else if (g.transferencia_id) {
      const lista = gastosPorTransferencia.get(g.transferencia_id) ?? [];
      lista.push(g);
      gastosPorTransferencia.set(g.transferencia_id, lista);
    }
  }

  const facturasConFoto = await Promise.all(
    (facturas ?? []).map(async (f) => ({
      ...f,
      fotoUrlFirmada: await crearUrlFirmada(f.foto_url),
      items: gastosPorFactura.get(f.id) ?? [],
    }))
  );
  const transferenciasConFoto = await Promise.all(
    (transferencias ?? []).map(async (t) => ({
      ...t,
      fotoUrlFirmada: await crearUrlFirmada(t.foto_url),
      items: gastosPorTransferencia.get(t.id) ?? [],
    }))
  );

  const nombrePorProyecto = new Map((proyectos ?? []).map((p) => [p.id, p.nombre]));
  const despachos: DespachoRow[] = (despachosRaw ?? []).map((d) => ({
    id: d.id,
    fecha: d.fecha,
    material: d.material,
    cantidad: d.cantidad,
    unidad: d.unidad,
    costoUnitario: d.costo_unitario,
    proyectoDestinoId: d.proyecto_destino_id,
    proyectoDestinoNombre: nombrePorProyecto.get(d.proyecto_destino_id) ?? "Proyecto eliminado",
    gastoGeneradoId: d.gasto_generado_id,
    registradoPor: d.registrado_por,
    notas: d.notas,
  }));

  const etapasPorProyectoCompletas = construirEtapasPorProyecto(
    proyectos ?? [],
    catalogoEtapas ?? [],
    proyectoEtapas ?? []
  );
  const etapasPorProyecto: Record<string, { id: number; nombre: string; orden: number }[]> = {};
  for (const [pid, etapas] of Object.entries(etapasPorProyectoCompletas)) {
    etapasPorProyecto[pid] = etapas
      .map((e) => ({ id: e.id, nombre: e.nombre, orden: e.orden }))
      .sort((a, b) => a.orden - b.orden);
  }

  const montoTotalStock = stock.reduce((s, m) => s + m.cantidadDisponible * m.costoPromedio, 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Bodega</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Materiales comprados por adelantado, pendientes de repartir a los proyectos.
          </p>
        </div>
        {/* /gastos/nuevo (no la ruta por proyecto) porque esa sí está
            permitida para el rol "usuario" — así quien solo puede ver Bodega
            también puede comprar para ella sin chocar con el middleware. */}
        <Link href={`/gastos/nuevo?proyecto=${bodegaId}`} className={BTN_SECONDARY}>
          + Comprar para Bodega
        </Link>
      </div>

      {despachado && (
        <p className="mb-6 rounded-md bg-brand-tint px-3 py-2 text-sm text-brand-dark">Despacho guardado.</p>
      )}

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Stock disponible</h2>
          <p className="text-sm text-zinc-500">Valor en bodega: {currencyFormatter.format(montoTotalStock)}</p>
        </div>
        {stock.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay stock disponible — compra materiales para Bodega primero.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Material</th>
                  <th className="px-4 py-3">Disponible</th>
                  <th className="px-4 py-3">Costo promedio</th>
                  <th className="px-4 py-3">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {stock.map((s) => (
                  <tr key={s.material} className="bg-white dark:bg-zinc-950">
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Despachar a un proyecto</h2>
        <DespachoForm
          stock={stock}
          proyectos={(proyectos ?? []).map((p) => ({ id: p.id, nombre: p.nombre }))}
          catalogoMateriales={catalogoMateriales ?? []}
          etapasPorProyecto={etapasPorProyecto}
          materialInicial={materialInicial}
          action={despacharBodega}
        />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Compras registradas</h2>
        <ComprasBodega proyectoId={bodegaId} facturas={facturasConFoto} transferencias={transferenciasConFoto} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Historial de despachos</h2>
        <HistorialDespachos despachos={despachos} />
      </section>
    </div>
  );
}
