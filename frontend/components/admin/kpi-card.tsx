import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({
  label, value, hint, icon: Icon, tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClasses: Record<string, string> = {
    default: "bg-brand-50 text-brand-700",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
  };
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 text-3xl font-semibold text-foreground">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {Icon && (
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
