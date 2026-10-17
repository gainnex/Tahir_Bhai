"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAmount } from "@/lib/format";

// Single-series horizontal bar chart for "amount per category" (spend by head, by project).
// One hue (magnitude, not identity), bars ≤ 24px with a rounded data-end, value at the tip,
// hairline grid, hover tooltip. The page always shows the same numbers in a table too.
// Colours come from the shadcn theme tokens (globals.css).

const SERIES = "var(--chart-1)";
const GRID = "var(--border)";
const TEXT = "var(--foreground)";
const TEXT_MUTED = "var(--muted-foreground)";
const MONO = "var(--font-mono)";

export type AmountDatum = { name: string; amount: string }; // amount = decimal string

function compact(n: number) {
  if (n >= 10_000_000) return `${+(n / 10_000_000).toFixed(1)} Cr`;
  if (n >= 100_000) return `${+(n / 100_000).toFixed(1)} Lac`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function AmountBarChart({ data, currency = "PKR" }: { data: AmountDatum[]; currency?: string }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No approved expenses yet.</p>;
  }
  // Numbers are only used for bar length; labels use the exact decimal strings.
  const rows = data.map((d) => ({ ...d, value: Number(d.amount) }));
  const height = rows.length * 36 + 32;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 88, bottom: 4, left: 4 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={GRID} strokeWidth={1} />
          <XAxis
            type="number"
            tickFormatter={compact}
            tick={{ fill: TEXT_MUTED, fontSize: 11, fontFamily: MONO }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tick={{ fill: TEXT, fontSize: 12 }}
            axisLine={{ stroke: GRID }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            formatter={(_v, _n, item) => [`${currency} ${formatAmount(item.payload.amount)}`, "Spent"]}
            contentStyle={{
              borderRadius: 8,
              borderColor: GRID,
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
            }}
          />
          <Bar dataKey="value" fill={SERIES} barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="amount"
              position="right"
              formatter={(v) => formatAmount(String(v))}
              style={{ fill: TEXT, fontSize: 11, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
