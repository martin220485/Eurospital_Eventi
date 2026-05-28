export type BarDatum = { label: string; value: number };

export function BarChart({
  data, height = 160, title,
}: { data: BarDatum[]; height?: number; title?: string }) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const barWidth = 100 / Math.max(data.length, 1);

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      {title && <h3 className="mb-3 text-sm font-medium text-gray-700">{title}</h3>}
      {data.length === 0 ? (
        <p className="text-sm text-gray-500">Nessun dato.</p>
      ) : (
        <svg
          role="img"
          aria-label={title ?? "grafico a barre"}
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height }}
        >
          {data.map((d, i) => {
            const h = (d.value / max) * (height - 30);
            const x = i * barWidth;
            const y = height - 20 - h;
            return (
              <g key={d.label}>
                <rect
                  x={x + barWidth * 0.1}
                  y={y}
                  width={barWidth * 0.8}
                  height={h}
                  fill="#3b82f6"
                />
                <text
                  x={x + barWidth / 2}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize="3"
                  fill="#6b7280"
                >
                  {d.label.slice(-2)}
                </text>
                <text
                  x={x + barWidth / 2}
                  y={Math.max(y - 1, 5)}
                  textAnchor="middle"
                  fontSize="3"
                  fill="#374151"
                >
                  {d.value}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
