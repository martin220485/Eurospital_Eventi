"use client";

import {
  Bar, BarChart as RBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type BarDatum = { label: string; value: number };

export function BarChart({
  data, title, height = 240,
}: { data: BarDatum[]; title?: string; height?: number }) {
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
          <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
              <RBarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(58,127,179,0.08)" }}
                  contentStyle={{
                    border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12,
                  }}
                />
                <Bar dataKey="value" fill="#3a7fb3" radius={[6, 6, 0, 0]} />
              </RBarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
