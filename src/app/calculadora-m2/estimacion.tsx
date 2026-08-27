"use client";

import { useMemo, useState } from "react";
import { esEscalaBanos, estimar, type RatioMaterial } from "@/lib/calculadora-m2";
import { currencyFormatter } from "@/lib/format";

const numberFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

export function Estimacion({ ratios }: { ratios: RatioMaterial[] }) {
  const [m2Nuevo, setM2Nuevo] = useState("");
  const [banosNuevo, setBanosNuevo] = useState("");

  const m2NuevoNum = Number(m2Nuevo);
  const banosNuevoNum = banosNuevo.trim() === "" ? null : Number(banosNuevo);
  const estimaciones = useMemo(
    () =>
      Number.isFinite(m2NuevoNum) && m2NuevoNum > 0
        ? estimar(ratios, m2NuevoNum, banosNuevoNum != null && Number.isFinite(banosNuevoNum) ? banosNuevoNum : null)
        : [],
    [ratios, m2NuevoNum, banosNuevoNum]
  );

  const costoTotalEstimado = estimaciones.reduce((sum, e) => sum + e.costoEstimado, 0);
  const faltaBanos =
    ratios.some((r) => esEscalaBanos(r.escalaPor)) && (banosNuevoNum == null || !(banosNuevoNum > 0));

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4">
        <div className="max-w-xs">
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="m2Nuevo">
            m² del proyecto nuevo
          </label>
          <input
            id="m2Nuevo"
            type="number"
            min="0"
            step="0.01"
            value={m2Nuevo}
            onChange={(e) => setM2Nuevo(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="max-w-xs">
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="banosNuevo">
            N° de baños del proyecto nuevo (0,5 = baño de visita)
          </label>
          <input
            id="banosNuevo"
            type="number"
            min="0"
            step="0.5"
            value={banosNuevo}
            onChange={(e) => setBanosNuevo(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      </div>

      {faltaBanos && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Hay materiales que escalan por N° de baños (artefactos y terminaciones de baño). Ingresa un
          número de baños mayor a 0 para estimarlos; mientras tanto se muestra la cantidad/costo de
          referencia sin ajustar.
        </p>
      )}

      {estimaciones.length === 0 ? (
        <p className="text-sm text-zinc-500">Ingresa m² mayores a 0 para ver la estimación.</p>
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs uppercase text-zinc-500">Costo total estimado</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              {currencyFormatter.format(costoTotalEstimado)}
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Material</th>
                  <th className="px-4 py-3">Cantidad estimada</th>
                  <th className="px-4 py-3">Costo estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {estimaciones.map((e) => (
                  <tr key={e.material} className="bg-white dark:bg-zinc-950">
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      {e.material}
                      {e.escalaPor === "fijo" && (
                        <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          fijo
                        </span>
                      )}
                      {e.escalaPor === "banos" && (
                        <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                          por baño
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {e.cantidadEstimada != null
                        ? `${numberFormatter.format(e.cantidadEstimada)} ${e.unidad ?? ""}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {currencyFormatter.format(e.costoEstimado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
