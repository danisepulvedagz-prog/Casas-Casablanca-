"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  buscarFacturaDuplicada,
  buscarTransferenciaDuplicada,
  crearFacturaConGastos,
  crearTransferenciaConGasto,
  extraerFactura,
  extraerTransferencia,
  type ActionState,
  type FacturaDuplicada,
  type TransferenciaDuplicada,
} from "@/app/proyectos/[id]/gastos/actions";
import { Combobox } from "@/components/combobox";
import { formatFecha } from "@/lib/format";
import { materialesParaEtapa, type CatalogoMaterial } from "@/lib/materiales";
import type { CategoriaGasto, Database } from "@/lib/supabase/types";
import { BTN_PRIMARY, BTN_SECONDARY, LINK_MUTED } from "@/lib/ui";

type CatalogoEtapa = Database["public"]["Tables"]["catalogo_etapas"]["Row"];

interface GastoWizardProps {
  proyectoId: string;
  etapas: CatalogoEtapa[];
  materiales: CatalogoMaterial[];
  proyectos: { id: string; nombre: string }[];
  etapasPorProyecto: Record<string, CatalogoEtapa[]>;
  etapaIdInicial?: number | null;
  materialInicial?: string;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1";
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Vercel impone un límite duro de ~4.5 MB al cuerpo de la petición de una
 * Server Action — a diferencia del bodySizeLimit de next.config.ts (que sí
 * es configurable), este NO se puede subir. Se apunta bastante por debajo
 * de eso para dejar margen al resto de la petición (RSC framing, otros
 * argumentos) y a que base64 pesa ~35% más que el archivo real.
 */
const LIMITE_BYTES_ARCHIVO = 3 * 1024 * 1024; // ~3 MB reales -> ~4 MB en base64

function comprimirEn(file: File, maxDim: number, calidad: number): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      const escala = Math.min(1, maxDim / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * escala);
      canvas.height = Math.round(height * escala);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file),
        "image/jpeg",
        calidad
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

/**
 * Las fotos de celular (sobre todo iPhone) pueden pesar varios MB. Se
 * reescalan y recomprimen a JPEG en el navegador antes de subir — de paso
 * esto reescribe cualquier HEIC (que Safari sí puede decodificar vía
 * <canvas>, a diferencia de la mayoría de los otros navegadores) a un
 * formato que la IA sí soporta. Si tras el primer intento la foto sigue
 * pesando demasiado (ej. una foto muy detallada, o un HEIC que no se pudo
 * decodificar y se mandó el original tal cual), se reintenta con pasadas
 * cada vez más agresivas antes de rendirse. Los PDF y GIF se mandan tal cual
 * (no se pueden recomprimir en el navegador).
 */
async function comprimirImagen(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  const pasadas: Array<{ maxDim: number; calidad: number }> = [
    { maxDim: 2000, calidad: 0.82 },
    { maxDim: 1600, calidad: 0.7 },
    { maxDim: 1200, calidad: 0.55 },
    { maxDim: 900, calidad: 0.45 },
  ];

  let mejor = file;
  for (const { maxDim, calidad } of pasadas) {
    const resultado = await comprimirEn(mejor, maxDim, calidad);
    mejor = resultado;
    if (resultado.size <= LIMITE_BYTES_ARCHIVO) break;
  }
  return mejor;
}

// Último control antes de mandar el archivo al servidor (dentro de un
// FormData, como binario — ver el comentario de extraerFactura en
// actions.ts) — si ni la pasada más agresiva de comprimirImagen() logró
// bajar del límite real de Vercel, es mejor avisar con un mensaje
// específico y accionable acá mismo que dejar que el servidor falle con el
// error genérico y sin detalle que Next.js muestra en producción. Los PDF
// no pasan por comprimirImagen (no se pueden recomprimir en el navegador),
// así que este control es lo único que los frena si vienen muy pesados.
const LIMITE_BYTES_ENVIO = 4 * 1024 * 1024; // ~4 MB, con margen bajo el límite real de Vercel

function verificarTamano(archivoFinal: File) {
  if (archivoFinal.size <= LIMITE_BYTES_ENVIO) return;
  const pesoMb = (archivoFinal.size / 1024 / 1024).toFixed(1);
  throw new Error(
    `La foto pesa demasiado incluso después de comprimirla (${pesoMb} MB). Prueba sacándole una foto solo a la factura (sin el resto de la mesa/fondo) o con menos zoom.`
  );
}

// No usa useFormStatus() a propósito — estos forms disparan el guardado
// desde onSubmit (no action=...) para evitar que React resetee el <form> al
// terminar (ver el comentario en handleSubmit de PasoMaterialRevisar), así
// que el pending sale directo del useActionState de cada Paso, pasado como
// prop.
function SubmitButton({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className={BTN_PRIMARY}>
      {pending ? "Guardando..." : label}
    </button>
  );
}

type Paso =
  | "categoria"
  | "material-elegir-modo"
  | "material-subir-foto"
  | "material-revisar"
  | "material-manual"
  | "transferencia-subir-foto"
  | "transferencia-revisar";

interface ItemEditable {
  key: string;
  material: string;
  cantidad: string;
  unidad: string;
  montoTotal: string;
  etapaId: string;
  proyectoId: string;
  notas: string;
}

function nuevoItemVacio(proyectoId: string): ItemEditable {
  return {
    key: crypto.randomUUID(),
    material: "",
    cantidad: "",
    unidad: "",
    montoTotal: "",
    etapaId: "",
    proyectoId,
    notas: "",
  };
}

/**
 * Estado + acciones para editar una lista de ítems (usado tanto por la
 * revisión de facturas como por la de transferencias de Material): agregar,
 * quitar, y duplicar repartiendo cantidad/monto a la mitad entre el original
 * y la copia.
 */
