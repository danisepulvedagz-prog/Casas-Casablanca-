import { createClient } from "@/lib/supabase/server";
import { ComparadorPrecios, type CompraMaterial } from "@/app/precios-materiales/comparador-precios";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const PAGINA = 1000;

/**
 * Supabase/PostgREST solo devuelve 1000 filas por consulta por defecto — acá
 * hay más de 2000 gastos de Material, así que sin paginar se pierden en
 * silencio las compras más antiguas (quedan fuera del rango por defecto).
 */
async function obtenerTodosLosGastosDeMaterial(supabase: SupabaseClient) {
  const filas: {
    material: string | null;
    cantidad: number | null;
    unidad: string | null;
    costo_unitario: number | null;
    monto_total: number;
    proveedor: string | null;
    fecha: string;
    proyecto_id: string | null;
    factura_id: string | null;
    transferencia_id: string | null;
  }[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data } = await supabase
      .from("gastos")
      .select(
        "material, cantidad, unidad, costo_unitario, monto_total, proveedor, fecha, proyecto_id, factura_id, transferencia_id"
      )
      .eq("categoria", "Material")
      .not("material", "is", null)
      .not("costo_unitario", "is", null)
      .order("fecha", { ascending: false })
      .range(desde, desde + PAGINA - 1);
    if (!data || data.length === 0) break;
    filas.push(...data);
    if (data.length < PAGINA) break;
  }
  return filas;
}

export default async function PreciosMaterialesPage() {
  const supabase = await createClient();

  const [gastos, { data: proyectos }, { data: facturas }, { data: transferencias }] = await Promise.all([
    obtenerTodosLosGastosDeMaterial(supabase),
    supabase.from("proyectos").select("id, nombre, modalidad"),
    supabase.from("facturas").select("id, proveedor"),
    supabase.from("transferencias").select("id, destinatario"),
  ]);

  const nombrePorProyecto = new Map(
    (proyectos ?? []).map((p) => [p.id, p.modalidad === "Bodega" ? "Bodega" : p.nombre])
  );
  const proveedorPorFactura = new Map((facturas ?? []).map((f) => [f.id, f.proveedor]));
  const proveedorPorTransferencia = new Map((transferencias ?? []).map((t) => [t.id, t.destinatario]));

  const compras: CompraMaterial[] = gastos
    .filter((g): g is typeof g & { material: string; costo_unitario: number } => g.material != null && g.costo_unitario != null)
    .map((g) => ({
      material: g.material,
      cantidad: g.cantidad,
      unidad: g.unidad,
      costoUnitario: g.costo_unitario,
      montoTotal: g.monto_total,
      proveedor:
        g.proveedor ??
        (g.factura_id ? proveedorPorFactura.get(g.factura_id) : null) ??
        (g.transferencia_id ? proveedorPorTransferencia.get(g.transferencia_id) : null) ??
        null,
      fecha: g.fecha,
      proyectoNombre: nombrePorProyecto.get(g.proyecto_id ?? "") ?? "Proyecto eliminado",
    }));

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Precios de materiales</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Elige un material para comparar cuánto se ha pagado por él en cada compra, en todos los proyectos.
        </p>
      </div>
      <ComparadorPrecios compras={compras} />
    </div>
  );
}
