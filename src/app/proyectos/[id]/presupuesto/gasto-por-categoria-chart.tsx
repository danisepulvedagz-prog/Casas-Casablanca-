"use client";

import type { BarShapeProps } from "recharts";
import { Bar, BarChart, CartesianGrid, LabelList, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { categoriaChartColorVar, compactCurrencyFormatter, currencyFormatter } from "@/lib/format";

interface CategoriaGastoRow {
  categoria: string;
  total: number;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CategoriaGastoRow }[];
}) {
  if (!active || !payload?.length) return null;
  const { categoria, total } = payload[0].payload;
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-semibold text-zinc-900 dark:text-zinc-50">{currencyFormatter.format(total)}</p>
      <p className="text-zinc-500">{categoria}</p>
    </div>
  );
}

function CategoriaBarShape(props: BarShapeProps) {
  const payload = props.payload as CategoriaGastoRow;
  const fill = categoriaChartColorVar[payload.categoria] ?? "var(--chart-sequential)";
  return <Rectangle {...props} fill={fill} />;
}

export function GastoPorCategoriaChart({ data }: { data: CategoriaGastoRow[] }) {
  const height = Math.max(160, data.length * 40);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 24, right: 72 }}>
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="0" />
        <XAxis
          type="number"
          tickFormatter={(v: number) => compactCurrencyFormatter.format(v)}
          tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
          axisLine={{ stroke: "var(--chart-grid)" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="categoria"
          width={110}
          tick={{ fill: "var(--chart-text-secondary)", fontSize: 12 }}
          axisLine={{ stroke: "var(--chart-grid)" }}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }} />
        <Bar dataKey="total" barSize={20} radius={[0, 4, 4, 0]} shape={CategoriaBarShape} isAnimationActive={false}>
          <LabelList
            dataKey="total"
            position="right"
            formatter={(v: React.ReactNode) => currencyFormatter.format(Number(v))}
            fill="var(--chart-text-secondary)"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