function useItemsEditables(inicial: ItemEditable[]) {
  const [items, setItems] = useState<ItemEditable[]>(inicial);

  function actualizarItem(key: string, cambios: Partial<ItemEditable>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...cambios } : it)));
  }

  function eliminarItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  function duplicarItem(key: string) {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.key === key);
      if (idx === -1) return prev;
      const original = prev[idx];
      const cantidadNum = Number(original.cantidad);
      const montoNum = Number(original.montoTotal);
      const cantidadMitad =
        original.cantidad && cantidadNum ? String(cantidadNum / 2) : original.cantidad;
      const montoMitad =
        original.montoTotal && montoNum ? String(Math.round(montoNum / 2)) : original.montoTotal;

      const nuevos = [...prev];
      nuevos[idx] = { ...original, cantidad: cantidadMitad, montoTotal: montoMitad };
      nuevos.splice(idx + 1, 0, {
        ...original,
        key: crypto.randomUUID(),
        cantidad: cantidadMitad,
        montoTotal: montoMitad,
      });
      return nuevos;
    });
  }

  return { items, setItems, actualizarItem, eliminarItem, duplicarItem };
}

interface CabeceraFactura {
  proveedor: string;
  nDocumento: string;
  fecha: string;
  montoTotalFactura: string;
}

interface DatosFacturaPendiente {
  items: ItemEditable[];
  cabecera: CabeceraFactura;
  foto: File | null;
}

interface DatosTransferenciaPendiente {
  destinatario: string;
  nOperacion: string;
  fecha: string;
  montoTotal: string;
  foto: File | null;
}

export function GastoWizard({
  proyectoId,
  etapas,
  materiales,
  proyectos,
  etapasPorProyecto,
  etapaIdInicial,
  materialInicial,
}: GastoWizardProps) {
  const [paso, setPaso] = useState<Paso>(
    etapaIdInicial != null || materialInicial ? "material-manual" : "categoria"
  );
  const [categoriaActual, setCategoriaActual] = useState<CategoriaGasto | null>(
    etapaIdInicial != null || materialInicial ? "Material" : null
  );
  const [datosFactura, setDatosFactura] = useState<DatosFacturaPendiente>({
    items: [],
    cabecera: { proveedor: "", nDocumento: "", fecha: today(), montoTotalFactura: "" },
    foto: null,
  });
  const [datosTransferencia, setDatosTransferencia] = useState<DatosTransferenciaPendiente>({
    destinatario: "",
    nOperacion: "",
    fecha: today(),
    montoTotal: "",
    foto: null,
  });

  function elegirCategoria(categoria: CategoriaGasto) {
    setCategoriaActual(categoria);
    setPaso(categoria === "Material" ? "material-elegir-modo" : "transferencia-subir-foto");
  }

  // Los pasos con tabla de ítems necesitan bastante más ancho que el resto
  // del asistente (que se ve mejor angosto y centrado) — la página que lo
  // envuelve ya da hasta max-w-6xl, acá solo se decide si aprovecharlo.
  const anchoAmplio =
    paso === "material-revisar" || (paso === "transferencia-revisar" && categoriaActual === "Material");

  return (
    <div className={anchoAmplio ? "" : "max-w-2xl"}>
      {paso === "categoria" && <PasoCategoria onElegir={elegirCategoria} />}
      {paso === "material-elegir-modo" && (
        <PasoMaterialElegirModo onElegir={setPaso} onVolver={() => setPaso("categoria")} />
      )}
      {paso === "material-subir-foto" && (
        <PasoMaterialSubirFoto
          proyectoId={proyectoId}
          onVolver={() => setPaso("material-elegir-modo")}
          onExtraido={(items, cabecera, foto) => {
            setDatosFactura({ items, cabecera, foto });
            setPaso("material-revisar");
          }}
        />
      )}
      {paso === "material-revisar" && (
        <PasoMaterialRevisar
          proyectoId={proyectoId}
          etapas={etapas}
          proyectos={proyectos}
          etapasPorProyecto={etapasPorProyecto}
          materiales={materiales}
          datos={datosFactura}
          onVolver={() => setPaso("material-subir-foto")}
        />
      )}
      {paso === "material-manual" && (
        <PasoMaterialManual
          proyectoId={proyectoId}
          etapas={etapas}
          materiales={materiales}
          etapaIdInicial={etapaIdInicial}
          materialInicial={materialInicial}
          onVolver={() => setPaso("material-elegir-modo")}
        />
      )}
      {paso === "transferencia-subir-foto" && (
        <PasoTransferenciaSubirFoto
          onVolver={() => setPaso(categoriaActual === "Material" ? "material-elegir-modo" : "categoria")}
          onListo={(datos) => {
            setDatosTransferencia(datos);
            setPaso("transferencia-revisar");
          }}
        />
      )}
      {paso === "transferencia-revisar" && categoriaActual && (
        <PasoTransferenciaRevisar
          proyectoId={proyectoId}
          etapas={etapas}
          proyectos={proyectos}
          etapasPorProyecto={etapasPorProyecto}
          materiales={materiales}
          categoria={categoriaActual}
          datos={datosTransferencia}
          onVolver={() => setPaso("transferencia-subir-foto")}
        />
      )}
    </div>
  );
}

function PasoCategoria({ onElegir }: { onElegir: (categoria: CategoriaGasto) => void }) {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">¿Qué tipo de gasto es?</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onElegir("Material")}
          className="rounded-lg border border-zinc-200 p-6 text-left transition-colors hover:border-brand hover:bg-brand-tint dark:border-zinc-800"
        >
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Material</p>
          <p className="mt-1 text-sm text-zinc-500">
            Con factura/boleta o solo con el comprobante de la transferencia.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onElegir("Mano de Obra")}
          className="rounded-lg border border-zinc-200 p-6 text-left transition-colors hover:border-brand hover:bg-brand-tint dark:border-zinc-800"
        >
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Mano de Obra</p>
          <p className="mt-1 text-sm text-zinc-500">
            Sube la foto de la transferencia — la IA saca destinatario y N° de operación.
          </p>
        </button>
      </div>
    </div>
  );
}

