import * as XLSX from "xlsx";

export interface FilaExportable {
  fecha: string;
  proveedor: string;
  nDocumento: string;
  etapa: string;
  categoria: string;
  material: string;
  cantidad: string;
  monto_total: number;
}

/**
 * Genera un .xlsx en el navegador a partir de gastos ya filtrados en
 * pantalla y dispara la descarga — sin pasar por el servidor, ya que los
 * datos ya están cargados del lado del cliente.
 */
export function descargarExcelGastos(filas: FilaExportable[], nombreArchivo: string) {
  const datos = filas.map((f) => ({
    Fecha: f.fecha,
    "Proveedor / destinatario": f.proveedor,
    "N° documento": f.nDocumento,
    Etapa: f.etapa,
    Categoría: f.categoria,
    "Material / concepto": f.material,
    Cantidad: f.cantidad,
    "Monto bruto": f.monto_total,
  }));
  const hoja = XLSX.utils.json_to_sheet(datos);
  hoja["!cols"] = [
    { wch: 12 },
    { wch: 28 },
    { wch: 16 },
    { wch: 28 },
    { wch: 14 },
    { wch: 30 },
    { wch: 12 },
    { wch: 14 },
  ];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Gastos");
  XLSX.writeFile(libro, nombreArchivo);
}
