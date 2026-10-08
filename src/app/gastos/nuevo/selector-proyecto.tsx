"use client";

const selectClass =
  "w-72 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function SelectorProyecto({
  proyectoId,
  proyectos,
}: {
  proyectoId: string | undefined;
  proyectos: { id: string; nombre: string }[];
}) {
  return (
    <select
      id="proyecto"
      name="proyecto"
      defaultValue={proyectoId ?? ""}
      // Al cambiar de proyecto, se manda el formulario solo — antes había que
      // además apretar "Continuar" aparte, y si alguien se saltaba ese paso
      // el asistente de abajo seguía mostrando el proyecto anterior sin avisar.
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={selectClass}
    >
      <option value="" disabled>
        Selecciona un proyecto
      </option>
      {proyectos.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
        </option>
      ))}
    </select>
  );
}