function PasoMaterialElegirModo({ onElegir, onVolver }: { onElegir: (p: Paso) => void; onVolver: () => void }) {
  return (
    <div>
      <button type="button" onClick={onVolver} className={`${LINK_MUTED} mb-4`}>
        ← Cambiar tipo de gasto
      </button>
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Material</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => onElegir("material-subir-foto")}
          className="rounded-lg border border-zinc-200 p-6 text-left transition-colors hover:border-brand hover:bg-brand-tint dark:border-zinc-800"
        >
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Subir foto de factura o boleta</p>
          <p className="mt-1 text-sm text-zinc-500">
            La IA identifica todos los productos de la foto y sugiere la fase de cada uno.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onElegir("material-manual")}
          className="rounded-lg border border-zinc-200 p-6 text-left transition-colors hover:border-brand hover:bg-brand-tint dark:border-zinc-800"
        >
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Agregar factura a mano</p>
          <p className="mt-1 text-sm text-zinc-500">Sin foto — completas un solo material tú mismo.</p>
        </button>
        <button
          type="button"
          onClick={() => onElegir("transferencia-subir-foto")}
          className="rounded-lg border border-zinc-200 p-6 text-left transition-colors hover:border-brand hover:bg-brand-tint dark:border-zinc-800"
        >
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Transferencia</p>
          <p className="mt-1 text-sm text-zinc-500">
            No hay factura, solo el comprobante de la transferencia.
          </p>
        </button>
      </div>
    </div>
  );
}

