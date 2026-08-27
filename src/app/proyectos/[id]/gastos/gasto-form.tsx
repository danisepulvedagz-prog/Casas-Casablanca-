"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/proyectos/[id]/gastos/actions";
import type { Database } from "@/lib/supabase/types";
import { BTN_PRIMARY } from "@/lib/ui";

type Gasto = Database["public"]["Tables"]["gastos"]["Row"];
type CatalogoEtapa = Database["public"]["Tables"]["catalogo_etapas"]["Row"];
type CatalogoMaterial = Pick<
  Database["public"]["Tables"]["catalogo_materiales"]["Row"],
  "etapa_id" | "material" | "unidad_default"
>;

interface FacturaPadre {
  proveedor: string | null;
  n_documento: string | null;
  fecha: string;
  fotoUrlFirmada: string | null;
}

interface TransferenciaPadre {
  destinatario: string | null;
  n_operacion: string | null;
  fecha: string;
  fotoUrlFirmada: string | null;
}

interface GastoFormProps {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  etapas: CatalogoEtapa[];
  materiales: CatalogoMaterial[];
  gasto?: Gasto;
  etapaIdInicial?: number | null;
  materialInicial?: string;
  proyectoId?: string;
  facturaPadre?: FacturaPadre | null;
  transferenciaPadre?: TransferenciaPadre | null;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={BTN_PRIMARY}>
      {pending ? "Guardando..." : label}
    </button>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Formulario de un solo gasto — hoy solo lo usa la página de edición (la
 * creación de gastos nuevos pasa por el asistente en /gastos/nuevo, que
 * separa Mano de Obra de Material-con-factura-de-varios-ítems).
 */
export function GastoForm({
  action,
  etapas,
  materiales,
  gasto,
  etapaIdInicial,
  materialInicial,
  proyectoId,
  facturaPadre,
  transferenciaPadre,
}: GastoFormProps) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  const [categoria, setCategoria] = useState(gasto?.categoria ?? "Material");
  const [etapaId, setEtapaId] = useState(String(gasto?.etapa_id ?? etapaIdInicial ?? ""));
  const [material, setMaterial] = useState(gasto?.material ?? materialInicial ?? "");
  const [unidad, setUnidad] = useState(gasto?.unidad ?? "");
  const esManoDeObra = categoria === "Mano de Obra";
  // Viene de una factura o transferencia: la categoría y el proveedor/
  // destinatario ya quedaron fijados al crearlo desde ese documento — se
  // muestran de solo lectura en vez de los campos genéricos.
  const esVinculado = !!facturaPadre || !!transferenciaPadre;

  const materialesFiltrados = useMemo(() => {
    const lista = etapaId
      ? materiales.filter((m) => String(m.etapa_id) === etapaId)
      : materiales;
    const vistos = new Set<string>();
    const dedup = lista.filter((m) => {
      const key = m.material.trim().toLowerCase();
      if (vistos.has(key)) return false;
      vistos.add(key);
      return true;
    });
    // "Otros" siempre disponible como opción genérica en cualquier etapa,
    // para gastos que no calzan con ningún material del catálogo.
    if (vistos.has("otros")) return dedup;
    return [...dedup, { etapa_id: etapaId ? Number(etapaId) : null, material: "Otros", unidad_default: "" }];
  }, [materiales, etapaId]);

