"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Banner de "guardado con éxito" — se muestra cuando la URL trae
 * ?guardado=1 (lo agregan las Server Actions de gastos/facturas/
 * transferencias al redirigir después de guardar). Se limpia el query
 * param del historial para que un refresh no lo vuelva a mostrar, y se
 * autodesaparece a los pocos segundos.
 *
 * La limpieza usa history.replaceState directo (no el router de Next) a
 * propósito: un router.replace() dispara una renavegación que vuelve a
 * ejecutar el árbol de Server Components para la URL nueva, lo que
 * remonta este componente desde cero (esta vez sin el query param) y
 * apaga el toast antes de que alcance a verse.
 */
export function GuardadoToast() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const guardado = searchParams.get("guardado") === "1";
  const [visible, setVisible] = useState(guardado);

  useEffect(() => {
    if (!guardado) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("guardado");
    const query = params.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    window.history.replaceState(null, "", url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardado]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
      <span aria-hidden>✓</span>
      Gasto guardado con éxito.
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="ml-auto text-green-700 hover:underline dark:text-green-300"
      >
        Cerrar
      </button>
    </div>
  );
}
