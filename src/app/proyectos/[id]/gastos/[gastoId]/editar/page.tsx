import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateGasto } from "@/app/proyectos/[id]/gastos/actions";
import { GastoForm } from "@/app/proyectos/[id]/gastos/gasto-form";
import { modalidadesIncluidas } from "@/lib/etapas";
import { crearUrlFirmada } from "@/lib/storage";

export default async function EditarGastoPage({
  params,
}: {
  params: Promise<{ id: string; gastoId: string }>;
}) {
  const { id, gastoId } = await params;
  const supabase = await createClient();

  const { data: proyecto } = await supabase
    .from("proyectos")
    .select("id, nombre, modalidad")
    .eq("id", id)
    .single();

  if (!proyecto) notFound();

  const [{ data: gasto }, { data: catalogoEtapas }, { data: proyectoEtapas }, { data: materialesRows }] =
    await Promise.all([
      supabase.from("gastos").select("*").eq("id", gastoId).eq("proyecto_id", id).single(),
      supabase
        .from("catalogo_etapas")
        .select("*")
        .in("modalidad", modalidadesIncluidas(proyecto.modalidad))
        .order("orden"),
      supabase.from("proyecto_etapas").select("etapa_id").eq("proyecto_id", id),
      supabase.from("catalogo_materiales").select("etapa_id, material, unidad_default").order("material"),
    ]);

  if (!gasto) notFound();

  // El gasto viene de una factura o de una transferencia — se muestra el
  // documento del que viene (solo lectura) en vez de los campos genéricos
  // de proveedor/n° documento/foto, que no aplican en ese caso.
  let facturaPadre = null;
  let transferenciaPadre = null;
  if (gasto.factura_id) {
    const { data: factura } = await supabase
      .from("facturas")
      .select("proveedor, n_documento, fecha, foto_url")
      .eq("id", gasto.factura_id)
      .single();
    if (factura) {
      facturaPadre = { ...factura, fotoUrlFirmada: await crearUrlFirmada(factura.foto_url) };
    }
  } else if (gasto.transferencia_id) {
    const { data: transferencia } = await supabase
      .from("transferencias")
      .select("destinatario, n_operacion, fecha, foto_url")
      .eq("id", gasto.transferencia_id)
      .single();
    if (transferencia) {
      transferenciaPadre = { ...transferencia, fotoUrlFirmada: await crearUrlFirmada(transferencia.foto_url) };
    }
  }

  // Solo las etapas que el proyecto realmente tiene, más la etapa que ya
  // tenía asignada este gasto (por si ya no está disponible, ej. se
  // desmarcó "tiene deck" después de registrar este gasto) para no perder
  // esa asignación al editar.
  const etapaIdsProyecto = new Set((proyectoEtapas ?? []).map((pe) => pe.etapa_id));
  if (gasto.etapa_id != null) etapaIdsProyecto.add(gasto.etapa_id);
  const etapas = (catalogoEtapas ?? []).filter((e) => etapaIdsProyecto.has(e.id));

  const action = updateGasto.bind(null, id, gastoId);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-2">
        <Link href={`/proyectos/${id}/gastos`} className="text-sm text-zinc-500 hover:text-brand hover:underline">
          ← Gastos de {proyecto.nombre}
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Editar gasto</h1>
      <GastoForm
        action={action}
        etapas={etapas ?? []}
        materiales={materialesRows ?? []}
        gasto={gasto}
        proyectoId={id}
        facturaPadre={facturaPadre}
        transferenciaPadre={transferenciaPadre}
      />
    </div>
  );
}
