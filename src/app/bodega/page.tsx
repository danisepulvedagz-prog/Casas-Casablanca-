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
import { StockDisponible, type LoteConComprobante, type StockMaterialConLotes } from "@/app/bodega/stock-disponible";

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
    supabase.from("gastos").select("*").eq("proyecto_id", bodegaId).eq("categoria", "Material"),
    supabase.from("bodega_despachos").select("*").order("fecha", { ascending: false }),
    supabase.from("proyectos").select("id, nombre, modalidad").neq("modalidad", "Bodega").order("nombre"),
    supabase.from("catalogo_materiales").select("etapa_id, material"),
    supabase.from("catalogo_etapas").select("*"),
    supabase.from("proyecto_etapas").select("proyecto_id, etapa_id"),
  ]);

  const stock = calcularStockBodega(gastosBodega ?? []);

  // Cada lote de stock viene de una compra real (factura o transferencia) —
  // se buscan acá para poder mostrar "Ver foto" y "Editar" al lado de cada
  // material, igual que en la página de gastos de un proyecto normal.
  const facturaIds = [
    ...new Set(stock.flatMap((s) => s.lotes.flatMap((l) => (l.facturaId ? [l.facturaId] : [])))),
  ];
  const transferenciaIds = [
    ...new Set(stock.flatMap((s) => s.lotes.flatMap((l) => (l.transferenciaId ? [l.transferenciaId] : [])))),
  ];
  const [{ data: facturasLotes }, { data: transferenciasLotes }] = await Promise.all([
    facturaIds.length
      ? supabase.from("facturas").select("id, proveedor, n_documento, foto_url").in("id", facturaIds)
      : Promise.resolve({ data: [] as { id: string; proveedor: string | null; n_documento: string | null; foto_url: string | null }[] }),
    transferenciaIds.length
      ? supabase.from("transferencias").select("id, destinatario, n_operacion, foto_url").in("id", transferenciaIds)
      : Promise.resolve({ data: [] as { id: string; destinatario: string | null; n_operacion: string | null; foto_url: string | null }[] }),
  ]);

  const facturasPorId = new Map(
    await Promise.all(
      (facturasLotes ?? []).map(async (f) => [f.id, { ...f, fotoUrlFirmada: await crearUrlFirmada(f.foto_url) }] as const)
    )
  );
  const transferenciasPorId = new Map(
    await Promise.all(
      (transferenciasLotes ?? []).map(
        async (t) => [t.id, { ...t, fotoUrlFirmada: await crearUrlFirmada(t.foto_url) }] as const
      )
    )
  );

  const stockConLotes: StockMaterialConLotes[] = stock.map((s) => ({
    ...s,
    lotes: s.lotes.map((l): LoteConComprobante => {
      const factura = l.facturaId ? facturasPorId.get(l.facturaId) : undefined;
      const transferencia = l.transferenciaId ? transferenciasPorId.get(l.transferenciaId) : undefined;
      return {
        ...l,
        proveedor: factura?.proveedor ?? transferencia?.destinatario ?? null,
        nDocumento: factura?.n_documento ?? transferencia?.n_operacion ?? null,
        fotoUrlFirmada: factura?.fotoUrlFirmada ?? transferencia?.fotoUrlFirmada ?? null,
      };
    }),
  }));

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
        {stockConLotes.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay stock disponible — compra materiales para Bodega primero.</p>
        ) : (
          <StockDisponible stock={stockConLotes} bodegaId={bodegaId} />
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

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Historial de despachos</h2>
        <HistorialDespachos despachos={despachos} />
      </section>
    </div>
  );
}
