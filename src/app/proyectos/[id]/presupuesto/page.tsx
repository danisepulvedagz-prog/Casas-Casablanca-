import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { crearUrlFirmada } from "@/lib/storage";
import { CATEGORIAS_GASTO, currencyFormatter } from "@/lib/format";
import { etapasDeckAExcluir, modalidadesIncluidas } from "@/lib/etapas";
import { calcularRatiosManoObraPorEtapa, calcularRatiosPromedio, estimar } from "@/lib/calculadora-m2";
import { GastoPorEtapaChart } from "@/app/proyectos/[id]/presupuesto/gasto-por-etapa-chart";
import { GastoPorCategoriaChart } from "@/app/proyectos/[id]/presupuesto/gasto-por-categoria-chart";
import { GastosTabla, type GastoTablaRow } from "@/app/proyectos/[id]/presupuesto/gastos-tabla";
import type { Database } from "@/lib/supabase/types";

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];

export default async function PresupuestoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proyecto } = await supabase
    .from("proyectos")
    .select("id, nombre, modalidad, presupuesto_total, m2, n_banos")
    .eq("id", id)
    .single();

  if (!proyecto) notFound();

  const { data: catalogoEtapasRaw } = await supabase
    .from("catalogo_etapas")
    .select("id, nombre, orden, modalidad")
    .in("modalidad", modalidadesIncluidas(proyecto.modalidad))
    .order("orden");
  // Etapas que existen con el mismo nombre en más de una modalidad (ej. el
  // deck: "Deck (opcional)" en Obra Gruesa, "Deck exterior" en Llave en
  // Mano) solo deben aparecer una vez — la de la modalidad propia del
  // proyecto — igual que al armar las etapas del proyecto (ver etapas.ts).
  const excluirDeck = etapasDeckAExcluir(catalogoEtapasRaw ?? [], proyecto.modalidad);
  const catalogoEtapas = (catalogoEtapasRaw ?? []).filter((e) => !excluirDeck.has(e.id));
  const etapaIds = catalogoEtapas.map((e) => e.id);

  const [{ data: gastos, error }, { data: catalogoMateriales }] = await Promise.all([
    supabase.from("gastos").select("*").eq("proyecto_id", id),
    supabase
      .from("catalogo_materiales")
      .select("*")
      .in("etapa_id", etapaIds.length > 0 ? etapaIds : [-1]),
  ]);

  const etapaPorId = new Map((catalogoEtapas ?? []).map((e) => [e.id, e]));
  const gastosLista = gastos ?? [];

  // Presupuesto teórico por etapa, separado por Material y Mano de Obra:
  // promedio de proyectos Terminados (misma lógica que "presupuesto
  // sugerido" y las alertas de compra), agrupado por etapa en vez de un
  // solo total. Material escala por el ratio de cada material (m²/baños);
  // Mano de Obra no tiene "material" que la identifique, así que escala
  // directo por m² del monto gastado en cada etapa.
  const { data: proyectosTerminados } = await supabase
    .from("proyectos")
    .select("id, m2, n_banos")
    .eq("estado", "Terminado")
    .neq("id", id);

  const teoricoMaterialPorEtapaId = new Map<number, number>();
  const teoricoManoObraPorEtapaId = new Map<number, number>();
  if (proyectosTerminados && proyectosTerminados.length > 0) {
    const { data: gastosTerminados } = await supabase
      .from("gastos")
      .select("*")
      .in(
        "proyecto_id",
        proyectosTerminados.map((p) => p.id)
      );

    const gastosMaterialPorProyecto = new Map<string, Gasto[]>();
    const gastosManoObraPorProyecto = new Map<string, Gasto[]>();
    for (const g of gastosTerminados ?? []) {
      if (g.categoria === "Material") {
        const lista = gastosMaterialPorProyecto.get(g.proyecto_id) ?? [];
        lista.push(g);
        gastosMaterialPorProyecto.set(g.proyecto_id, lista);
      } else if (g.categoria === "Mano de Obra") {
        const lista = gastosManoObraPorProyecto.get(g.proyecto_id) ?? [];
        lista.push(g);
        gastosManoObraPorProyecto.set(g.proyecto_id, lista);
      }
    }

    const proyectosConMaterial = proyectosTerminados.filter((p) => gastosMaterialPorProyecto.has(p.id));
    if (proyectosConMaterial.length > 0) {
      const ratios = calcularRatiosPromedio(
        proyectosConMaterial,
        gastosMaterialPorProyecto,
        catalogoMateriales ?? []
      );
      const estimaciones = estimar(ratios, proyecto.m2, proyecto.n_banos);

      const etapaIdPorMaterial = new Map<string, number>();
      for (const cm of catalogoMateriales ?? []) {
        if (cm.etapa_id != null) etapaIdPorMaterial.set(cm.material.trim().toLowerCase(), cm.etapa_id);
      }

      for (const est of estimaciones) {
        const etapaId = etapaIdPorMaterial.get(est.material.trim().toLowerCase());
        if (etapaId == null) continue;
        teoricoMaterialPorEtapaId.set(
          etapaId,
          (teoricoMaterialPorEtapaId.get(etapaId) ?? 0) + est.costoEstimado
        );
      }
    }

    const proyectosConManoObra = proyectosTerminados.filter((p) => gastosManoObraPorProyecto.has(p.id));
    if (proyectosConManoObra.length > 0) {
      const ratiosManoObra = calcularRatiosManoObraPorEtapa(proyectosConManoObra, gastosManoObraPorProyecto);
      for (const [etapaId, r] of ratiosManoObra) {
        teoricoManoObraPorEtapaId.set(etapaId, r.ratioCostoPorM2 * proyecto.m2);
      }
    }
  }

  const totalGastado = gastosLista.reduce((sum, g) => sum + g.monto_total, 0);
  const restante = proyecto.presupuesto_total - totalGastado;
  const pctUsado =
    proyecto.presupuesto_total > 0 ? Math.round((totalGastado / proyecto.presupuesto_total) * 100) : 0;

  // Para poder desplegar "qué facturas/transferencias componen este material"
  // en la tabla de detalle, se resuelve el proveedor real desde la cabecera
  // del documento (factura o transferencia) — gasto.proveedor solo se llena
  // en gastos sueltos sin documento asociado.
  const facturaIds = [...new Set(gastosLista.flatMap((g) => (g.factura_id ? [g.factura_id] : [])))];
  const transferenciaIds = [
    ...new Set(gastosLista.flatMap((g) => (g.transferencia_id ? [g.transferencia_id] : []))),
  ];
  const [{ data: facturasDoc }, { data: transferenciasDoc }] = await Promise.all([
    facturaIds.length
      ? supabase.from("facturas").select("id, proveedor, n_documento, foto_url").in("id", facturaIds)
      : Promise.resolve({
          data: [] as { id: string; proveedor: string | null; n_documento: string | null; foto_url: string | null }[],
        }),
    transferenciaIds.length
      ? supabase.from("transferencias").select("id, destinatario, n_operacion, foto_url").in("id", transferenciaIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            destinatario: string | null;
            n_operacion: string | null;
            foto_url: string | null;
          }[],
        }),
  ]);
  const facturasConFoto = await Promise.all(
    (facturasDoc ?? []).map(async (f) => ({ ...f, fotoUrlFirmada: await crearUrlFirmada(f.foto_url) }))
  );
  const transferenciasConFoto = await Promise.all(
    (transferenciasDoc ?? []).map(async (t) => ({ ...t, fotoUrlFirmada: await crearUrlFirmada(t.foto_url) }))
  );
  const facturaPorId = new Map(facturasConFoto.map((f) => [f.id, f]));
  const transferenciaPorId = new Map(transferenciasConFoto.map((t) => [t.id, t]));

  const totalMaterialPorEtapaId = new Map<number, number>();
  const totalManoObraPorEtapaId = new Map<number, number>();
  for (const g of gastosLista) {
    if (g.etapa_id == null) continue;
    if (g.categoria === "Material") {
      totalMaterialPorEtapaId.set(g.etapa_id, (totalMaterialPorEtapaId.get(g.etapa_id) ?? 0) + g.monto_total);
    } else if (g.categoria === "Mano de Obra") {
      totalManoObraPorEtapaId.set(g.etapa_id, (totalManoObraPorEtapaId.get(g.etapa_id) ?? 0) + g.monto_total);
    }
  }
  const gastoPorEtapaData = (catalogoEtapas ?? [])
    .map((e) => ({
      nombre: `${e.orden}. ${e.nombre}`,
      orden: e.orden,
      material: {
        total: totalMaterialPorEtapaId.get(e.id) ?? 0,
        teorico: teoricoMaterialPorEtapaId.get(e.id) ?? null,
      },
      manoObra: {
        total: totalManoObraPorEtapaId.get(e.id) ?? 0,
        teorico: teoricoManoObraPorEtapaId.get(e.id) ?? null,
      },
    }))
    .sort((a, b) => a.orden - b.orden);

  const totalPorCategoria = new Map<string, number>();
  for (const g of gastosLista) {
    totalPorCategoria.set(g.categoria, (totalPorCategoria.get(g.categoria) ?? 0) + g.monto_total);
  }
  const gastoPorCategoriaData = CATEGORIAS_GASTO.filter((cat) => totalPorCategoria.has(cat)).map((cat) => ({
    categoria: cat,
    total: totalPorCategoria.get(cat)!,
  }));

  const tablaRows: GastoTablaRow[] = gastosLista
    .map((g) => {
      const factura = g.factura_id ? facturaPorId.get(g.factura_id) : null;
      const transferencia = g.transferencia_id ? transferenciaPorId.get(g.transferencia_id) : null;
      return {
        id: g.id,
        fecha: g.fecha,
        categoria: g.categoria,
        etapaNombre: g.etapa_id != null ? (etapaPorId.get(g.etapa_id)?.nombre ?? "—") : "Sin etapa",
        material: g.material,
        cantidad: g.cantidad,
        unidad: g.unidad,
        monto_total: g.monto_total,
        proveedor: factura?.proveedor ?? transferencia?.destinatario ?? g.proveedor,
        nDocumento: factura?.n_documento ?? transferencia?.n_operacion ?? g.n_documento,
        documentoKey: g.factura_id ?? g.transferencia_id ?? `gasto-${g.id}`,
        documentoTipo: (factura ? "factura" : transferencia ? "transferencia" : "suelto") as
          | "factura"
          | "transferencia"
          | "suelto",
        documentoId: g.factura_id ?? g.transferencia_id ?? null,
        fotoUrlFirmada: factura?.fotoUrlFirmada ?? transferencia?.fotoUrlFirmada ?? null,
        fotoPath: factura?.foto_url ?? transferencia?.foto_url ?? null,
      };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const ordenPorEtapaNombre = new Map(
    (catalogoEtapas ?? []).map((e) => [e.nombre, e.orden])
  );
  const etapasPresentes = Array.from(new Set(tablaRows.map((r) => r.etapaNombre))).sort(
    (a, b) => (ordenPorEtapaNombre.get(a) ?? Infinity) - (ordenPorEtapaNombre.get(b) ?? Infinity)
  );
  const categoriasPresentes = CATEGORIAS_GASTO.filter((cat) =>
    tablaRows.some((r) => r.categoria === cat)
  ) as string[];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-2">
        <Link href={`/proyectos/${id}`} className="text-sm text-zinc-500 hover:text-brand hover:underline">
          ← {proyecto.nombre}
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Presupuesto — {proyecto.nombre}
      </h1>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          No se pudieron cargar los gastos: {error.message}
        </p>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs uppercase text-zinc-500">Presupuesto</p>
          <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {currencyFormatter.format(proyecto.presupuesto_total)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs uppercase text-zinc-500">Gastado ({pctUsado}%)</p>
          <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {currencyFormatter.format(totalGastado)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs uppercase text-zinc-500">{restante >= 0 ? "Disponible" : "Sobregasto"}</p>
          <p
            className={`mt-1 text-xl font-semibold ${restante >= 0 ? "text-zinc-900 dark:text-zinc-50" : "text-red-600 dark:text-red-400"}`}
          >
            {currencyFormatter.format(Math.abs(restante))}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="mb-2 text-xs uppercase text-zinc-500">Uso del presupuesto</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full ${pctUsado > 100 ? "bg-red-500" : "bg-brand"}`}
              style={{ width: `${Math.min(100, pctUsado)}%` }}
            />
          </div>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Gasto por etapa</h2>
        {gastoPorEtapaData.every((d) => d.material.total === 0 && d.manoObra.total === 0) ? (
          <p className="text-sm text-zinc-500">Todavía no hay gastos registrados.</p>
        ) : (
          <GastoPorEtapaChart data={gastoPorEtapaData} />
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Gasto por categoría</h2>
        {gastoPorCategoriaData.length === 0 ? (
          <p className="text-sm text-zinc-500">Todavía no hay gastos registrados.</p>
        ) : (
          <GastoPorCategoriaChart data={gastoPorCategoriaData} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Detalle de gastos</h2>
        <GastosTabla
          proyectoId={id}
          gastos={tablaRows}
          etapas={etapasPresentes}
          categorias={categoriasPresentes}
        />
      </section>
    </div>
  );
}
