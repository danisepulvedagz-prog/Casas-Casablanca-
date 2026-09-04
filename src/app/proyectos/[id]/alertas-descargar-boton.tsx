"use client";

import { BTN_SECONDARY } from "@/lib/ui";
import { descargarExcelAlertas } from "@/lib/exportar-excel";

interface AlertaExportable {
  etapa: string;
  estado: string;
  diasHastaInicio: number;
  materiales: { material: string; cantidad: number | null; unidad: string | null }[];
}

function textoDias(dias: number) {
  if (dias > 0) return `En ${dias} día${dias === 1 ? "" : "s"}`;
  if (dias === 0) return "Hoy";
  const abs = Math.abs(dias);
  return `Atrasada ${abs} día${abs === 1 ? "" : "s"}`;
}

export function DescargarAlertasBoton({
  alertas,
  nombreProyecto,
}: {
  alertas: AlertaExportable[];
  nombreProyecto: string;
}) {
  function handleDescargar() {
    const filas = alertas.flatMap((a) => {
      const diasHastaInicio = textoDias(a.diasHastaInicio);
      if (a.materiales.length === 0) {
        return [{ etapa: a.etapa, estado: a.estado, diasHastaInicio, material: "", cantidad: "", unidad: "" }];
      }
      return a.materiales.map((m) => ({
        etapa: a.etapa,
        estado: a.estado,
        diasHastaInicio,
        material: m.material,
        cantidad: m.cantidad != null ? String(m.cantidad) : "",
        unidad: m.unidad ?? "",
      }));
    });
    descargarExcelAlertas(filas, `Alertas de compra - ${nombreProyecto}.xlsx`);
  }

  return (
    <button
      type="button"
      onClick={handleDescargar}
      disabled={alertas.length === 0}
      className={`${BTN_SECONDARY} text-sm disabled:cursor-not-allowed disabled:opacity-50`}
    >
      Descargar Excel
    </button>
  );
}
