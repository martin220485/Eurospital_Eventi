"use client";

import Link from "next/link";
import {
  Bar, BarChart as RBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type BarDatum = { label: string; value: number; href?: string };

// Design tokens (mirror tailwind.config.ts; recharts needs concrete values).
const GRID = "hsl(214 32% 91%)"; // border
const AXIS = "hsl(215 16% 47%)"; // muted-foreground
const BRAND = "#3a7fb3"; // brand-500

export function BarChart({
  data, title, height = 240,
}: { data: BarDatum[]; title?: string; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const clickable = data.some((d) => d.href);
  return (
    <Card>
      {title && (
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nessun dato.</p>
        ) : (
          <>
            <div style={{ width: "100%", height }}>
              <ResponsiveContainer>
                <RBarChart
                  data={data}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(58,127,179,0.08)" }}
                    contentStyle={{ border: `1px solid ${GRID}`, borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar
                    dataKey="value"
                    fill={BRAND}
                    radius={[6, 6, 0, 0]}
                    cursor={clickable ? "pointer" : undefined}
                    onClick={(d: { payload?: BarDatum }) => {
                      if (d?.payload?.href) window.location.assign(d.payload.href);
                    }}
                  />
                </RBarChart>
              </ResponsiveContainer>
            </div>
            {clickable && (
              <p className="mt-1 text-center text-xs text-muted-foreground">
                Clicca una barra per filtrare il periodo
              </p>
            )}
            {/* Screen-reader alternative: charts aren't readable by assistive tech. */}
            <table className="sr-only">
              <caption>{title ? `Dati: ${title}` : "Dati grafico"}</caption>
              <thead>
                <tr>
                  <th scope="col">Periodo</th>
                  <th scope="col">Valore</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.label}>
                    <th scope="row">
                      {d.href ? <Link href={d.href}>{d.label}</Link> : d.label}
                    </th>
                    <td>{d.value}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Totale</th>
                  <td>{total}</td>
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
