import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProyecto } from "@/app/proyectos/actions";
import { ProyectoForm } from "@/app/proyectos/proyecto-form";

export default async function EditarProyectoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: proyecto } = await supabase.from("proyectos").select("*").eq("id", id).single();

  if (!proyecto) notFound();

  const action = updateProyecto.bind(null, id);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Editar proyecto
      </h1>
      <ProyectoForm action={action} proyecto={proyecto} />
    </div>
  );
}
