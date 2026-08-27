import { compactCurrencyFormatter, currencyFormatter } from "@/lib/format";

interface Serie {
  total: number;
  teorico: number | null;
}

export interface EtapaGasto {
  nombre: string;
  orden: number;
  material: Serie;
  manoObra: Serie;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 3l8.5 14.5H1.5L10 3z" />
      <path strokeLinecap="round" d="M10 8.5v3.5" />
      <circle cx="10" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BarraSerie({ label, serie, maxEscala }: { label: string; serie: Serie; maxEscala: number }) {
  const tieneTeorico = serie.teorico != null;
  const sobrepasado = tieneTeorico && serie.total > serie.teorico!;
  const barColor = !tieneTeorico
    ? "var(--chart-sequential)"
    : sobrepasado
      ? "var(--status-critical)"
      : "var(--status-good)";
  const anchoBarraPct = Math.min(100, (serie.total / maxEscala) * 100);
  const posTeoricoPct = tieneTeorico ? Math.min(100, (serie.teorico! / maxEscala) * 100) : null;

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-xs text-zinc-500">{label}</div>
      <div className="relative h-3.5 flex-1 rounded bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded transition-[width]"
          style={{ width: `${anchoBarraPct}%`, backgroundColor: barColor }}
        />
        {posTeoricoPct != null && (
          <div
            className="absolute -top-0.5 h-[18px] w-0.5 -translate-x-1/2 bg-zinc-500 dark:bg-zinc-300"
            style={{ left: `${posTeoricoPct}%` }}
            title={`Presupuesto teórico: ${currencyFormatter.format(serie.teorico!)}`}
          />
        )}
      </div>
      <div className="flex w-44 shrink-0 items-center justify-end gap-1.5 text-xs">
        {tieneTeorico &&
          (sobrepasado ? (
            <WarningIcon className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-critical)]" />
          ) : (
            <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-good)]" />
          ))}
        <span className="text-zinc-700 dark:text-zinc-300">
          {currencyFormatter.format(serie.total)}
          {tieneTeorico && (
            <span className="text-zinc-400 dark:text-zinc-500">
              {" "}
              / {compactCurrencyFormatter.format(serie.teorico!)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export function GastoPorEtapaChart({ data }: { data: EtapaGasto[] }) {
  const maxEscala = Math.max(
    1,
    ...data.map((d) => Math.max(d.material.total, d.material.teorico ?? 0, d.manoObra.total, d.manoObra.teorico ?? 0))
  );
  const hayTeorico = data.some((d) => d.material.teorico != null || d.manoObra.teorico != null);

  return (
    <div>
      <div className="flex flex-col gap-4">
        {data
          .filter((d) => d.material.total > 0 || d.manoObra.total > 0 || d.material.teorico || d.manoObra.teorico)
          .map((d) => (
            <div key={d.nombre}>
              <p className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">{d.nombre}</p>
              <div className="flex flex-col gap-1">
                <BarraSerie label="Materiales" serie={d.material} maxEscala={maxEscala} />
                <BarraSerie label="Mano de obra" serie={d.manoObra} maxEscala={maxEscala} />
              </div>
            </div>
          ))}
      </div>
      {hayTeorico && (
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-900">
          <span className="flex items-center gap-1.5">
            <CheckIcon className="h-3.5 w-3.5 text-[color:var(--status-good)]" />
            Dentro del presupuesto teórico
          </span>
          <span className="flex items-center gap-1.5">
            <WarningIcon className="h-3.5 w-3.5 text-[color:var(--status-critical)]" />
            Se pasó del presupuesto teórico
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-0.5 bg-zinc-500 dark:bg-zinc-300" />
            Marca = presupuesto teórico de esa etapa
          </span>
        </div>
      )}
    </div>
  );
}