  function handleMaterialChange(value: string) {
    setMaterial(value);
    const match = materialesFiltrados.find(
      (m) => m.material.trim().toLowerCase() === value.trim().toLowerCase()
    );
    if (match) setUnidad(match.unidad_default);
  }

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="categoria">
            Categoría
          </label>
          {esVinculado ? (
            <>
              <input type="hidden" name="categoria" value={categoria} />
              <p className={`${inputClass} bg-zinc-50 dark:bg-zinc-900`}>{categoria}</p>
            </>
          ) : (
            <select
              id="categoria"
              name="categoria"
              required
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as typeof categoria)}
              className={inputClass}
            >
              <option value="Material">Material</option>
              <option value="Mano de Obra">Mano de Obra</option>
            </select>
          )}
        </div>
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
              // El material del catálogo depende de la etapa — al cambiarla
              // se limpia para forzar a elegir uno nuevo (si no, el
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
      </div>

      {facturaPadre && (
        <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <p className="mb-1 text-xs font-medium uppercase text-zinc-500">Factura</p>
          <p className="text-zinc-900 dark:text-zinc-100">
            {facturaPadre.proveedor ?? "Proveedor sin nombre"}
            {facturaPadre.n_documento ? ` · N° ${facturaPadre.n_documento}` : ""}
          </p>
          <div className="mt-1 flex gap-3">
            {facturaPadre.fotoUrlFirmada && (
              <a
                href={facturaPadre.fotoUrlFirmada}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-brand hover:underline"
              >
                Ver foto completa
              </a>
            )}
            {proyectoId && gasto?.factura_id && (
              <Link
                href={`/proyectos/${proyectoId}/gastos/factura/${gasto.factura_id}/editar`}
                className="text-sm text-brand hover:underline"
              >
                Editar datos de la factura
              </Link>
            )}
          </div>
        </div>
      )}

      {transferenciaPadre && (
        <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <p className="mb-1 text-xs font-medium uppercase text-zinc-500">Transferencia</p>
          <p className="text-zinc-900 dark:text-zinc-100">
            {transferenciaPadre.destinatario ?? "Destinatario sin nombre"}
            {transferenciaPadre.n_operacion ? ` · N° ${transferenciaPadre.n_operacion}` : ""}
          </p>
          <div className="mt-1 flex gap-3">
            {transferenciaPadre.fotoUrlFirmada && (
              <a
                href={transferenciaPadre.fotoUrlFirmada}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-brand hover:underline"
              >
                Ver foto completa
              </a>
            )}
            {proyectoId && gasto?.transferencia_id && (
              <Link
                href={`/proyectos/${proyectoId}/gastos/transferencia/${gasto.transferencia_id}/editar`}
                className="text-sm text-brand hover:underline"
              >
                Editar datos de la transferencia
              </Link>
            )}
          </div>
        </div>
      )}

      {!esVinculado && (
        <div>
          <label className={labelClass} htmlFor="foto">
            {esManoDeObra ? "Foto de la transferencia (opcional)" : "Factura o boleta (opcional)"}
          </label>
          <input
            id="foto"
            name="foto"
            type="file"
            accept="image/*,application/pdf"
            className={`${inputClass} file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:text-zinc-700 dark:file:bg-zinc-800 dark:file:text-zinc-200`}
          />
          {gasto?.foto_boleta_url && (
            <p className="mt-1 text-xs text-zinc-500">
              Ya tiene una foto guardada — sube una nueva solo si quieres reemplazarla.
            </p>
          )}
        </div>
      )}

      {!esManoDeObra && (
        <div>
          <label className={labelClass} htmlFor="material">
            Material / concepto
          </label>
          <input
            id="material"
            name="material"
            list="materiales-list"
            value={material}
            onChange={(e) => handleMaterialChange(e.target.value)}
            className={inputClass}
          />
          <datalist id="materiales-list">
            {materialesFiltrados.map((m) => (
              <option key={m.material} value={m.material} />
            ))}
          </datalist>
          {etapaId && materialesFiltrados.length <= 1 && (
            <p className="mt-1 text-xs text-zinc-500">
              Esta etapa no tiene materiales en el catálogo todavía (puedes usar &quot;Otros&quot;).
            </p>
          )}
        </div>
      )}

      {!esManoDeObra && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="cantidad">
              Cantidad
            </label>
            <input
              id="cantidad"
              name="cantidad"
              type="number"
              step="0.01"
              min="0"
              defaultValue={gasto?.cantidad ?? ""}
              className={inputClass}
            />
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
      )}

      <div>
        <label className={labelClass} htmlFor="monto_total">
          Monto bruto total
        </label>
        <input
          id="monto_total"
          name="monto_total"
          type="number"
          step="1"
          min="0"
          required
          defaultValue={gasto?.monto_total}
          className={inputClass}
        />
        {!esManoDeObra && (
          <p className="mt-1 text-xs text-zinc-500">
            Si ingresas cantidad, el costo unitario se calcula solo (monto total / cantidad).
          </p>
        )}
      </div>

      {!esManoDeObra && !esVinculado && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="proveedor">
              Proveedor
            </label>
            <input
              id="proveedor"
              name="proveedor"
              defaultValue={gasto?.proveedor ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="n_documento">
              N° documento
            </label>
            <input
              id="n_documento"
              name="n_documento"
              defaultValue={gasto?.n_documento ?? ""}
              className={inputClass}
            />
          </div>
        </div>
      )}

      <div>
        <label className={labelClass} htmlFor="fecha">
          Fecha
        </label>
        <input
          id="fecha"
          name="fecha"
          type="date"
          required
          defaultValue={gasto?.fecha ?? today()}
          className={inputClass}
        />
      </div>

      {!esManoDeObra && (
        <div>
          <label className={labelClass} htmlFor="registrado_por">
            Registrado por
          </label>
          <input
            id="registrado_por"
            name="registrado_por"
            defaultValue={gasto?.registrado_por ?? ""}
            className={inputClass}
          />
        </div>
      )}

      {!esManoDeObra && (
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" name="reembolso" defaultChecked={gasto?.reembolso ?? false} />
          Es un reembolso
        </label>
      )}

      <div>
        <label className={labelClass} htmlFor="notas">
          Notas (opcional)
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={2}
          defaultValue={gasto?.notas ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <SubmitButton label={gasto ? "Guardar cambios" : "Registrar gasto"} />
      </div>
    </form>
  );
}
