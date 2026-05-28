import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  featured = false,
  compact = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  /** Semantic state. Use only when the color means something (good/attention/bad). */
  tone?: "default" | "success" | "warning" | "danger";
  /** Visual emphasis for the primary health metric. */
  featured?: boolean;
  /** Smaller, clamped value for long text (e.g. an event title). */
  compact?: boolean;
}) {
  const toneClasses: Record<string, string> = {
    default: "bg-brand-50 text-brand-700",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
  };
  return (
    <Card className={cn(featured && "shadow-card ring-1 ring-brand-200")}>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div
            className={cn(
              "mt-1 font-semibold text-foreground",
              compact
                ? "line-clamp-2 text-lg leading-snug"
                : featured
                  ? "text-4xl"
                  : "text-3xl",
            )}
          >
            {value}
          </div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {Icon && (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              toneClasses[tone],
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