function PasoMaterialSubirFoto({
  proyectoId,
  onVolver,
  onExtraido,
}: {
  proyectoId: string;
  onVolver: () => void;
  onExtraido: (items: ItemEditable[], cabecera: CabeceraFactura, foto: File | null) => void;
}) {
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [hayFoto, setHayFoto] = useState(false);
  const [extrayendo, startExtraccion] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLeer() {
    const file = fotoInputRef.current?.files?.[0];
    if (!file) return;
    setError(null);

    startExtraccion(async () => {
      try {
        const comprimido = await comprimirImagen(file);
        verificarTamano(comprimido);
        const formData = new FormData();
        formData.set("archivo", comprimido);
        formData.set("proyectoId", proyectoId);
        const resultado = await extraerFactura(formData);
        if ("error" in resultado) {
          setError(resultado.error);
          return;
        }
        const { data } = resultado;
        const items: ItemEditable[] = data.items.map((it) => ({
          key: crypto.randomUUID(),
          material: it.material ?? "",
          cantidad: it.cantidad != null ? String(it.cantidad) : "",
          unidad: it.unidad ?? "",
          montoTotal: it.monto_total != null ? String(it.monto_total) : "",
          etapaId: it.etapa_id != null ? String(it.etapa_id) : "",
          proyectoId,
          notas: "",
        }));
        if (items.length === 0) items.push(nuevoItemVacio(proyectoId));
        const cabecera: CabeceraFactura = {
          proveedor: data.proveedor ?? "",
          nDocumento: data.n_documento ?? "",
          fecha: data.fecha ?? today(),
          montoTotalFactura: data.monto_total != null ? String(data.monto_total) : "",
        };
        onExtraido(items, cabecera, file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo leer la imagen.");
      }
    });
  }

  return (
    <div>
      <button type="button" onClick={onVolver} className={`${LINK_MUTED} mb-4`}>
        ← Volver
      </button>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Foto de la factura o boleta</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Puede tener varios productos — la IA los identifica todos por separado.
      </p>
      <div className="flex items-center gap-2">
        <input
          ref={fotoInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => {
            setHayFoto(!!e.target.files?.[0]);
            setError(null);
          }}
          className={`${inputClass} file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:text-zinc-700 dark:file:bg-zinc-800 dark:file:text-zinc-200`}
        />
        <button
          type="button"
          disabled={!hayFoto || extrayendo}
          onClick={handleLeer}
          className={`${BTN_PRIMARY} shrink-0 whitespace-nowrap`}
        >
          {extrayendo ? "Leyendo..." : "Leer con IA"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function PasoMaterialRevisar({
  proyectoId,
  etapas,
  proyectos,
  etapasPorProyecto,
  materiales,
  datos,
  onVolver,
}: {
  proyectoId: string;
  etapas: CatalogoEtapa[];
  proyectos: { id: string; nombre: string }[];
  etapasPorProyecto: Record<string, CatalogoEtapa[]>;
  materiales: CatalogoMaterial[];
  datos: { items: ItemEditable[]; cabecera: CabeceraFactura; foto: File | null };
  onVolver: () => void;
}) {
  const { items, setItems, actualizarItem, eliminarItem, duplicarItem } = useItemsEditables(datos.items);
  const [cabecera, setCabecera] = useState<CabeceraFactura>(datos.cabecera);
  const [proyectosSeleccionados, setProyectosSeleccionados] = useState<string[]>([proyectoId]);
  const [facturaDuplicada, setFacturaDuplicada] = useState<FacturaDuplicada | null>(null);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    crearFacturaConGastos.bind(null, proyectoId),
    {}
  );

  // Advertencia blanda: si ya existe una factura con este mismo proveedor +
  // n° documento, se avisa (sin bloquear) para evitar cargar la misma boleta
  // dos veces por error. El primer chequeo (proveedor/n° documento recién
  // llegados de la IA) corre sin espera — si se deja el debounce de 500ms
  // también para ese primer caso, alguien que reconoce la factura y aprieta
  // "Guardar" rápido puede alcanzar a guardar antes de que la advertencia
  // llegue a aparecer.
  const primerChequeoRef = useRef(true);
  useEffect(() => {
    const proveedor = cabecera.proveedor;
    const nDocumento = cabecera.nDocumento;
    const espera = primerChequeoRef.current ? 0 : 500;
    primerChequeoRef.current = false;
    let cancelado = false;
    const timeout = setTimeout(async () => {
      if (cancelado) return;
      if (!proveedor.trim() || !nDocumento.trim()) {
        setFacturaDuplicada(null);
        return;
      }
      const resultado = await buscarFacturaDuplicada(proveedor, nDocumento);
      if (!cancelado) setFacturaDuplicada(resultado);
    }, espera);
    return () => {
      cancelado = true;
      clearTimeout(timeout);
    };
  }, [cabecera.proveedor, cabecera.nDocumento]);

  function alternarProyecto(pid: string) {
    setProyectosSeleccionados((prev) => {
      if (prev.includes(pid)) {
        if (prev.length === 1) return prev; // siempre debe quedar al menos uno
        // Los ítems que estaban en ese proyecto se mueven a otro de los que
        // queden marcados — al principal si sigue marcado, si no al primero
        // que quede (ej. si se desmarca justo el proyecto principal porque
        // se eligió mal al empezar). La etapa se conserva si sigue siendo
        // válida en el nuevo proyecto, para no hacer perder el trabajo ya
        // hecho por un simple cambio de proyecto.
        const restantes = prev.filter((id) => id !== pid);
        const proyectoDestino = restantes.includes(proyectoId) ? proyectoId : restantes[0];
        const etapasDestino = etapasPorProyecto[proyectoDestino] ?? etapas;
        setItems((prevItems) =>
          prevItems.map((it) => {
            if (it.proyectoId !== pid) return it;
            const etapaSigueValida = etapasDestino.some((et) => String(et.id) === it.etapaId);
            return { ...it, proyectoId: proyectoDestino, etapaId: etapaSigueValida ? it.etapaId : "" };
          })
        );
        return restantes;
      }
      return [...prev, pid];
    });
  }

  const hayVariosProyectos = proyectosSeleccionados.length > 1;
  const totalItems = items.reduce((sum, it) => sum + (Number(it.montoTotal) || 0), 0);

  // Handlers por ítem, compartidos entre la vista de tarjetas (mobile) y la
  // tabla (desktop) — cada una renderiza distinto pero mutan el mismo estado.
  function handleMaterialChange(it: ItemEditable, value: string) {
    const materialesFila = materialesParaEtapa(materiales, it.etapaId);
    const match = materialesFila.find(
      (m) => m.material.trim().toLowerCase() === value.trim().toLowerCase()
    );
    actualizarItem(it.key, {
      material: value,
      ...(match ? { unidad: match.unidad_default } : {}),
    });
  }

  function handleCantidadChange(it: ItemEditable, nuevaCantidad: string) {
    const cantidadAnterior = Number(it.cantidad);
    const montoAnterior = Number(it.montoTotal);
    const precioUnitario =
      cantidadAnterior > 0 && it.montoTotal !== "" ? montoAnterior / cantidadAnterior : null;
    const nuevoMonto =
      precioUnitario != null && nuevaCantidad
        ? String(Math.round(precioUnitario * Number(nuevaCantidad)))
        : it.montoTotal;
    actualizarItem(it.key, { cantidad: nuevaCantidad, montoTotal: nuevoMonto });
  }

  function handleProyectoChange(it: ItemEditable, nuevoProyectoId: string) {
    const etapasNuevoProyecto = etapasPorProyecto[nuevoProyectoId] ?? etapas;
    const etapaSigueValida = etapasNuevoProyecto.some((et) => String(et.id) === it.etapaId);
    actualizarItem(it.key, {
      proyectoId: nuevoProyectoId,
      etapaId: etapaSigueValida ? it.etapaId : "",
    });
  }

  function handleEtapaChange(it: ItemEditable, nuevaEtapaId: string) {
    actualizarItem(it.key, { etapaId: nuevaEtapaId, material: "", unidad: "" });
  }

  // React 19 resetea el <form> a nivel del navegador apenas termina un
  // action="..." — éxito o error, da lo mismo — y eso pisa los <select> de
  // cada ítem aunque estén controlados por React (a Sin etapa/vacío), por
  // más que el estado items siga sin tocar. Se arma el FormData a mano y se
  // llama a formAction() desde onSubmit en vez de usar action={...}, así el
  // form nunca queda wireado como "form action" y React no lo resetea solo.
  function handleSubmit() {
    const formData = new FormData();
    formData.set("proveedor", cabecera.proveedor);
    formData.set("n_documento", cabecera.nDocumento);
    formData.set("fecha", cabecera.fecha);
    formData.set("monto_total_factura", cabecera.montoTotalFactura);
    if (datos.foto) formData.set("foto", datos.foto);
    formData.set(
      "items_json",
      JSON.stringify(
        items.map((it) => ({
          material: it.material,
          cantidad: it.cantidad ? Number(it.cantidad) : null,
          unidad: it.unidad || null,
          monto_total: Number(it.montoTotal) || 0,
          etapa_id: it.etapaId ? Number(it.etapaId) : null,
          proyecto_id: it.proyectoId,
          notas: it.notas || null,
        }))
      )
    );
    // formAction viene de useActionState, pero acá se llama a mano (no vía
    // action={...}, ver el comentario más arriba) — sin startTransition,
    // React avisa por consola que isPending nunca se pone en true, así que
    // el botón se queda sin deshabilitarse ni mostrar "Guardando...", y en
    // el celular alguien lo aprieta varias veces creyendo que no funcionó.
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <div>
      <button type="button" onClick={onVolver} className={`${LINK_MUTED} mb-4`}>
        ← Volver a subir otra foto
      </button>
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Revisa los datos antes de guardar
      </h2>
      <p className="mb-4 text-sm text-zinc-500">
        La IA puede equivocarse — corrige lo que haga falta. Nada se guarda hasta que apretes &quot;Guardar&quot;.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="grid gap-6"
      >
        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.error}
          </p>
        )}
        {facturaDuplicada && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            ⚠️ Ya existe una factura de este proveedor con el mismo n° de documento, del{" "}
            {formatFecha(facturaDuplicada.fecha)}
            {facturaDuplicada.monto_total != null
              ? ` por $${facturaDuplicada.monto_total.toLocaleString("es-CL")}`
              : ""}
            . Puede ser un duplicado — revisa antes de guardar.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800">
          <div>
            <label className={labelClass}>Proveedor</label>
            <input
              value={cabecera.proveedor}
              onChange={(e) => setCabecera({ ...cabecera, proveedor: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>N° documento</label>
            <input
              value={cabecera.nDocumento}
              onChange={(e) => setCabecera({ ...cabecera, nDocumento: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Fecha</label>
            <input
              type="date"
              value={cabecera.fecha}
              onChange={(e) => setCabecera({ ...cabecera, fecha: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Monto bruto total factura</label>
            <input
              type="number"
              value={cabecera.montoTotalFactura}
              onChange={(e) => setCabecera({ ...cabecera, montoTotalFactura: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Proyectos de esta factura</label>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {proyectos.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={proyectosSeleccionados.includes(p.id)}
                    onChange={() => alternarProyecto(p.id)}
                  />
                  {p.nombre}
                </label>
              ))}
            </div>
            {hayVariosProyectos && (
              <p className="mt-1 text-xs text-zinc-500">
                Asigna el proyecto de cada ítem en la tabla de abajo.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:hidden">
          {items.map((it) => {
            const etapasFila = etapasPorProyecto[it.proyectoId] ?? etapas;
            const materialesFila = materialesParaEtapa(materiales, it.etapaId);
            return (
              <div key={it.key} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="mb-3">
                  <label className={labelClass}>Material</label>
                  <Combobox
                    value={it.material}
                    onChange={(value) => handleMaterialChange(it, value)}
                    options={materialesFila.map((m) => m.material)}
                    className={inputClass}
                  />
                </div>
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Cant.</label>
                    <input
                      type="number"
                      value={it.cantidad}
                      onChange={(e) => handleCantidadChange(it, e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Unidad</label>
                    <input
                      value={it.unidad}
                      onChange={(e) => actualizarItem(it.key, { unidad: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className={labelClass}>Monto bruto</label>
                  <input
                    type="number"
                    value={it.montoTotal}
                    onChange={(e) => actualizarItem(it.key, { montoTotal: e.target.value })}
                    className={inputClass}
                  />
                </div>
                {hayVariosProyectos && (
                  <div className="mb-3">
                    <label className={labelClass}>Proyecto</label>
                    <select
                      value={it.proyectoId}
                      onChange={(e) => handleProyectoChange(it, e.target.value)}
                      className={inputClass}
                    >
                      {proyectosSeleccionados.map((pid) => {
                        const p = proyectos.find((pr) => pr.id === pid);
                        return (
                          <option key={pid} value={pid}>
                            {p?.nombre ?? pid}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
                <div className="mb-3">
                  <label className={labelClass}>Etapa</label>
                  <select
                    value={it.etapaId}
                    onChange={(e) => handleEtapaChange(it, e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Sin etapa</option>
                    {etapasFila.map((etapa) => (
                      <option key={etapa.id} value={etapa.id}>
                        {etapa.orden}. {etapa.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className={labelClass}>Notas</label>
                  <input
                    value={it.notas}
                    placeholder="opcional"
                    onChange={(e) => actualizarItem(it.key, { notas: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="flex items-center gap-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => duplicarItem(it.key)}
                    className="text-xs text-zinc-500 hover:text-brand hover:underline dark:text-zinc-400"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => eliminarItem(it.key)}
                    className="text-xs text-red-600 hover:underline dark:text-red-400"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 sm:block dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Material</th>
                <th className="px-3 py-2">Cant.</th>
                <th className="px-3 py-2">Unidad</th>
                <th className="px-3 py-2">Monto bruto</th>
                {hayVariosProyectos && <th className="px-3 py-2">Proyecto</th>}
                <th className="px-3 py-2">Etapa</th>
                <th className="px-3 py-2">Notas</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {items.map((it) => {
                const etapasFila = etapasPorProyecto[it.proyectoId] ?? etapas;
                const materialesFila = materialesParaEtapa(materiales, it.etapaId);
                return (
                  <tr key={it.key} className="bg-white dark:bg-zinc-950">
                    <td className="px-3 py-2">
                      <Combobox
                        value={it.material}
                        onChange={(value) => handleMaterialChange(it, value)}
                        options={materialesFila.map((m) => m.material)}
                        className={`${inputClass} min-w-[180px]`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={it.cantidad}
                        onChange={(e) => handleCantidadChange(it, e.target.value)}
                        className={`${inputClass} !w-24`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={it.unidad}
                        onChange={(e) => actualizarItem(it.key, { unidad: e.target.value })}
                        className={`${inputClass} !w-24`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={it.montoTotal}
                        onChange={(e) => actualizarItem(it.key, { montoTotal: e.target.value })}
                        className={`${inputClass} !w-40`}
                      />
                    </td>
                    {hayVariosProyectos && (
                      <td className="px-3 py-2">
                        <select
                          value={it.proyectoId}
                          onChange={(e) => handleProyectoChange(it, e.target.value)}
                          className={`${inputClass} min-w-[180px]`}
                        >
                          {proyectosSeleccionados.map((pid) => {
                            const p = proyectos.find((pr) => pr.id === pid);
                            return (
                              <option key={pid} value={pid}>
                                {p?.nombre ?? pid}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <select
                        value={it.etapaId}
                        onChange={(e) => handleEtapaChange(it, e.target.value)}
                        className={`${inputClass} min-w-[220px]`}
                      >
                        <option value="">Sin etapa</option>
                        {etapasFila.map((etapa) => (
                          <option key={etapa.id} value={etapa.id}>
                            {etapa.orden}. {etapa.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={it.notas}
                        placeholder="opcional"
                        onChange={(e) => actualizarItem(it.key, { notas: e.target.value })}
                        className={`${inputClass} min-w-[160px]`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => duplicarItem(it.key)}
                          className="text-xs text-zinc-500 hover:text-brand hover:underline dark:text-zinc-400"
                        >
                          Duplicar
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarItem(it.key)}
                          className="text-xs text-red-600 hover:underline dark:text-red-400"
                        >
                          Quitar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, nuevoItemVacio(proyectoId)])}
            className={BTN_SECONDARY}
          >
            + Agregar ítem
          </button>
          <p className="text-sm text-zinc-500">
            Suma de ítems: <span className="font-medium text-zinc-900 dark:text-zinc-100">${totalItems}</span>
          </p>
        </div>

        <div>
          <SubmitButton
            label={`Guardar ${items.length} gasto${items.length === 1 ? "" : "s"}`}
            pending={isPending}
          />
        </div>
      </form>
    </div>
  );
}

function PasoMaterialManual({
  proyectoId,
  etapas,
  materiales,
  etapaIdInicial,
  materialInicial,
  onVolver,
}: {
  proyectoId: string;
  etapas: CatalogoEtapa[];
  materiales: CatalogoMaterial[];
  etapaIdInicial?: number | null;
  materialInicial?: string;
  onVolver: () => void;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    crearFacturaConGastos.bind(null, proyectoId),
    {}
  );
  const mostrarVolver = etapaIdInicial == null && !materialInicial;

  const [etapaId, setEtapaId] = useState(String(etapaIdInicial ?? ""));
  const [material, setMaterial] = useState(materialInicial ?? "");
  const [unidad, setUnidad] = useState("");

  const materialesFiltrados = useMemo(
    () => materialesParaEtapa(materiales, etapaId),
    [materiales, etapaId]
  );

  function handleMaterialChange(value: string) {
    setMaterial(value);
    const match = materialesFiltrados.find(
      (m) => m.material.trim().toLowerCase() === value.trim().toLowerCase()
    );
    if (match) setUnidad(match.unidad_default);
  }

  function handleSubmit(formData: FormData) {
    const materialValue = String(formData.get("material") ?? "").trim();
    const cantidadRaw = String(formData.get("cantidad") ?? "").trim();
    const unidadValue = String(formData.get("unidad") ?? "").trim();
    const montoTotal = String(formData.get("monto_total") ?? "").trim();
    const etapaIdRaw = String(formData.get("etapa_id") ?? "").trim();
    const notas = String(formData.get("notas") ?? "").trim();

    formData.set("monto_total_factura", montoTotal);
    formData.set(
      "items_json",
      JSON.stringify([
        {
          material: materialValue,
          cantidad: cantidadRaw ? Number(cantidadRaw) : null,
          unidad: unidadValue || null,
          monto_total: Number(montoTotal) || 0,
          etapa_id: etapaIdRaw ? Number(etapaIdRaw) : null,
          notas: notas || null,
        },
      ])
    );
    // Ver el comentario en handleSubmit de PasoMaterialRevisar sobre por qué
    // esto va dentro de startTransition.
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <div>
      {mostrarVolver && (
        <button type="button" onClick={onVolver} className={`${LINK_MUTED} mb-4`}>
          ← Volver
        </button>
      )}
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Agregar material a mano</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
        className="grid max-w-md gap-4"
      >
        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.error}
          </p>
        )}
        <div>
          <label className={labelClass} htmlFor="etapa_id">
            Etapa
          </label>
          <select
            id="etapa_id"
            name="etapa_id"
            value={etapaId}
            onChange={(e) => {
              setEtapaId(e.target.value);
              // El material del catálogo depende de la etapa — se limpia al
              // cambiarla para forzar a elegir uno nuevo (si no, el
              // desplegable de sugerencias no aparece porque el campo ya
              // tiene texto).
              setMaterial("");
              setUnidad("");
            }}
            className={inputClass}
          >
            <option value="">Sin etapa asociada</option>
            {etapas.map((etapa) => (
              <option key={etapa.id} value={etapa.id}>
                {etapa.orden}. {etapa.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="material">
            Material / concepto
          </label>
          <Combobox
            id="material"
            name="material"
            value={material}
            onChange={handleMaterialChange}
            options={materialesFiltrados.map((m) => m.material)}
            className={inputClass}
          />
          {etapaId && materialesFiltrados.length <= 1 && (
            <p className="mt-1 text-xs text-zinc-500">
              Esta etapa no tiene materiales en el catálogo todavía (puedes usar &quot;Otros&quot;).
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="cantidad">
              Cantidad
            </label>
            <input id="cantidad" name="cantidad" type="number" step="0.01" min="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="unidad">
              Unidad
            </label>
            <input
              id="unidad"
              name="unidad"
              placeholder="un, m2, kg, saco..."
              value={unidad}
              onChange={(e) => setUnidad(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="monto_total">
            Monto bruto total
          </label>
          <input id="monto_total" name="monto_total" type="number" step="1" min="0" required className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="proveedor">
              Proveedor
            </label>
            <input id="proveedor" name="proveedor" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="n_documento">
              N° factura / boleta
            </label>
            <input id="n_documento" name="n_documento" className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="fecha">
            Fecha
          </label>
          <input id="fecha" name="fecha" type="date" required defaultValue={today()} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="foto">
            Foto de la factura o boleta (opcional)
          </label>
          <input
            id="foto"
            name="foto"
            type="file"
            accept="image/*,application/pdf"
            className={`${inputClass} file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:text-zinc-700 dark:file:bg-zinc-800 dark:file:text-zinc-200`}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="notas">
            Notas (opcional)
          </label>
          <textarea id="notas" name="notas" rows={2} className={inputClass} />
        </div>
        <div>
          <SubmitButton label="Registrar gasto" pending={isPending} />
        </div>
      </form>
    </div>
  );
}

function PasoTransferenciaSubirFoto({
  onVolver,
  onListo,
}: {
  onVolver: () => void;
  onListo: (datos: DatosTransferenciaPendiente) => void;
}) {
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [hayFoto, setHayFoto] = useState(false);
  const [extrayendo, startExtraccion] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLeer() {
    const file = fotoInputRef.current?.files?.[0];
    if (!file) return;
    setError(null);

    startExtraccion(async () => {
      try {
        const comprimido = await comprimirImagen(file);
        verificarTamano(comprimido);
        const formData = new FormData();
        formData.set("archivo", comprimido);
        const resultado = await extraerTransferencia(formData);
        if ("error" in resultado) {
          setError(resultado.error);
          return;
        }
        const { data } = resultado;
        onListo({
          destinatario: data.destinatario ?? "",
          nOperacion: data.n_operacion ?? "",
          fecha: data.fecha ?? today(),
          montoTotal: data.monto_total != null ? String(data.monto_total) : "",
          foto: file,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo leer la imagen.");
      }
    });
  }

  function handleContinuarSinLeer() {
    const file = fotoInputRef.current?.files?.[0] ?? null;
    onListo({ destinatario: "", nOperacion: "", fecha: today(), montoTotal: "", foto: file });
  }

  return (
    <div>
      <button type="button" onClick={onVolver} className={`${LINK_MUTED} mb-4`}>
        ← Volver
      </button>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Foto de la transferencia</h2>
      <p className="mb-4 text-sm text-zinc-500">
        La IA identifica el destinatario y el N° de operación. La foto es opcional — también puedes completar todo a
        mano en el siguiente paso.
      </p>
      <div className="flex items-center gap-2">
        <input
          ref={fotoInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => {
            setHayFoto(!!e.target.files?.[0]);
            setError(null);
          }}
          className={`${inputClass} file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:text-zinc-700 dark:file:bg-zinc-800 dark:file:text-zinc-200`}
        />
        <button
          type="button"
          disabled={!hayFoto || extrayendo}
          onClick={handleLeer}
          className={`${BTN_PRIMARY} shrink-0 whitespace-nowrap`}
        >
          {extrayendo ? "Leyendo..." : "Leer con IA"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="button" onClick={handleContinuarSinLeer} className={`${LINK_MUTED} mt-4`}>
        Continuar sin leer con IA →
      </button>
    </div>
  );
}

function PasoTransferenciaRevisar({
  proyectoId,
  etapas,
  proyectos,
  etapasPorProyecto,
  materiales,
  categoria,
  datos,
  onVolver,
}: {
  proyectoId: string;
  etapas: CatalogoEtapa[];
  proyectos: { id: string; nombre: string }[];
  etapasPorProyecto: Record<string, CatalogoEtapa[]>;
  materiales: CatalogoMaterial[];
  categoria: CategoriaGasto;
  datos: DatosTransferenciaPendiente;
  onVolver: () => void;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    crearTransferenciaConGasto.bind(null, proyectoId),
    {}
  );

  const esMaterial = categoria === "Material";

  const [destinatario, setDestinatario] = useState(datos.destinatario);
  const [nOperacion, setNOperacion] = useState(datos.nOperacion);
  const [fecha, setFecha] = useState(datos.fecha || today());
  const [montoTotal, setMontoTotal] = useState(datos.montoTotal);
  const [transferenciaDuplicada, setTransferenciaDuplicada] = useState<TransferenciaDuplicada | null>(null);

  // Advertencia blanda: mismo destinatario + n° operación ya registrados.
  // El primer chequeo (recién llegado de la IA) corre sin espera — ver el
  // comentario equivalente en PasoMaterialRevisar.
  const primerChequeoTransferenciaRef = useRef(true);
  useEffect(() => {
    const espera = primerChequeoTransferenciaRef.current ? 0 : 500;
    primerChequeoTransferenciaRef.current = false;
    let cancelado = false;
    const timeout = setTimeout(async () => {
      if (cancelado) return;
      if (!destinatario.trim() || !nOperacion.trim()) {
        setTransferenciaDuplicada(null);
        return;
      }
      const resultado = await buscarTransferenciaDuplicada(destinatario, nOperacion);
      if (!cancelado) setTransferenciaDuplicada(resultado);
    }, espera);
    return () => {
      cancelado = true;
      clearTimeout(timeout);
    };
  }, [destinatario, nOperacion]);
  // Mano de Obra: una sola etapa para el único gasto. Material: cada ítem
  // de la tabla trae la suya (una transferencia también puede cubrir
  // materiales de más de una etapa, y repartirse entre proyectos igual que
  // una factura).
  const [etapaId, setEtapaId] = useState("");
  const [proyectosSeleccionados, setProyectosSeleccionados] = useState<string[]>([proyectoId]);
  const { items, setItems, actualizarItem, eliminarItem, duplicarItem } = useItemsEditables(
    esMaterial ? [nuevoItemVacio(proyectoId)] : []
  );

  function alternarProyecto(pid: string) {
    setProyectosSeleccionados((prev) => {
      if (prev.includes(pid)) {
        if (prev.length === 1) return prev; // siempre debe quedar al menos uno
        // Ver el mismo comentario en PasoMaterialRevisar: los ítems se mueven
        // a otro proyecto que siga marcado (no siempre al principal), y la
        // etapa se conserva si sigue siendo válida ahí.
        const restantes = prev.filter((id) => id !== pid);
        const proyectoDestino = restantes.includes(proyectoId) ? proyectoId : restantes[0];
        const etapasDestino = etapasPorProyecto[proyectoDestino] ?? etapas;
        setItems((prevItems) =>
          prevItems.map((it) => {
            if (it.proyectoId !== pid) return it;
            const etapaSigueValida = etapasDestino.some((et) => String(et.id) === it.etapaId);
            return { ...it, proyectoId: proyectoDestino, etapaId: etapaSigueValida ? it.etapaId : "" };
          })
        );
        return restantes;
      }
      return [...prev, pid];
    });
  }

  const hayVariosProyectos = esMaterial && proyectosSeleccionados.length > 1;

  // Ver el comentario en handleSubmit de PasoMaterialRevisar: se arma el
  // FormData a mano y se dispara desde onSubmit, no action=..., para que
  // React no resetee el form (y los <select> de etapa/proyecto) al terminar.
  function handleSubmit() {
    const formData = new FormData();
    formData.set("categoria", categoria);
    formData.set("destinatario", destinatario);
    formData.set("n_operacion", nOperacion);
    formData.set("fecha", fecha);
    formData.set("monto_total", montoTotal);
    if (esMaterial) {
      formData.set(
        "items_json",
        JSON.stringify(
          items.map((it) => ({
            material: it.material,
            cantidad: it.cantidad ? Number(it.cantidad) : null,
            unidad: it.unidad || null,
            // El monto es opcional acá — si se deja vacío, el servidor
            // reparte lo que falte del total transferido entre estos ítems.
            monto_total: it.montoTotal ? Number(it.montoTotal) : null,
            etapa_id: it.etapaId ? Number(it.etapaId) : null,
            notas: it.notas || null,
            proyecto_id: it.proyectoId,
          }))
        )
      );
    } else {
      formData.set("etapa_id", etapaId);
    }
    if (datos.foto) formData.set("foto", datos.foto);
    // Ver el comentario en handleSubmit de PasoMaterialRevisar sobre por qué
    // esto va dentro de startTransition.
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <div>
      <button type="button" onClick={onVolver} className={`${LINK_MUTED} mb-4`}>
        ← Volver a subir otra foto
      </button>
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Revisa los datos antes de guardar
      </h2>
      <p className="mb-4 text-sm text-zinc-500">
        La IA puede equivocarse — corrige lo que haga falta. Nada se guarda hasta que apretes &quot;Guardar&quot;.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="grid gap-6"
      >
        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.error}
          </p>
        )}
        {transferenciaDuplicada && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            ⚠️ Ya existe una transferencia a este destinatario con el mismo n° de operación, del{" "}
            {formatFecha(transferenciaDuplicada.fecha)}
            {transferenciaDuplicada.monto_total != null
              ? ` por $${transferenciaDuplicada.monto_total.toLocaleString("es-CL")}`
              : ""}
            . Puede ser un duplicado — revisa antes de guardar.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div>
            <label className={labelClass}>Destinatario</label>
            <input value={destinatario} onChange={(e) => setDestinatario(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>N° operación</label>
            <input value={nOperacion} onChange={(e) => setNOperacion(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Monto bruto total transferido</label>
            <input
              type="number"
              step="1"
              min="0"
              value={montoTotal}
              onChange={(e) => setMontoTotal(e.target.value)}
              className={inputClass}
            />
          </div>
          {!esMaterial && (
            <div className="col-span-2">
              <label className={labelClass}>Etapa</label>
              <select value={etapaId} onChange={(e) => setEtapaId(e.target.value)} className={inputClass}>
                <option value="">Sin etapa asociada</option>
                {etapas.map((etapa) => (
                  <option key={etapa.id} value={etapa.id}>
                    {etapa.orden}. {etapa.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!esMaterial && (
            <div className="col-span-2">
              <label className={labelClass} htmlFor="notas">
                Notas (opcional)
              </label>
              <textarea id="notas" name="notas" rows={2} className={inputClass} />
            </div>
          )}
          {esMaterial && (
            <div className="col-span-2">
              <label className={labelClass}>Proyectos de esta transferencia</label>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {proyectos.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={proyectosSeleccionados.includes(p.id)}
                      onChange={() => alternarProyecto(p.id)}
                    />
                    {p.nombre}
                  </label>
                ))}
              </div>
              {hayVariosProyectos && (
                <p className="mt-1 text-xs text-zinc-500">
                  Asigna el proyecto de cada ítem en la tabla de abajo.
                </p>
              )}
            </div>
          )}
        </div>

        {esMaterial && (
          <>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2">Cant. (opcional)</th>
                    <th className="px-3 py-2">Unidad</th>
                    <th className="px-3 py-2">Monto bruto (opcional)</th>
                    {hayVariosProyectos && <th className="px-3 py-2">Proyecto</th>}
                    <th className="px-3 py-2">Etapa</th>
                    <th className="px-3 py-2">Notas</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {items.map((it) => {
                    const etapasFila = etapasPorProyecto[it.proyectoId] ?? etapas;
                    const materialesFila = materialesParaEtapa(materiales, it.etapaId);
                    return (
                      <tr key={it.key} className="bg-white dark:bg-zinc-950">
                        <td className="px-3 py-2">
                          <Combobox
                            value={it.material}
                            onChange={(value) => {
                              const match = materialesFila.find(
                                (m) => m.material.trim().toLowerCase() === value.trim().toLowerCase()
                              );
                              actualizarItem(it.key, {
                                material: value,
                                ...(match ? { unidad: match.unidad_default } : {}),
                              });
                            }}
                            options={materialesFila.map((m) => m.material)}
                            className={`${inputClass} min-w-[180px]`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.cantidad}
                            onChange={(e) => {
                              const nuevaCantidad = e.target.value;
                              const cantidadAnterior = Number(it.cantidad);
                              const montoAnterior = Number(it.montoTotal);
                              const precioUnitario =
                                cantidadAnterior > 0 && it.montoTotal !== ""
                                  ? montoAnterior / cantidadAnterior
                                  : null;
                              const nuevoMonto =
                                precioUnitario != null && nuevaCantidad
                                  ? String(Math.round(precioUnitario * Number(nuevaCantidad)))
                                  : it.montoTotal;
                              actualizarItem(it.key, { cantidad: nuevaCantidad, montoTotal: nuevoMonto });
                            }}
                            className={`${inputClass} !w-24`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={it.unidad}
                            onChange={(e) => actualizarItem(it.key, { unidad: e.target.value })}
                            className={`${inputClass} !w-24`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={it.montoTotal}
                            onChange={(e) => actualizarItem(it.key, { montoTotal: e.target.value })}
                            className={`${inputClass} !w-40`}
                          />
                        </td>
                        {hayVariosProyectos && (
                          <td className="px-3 py-2">
                            <select
                              value={it.proyectoId}
                              onChange={(e) => {
                                const nuevoProyectoId = e.target.value;
                                const etapasNuevoProyecto = etapasPorProyecto[nuevoProyectoId] ?? etapas;
                                const etapaSigueValida = etapasNuevoProyecto.some(
                                  (et) => String(et.id) === it.etapaId
                                );
                                actualizarItem(it.key, {
                                  proyectoId: nuevoProyectoId,
                                  etapaId: etapaSigueValida ? it.etapaId : "",
                                });
                              }}
                              className={`${inputClass} min-w-[180px]`}
                            >
                              {proyectosSeleccionados.map((pid) => {
                                const p = proyectos.find((pr) => pr.id === pid);
                                return (
                                  <option key={pid} value={pid}>
                                    {p?.nombre ?? pid}
                                  </option>
                                );
                              })}
                            </select>
                          </td>
                        )}
                        <td className="px-3 py-2">
                          <select
                            value={it.etapaId}
                            onChange={(e) =>
                              actualizarItem(it.key, { etapaId: e.target.value, material: "", unidad: "" })
                            }
                            className={`${inputClass} min-w-[220px]`}
                          >
                            <option value="">Sin etapa</option>
                            {etapasFila.map((etapa) => (
                              <option key={etapa.id} value={etapa.id}>
                                {etapa.orden}. {etapa.nombre}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={it.notas}
                            placeholder="opcional"
                            onChange={(e) => actualizarItem(it.key, { notas: e.target.value })}
                            className={`${inputClass} min-w-[160px]`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => duplicarItem(it.key)}
                              className="text-xs text-zinc-500 hover:text-brand hover:underline dark:text-zinc-400"
                            >
                              Duplicar
                            </button>
                            <button
                              type="button"
                              onClick={() => eliminarItem(it.key)}
                              className="text-xs text-red-600 hover:underline dark:text-red-400"
                            >
                              Quitar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, nuevoItemVacio(proyectoId)])}
                className={BTN_SECONDARY}
              >
                + Agregar ítem
              </button>
            </div>
          </>
        )}

        <div>
          <SubmitButton label="Registrar gasto" pending={isPending} />
        </div>
      </form>
    </div>
  );
}
