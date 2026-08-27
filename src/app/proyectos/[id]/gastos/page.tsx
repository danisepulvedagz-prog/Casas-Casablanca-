import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { crearUrlFirmada } from "@/lib/storage";
import { GastosListado } from "@/app/proyectos/[id]/gastos/gastos-listado";
import { currencyFormatter } from "@/lib/format";
import { BTN_PRIMARY } from "@/lib/ui";
import type { Database } from "@/lib/supabase/types";

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];

export default async function GastosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proyecto } = await supabase
    .from("proyectos")
    .select("id, nombre, presupuesto_total")
    .eq("id", id)
    .single();

  if (!proyecto) notFound();

  const [{ data: gastos, error }, { data: etapas }] = await Promise.all([
    supabase.from("gastos").select("*").eq("proyecto_id", id).order("created_at", { ascending: false }),
    supabase.from("catalogo_etapas").select("id, nombre, orden"),
  ]);

  // Las facturas y transferencias ya no se buscan por su propio proyecto_id:
  // pueden estar repartidas entre varios proyectos, así que se derivan de
  // los factura_id/transferencia_id presentes en los gastos de ESTE
  // proyecto (que ya vienen filtrados).
  const facturaIds = [
    ...new Set((gastos ?? []).flatMap((g) => (g.factura_id ? [g.factura_id] : []))),
  ];
  const { data: facturas } = facturaIds.length
    ? await supabase
        .from("facturas")
        .select("*")
        .in("id", facturaIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const transferenciaIds = [
    ...new Set((gastos ?? []).flatMap((g) => (g.transferencia_id ? [g.transferencia_id] : []))),
  ];
  const { data: transferencias } = transferenciaIds.length
    ? await supabase
        .from("transferencias")
        .select("*")
        .in("id", transferenciaIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const totalGastado = (gastos ?? []).reduce((sum, g) => sum + g.monto_total, 0);

  const gastosPorFactura = new Map<string, Gasto[]>();
  const gastosPorTransferencia = new Map<string, Gasto[]>();
  const gastosSueltos: Gasto[] = [];
  for (const g of gastos ?? []) {
    if (g.factura_id) {
      const lista = gastosPorFactura.get(g.factura_id) ?? [];
      lista.push(g);
      gastosPorFactura.set(g.factura_id, lista);
    } else if (g.transferencia_id) {
      const lista = gastosPorTransferencia.get(g.transferencia_id) ?? [];
      lista.push(g);
      gastosPorTransferencia.set(g.transferencia_id, lista);
    } else {
      gastosSueltos.push(g);
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
  const gastosSueltosConFoto = await Promise.all(
    gastosSueltos.map(async (g) => ({ ...g, fotoUrlFirmada: await crearUrlFirmada(g.foto_boleta_url) }))
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-2">
        <Link href={`/proyectos/${id}`} className="text-sm text-zinc-500 hover:text-brand hover:underline">
          ← Volver a {proyecto.nombre}
        </Link>
      </div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Gastos — {proyecto.nombre}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Total gastado: {currencyFormatter.format(totalGastado)} de{" "}
            {currencyFormatter.format(proyecto.presupuesto_total)} presupuestado
          </p>
        </div>
        <Link href={`/proyectos/${id}/gastos/nuevo`} className={BTN_PRIMARY}>
          + Registrar gasto
        </Link>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          No se pudieron cargar los gastos: {error.message}
        </p>
      )}

      {!error && (gastos ?? []).length === 0 && (
        <p className="text-sm text-zinc-500">Todavía no hay gastos registrados para este proyecto.</p>
      )}

      {!error && (gastos ?? []).length > 0 && (
        <GastosListado
          proyectoId={id}
          facturas={facturasConFoto}
          transferencias={transferenciasConFoto}
          gastosSueltos={gastosSueltosConFoto}
          etapas={etapas ?? []}
        />
      )}
    </div>
  );
}
