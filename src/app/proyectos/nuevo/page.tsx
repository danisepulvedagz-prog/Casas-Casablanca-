import { createProyecto } from "@/app/proyectos/actions";
import { ProyectoForm } from "@/app/proyectos/proyecto-form";

export default function NuevoProyectoPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Nuevo proyecto
      </h1>
      <ProyectoForm action={createProyecto} />
    </div>
  );
}
