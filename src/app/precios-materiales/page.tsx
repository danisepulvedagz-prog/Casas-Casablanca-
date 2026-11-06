import { createClient } from "@/lib/supabase/server";
import { ComparadorPrecios, type CompraMaterial } from "@/app/precios-materiales/comparador-precios";

export default async function PreciosMaterialesPage() {
  const supabase = await createClient();

  const [{ data: gastos }, { data: proyectos }] = await Promise.all([
    supabase
      .from("gastos")
      .select("material, cantidad, unidad, costo_unitario, monto_total, proveedor, fecha, proyecto_id")
      .eq("categoria", "Material")
      .not("material", "is", null)
      .not("costo_unitario", "is", null)
      .order("fecha", { ascending: false }),
    supabase.from("proyectos").select("id, nombre, modalidad"),
  ]);

  const nombrePorProyecto = new Map(
    (proyectos ?? []).map((p) => [p.id, p.modalidad === "Bodega" ? "Bodega" : p.nombre])
  );

  const compras: CompraMaterial[] = (gastos ?? [])
    .filter((g): g is typeof g & { material: string; costo_unitario: number } => g.material != null && g.costo_unitario != null)
    .map((g) => ({
      material: g.material,
      cantidad: g.cantidad,
      unidad: g.unidad,
      costoUnitario: g.costo_unitario,
      montoTotal: g.monto_total,
      proveedor: g.proveedor,
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
