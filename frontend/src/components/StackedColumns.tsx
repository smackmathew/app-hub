// Daily columns, stacked by app. Hover a column for every app's value that day; "Table"
// shows the same numbers without hovering.
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { formatDay } from "../lib/format";

export interface Series {
  key: string;
  name: string;
  color: string;
}

interface Props {
  title: string;
  rows: Array<Record<string, number | string>>;
  series: Series[];
  format: (value: number) => string;
  formatAxis?: (value: number) => string;
  /** The smallest top of the value axis, so an all-zero chart still has distinct ticks. */
  minTop?: number;
}

function ChartTooltip({ active, payload, label, series, format }: TooltipProps<number, string> & { series: Series[]; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Record<string, number>;
  const total = series.reduce((sum, s) => sum + (Number(row[s.key]) || 0), 0);
  return (
    <div className="card min-w-[10rem] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-ink-2">{formatDay(String(label), true)}</p>
      {[...series].reverse().map((s) => (
        <p key={s.key} className="flex items-center gap-2 py-0.5">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
          <span className="tabular font-semibold text-ink">{format(Number(row[s.key]) || 0)}</span>
          <span className="truncate text-ink-2">{s.name}</span>
        </p>
      ))}
      {series.length > 1 && (
        <p className="mt-1 border-t border-line pt-1 text-ink-2">
          Total <span className="tabular font-semibold text-ink">{format(total)}</span>
        </p>
      )}
    </div>
  );
}

export default function StackedColumns({ title, rows, series, format, formatAxis = format, minTop = 4 }: Props) {
  const [asTable, setAsTable] = useState(false);
  const total = rows.reduce((sum, r) => sum + series.reduce((s, x) => s + (Number(r[x.key]) || 0), 0), 0);
  const tickEvery = Math.max(1, Math.ceil(rows.length / 7));

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-ink-2">{title}</h3>
          <p className="text-xl font-semibold">{format(total)}</p>
        </div>
        <button className="text-xs font-medium text-ink-2 hover:text-ink" onClick={() => setAsTable((t) => !t)}>
          {asTable ? "Chart" : "Table"}
        </button>
      </div>

      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}

      {asTable ? (
        <div className="max-h-64 overflow-auto text-xs">
          <table className="tabular w-full">
            <thead className="sticky top-0 bg-surface text-left text-ink-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Day</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1 pr-3 text-right font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={String(r.date)} className="border-t border-line">
                  <td className="py-1 pr-3 text-ink-2">{formatDay(String(r.date))}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1 pr-3 text-right">
                      {format(Number(r[s.key]) || 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-56 overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%" stackOffset="sign">
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => formatDay(d)}
                interval={tickEvery - 1}
                tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
                axisLine={{ stroke: "var(--axis)" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatAxis}
                width={52}
                tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(minTop, max)]}
              />
              <Tooltip cursor={{ fill: "var(--line)", opacity: 0.5 }} content={<ChartTooltip series={series} format={format} />} />
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  stackId="stack"
                  fill={s.color}
                  stroke="var(--surface)"
                  strokeWidth={series.length > 1 ? 1 : 0}
                  maxBarSize={24}
                  radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
