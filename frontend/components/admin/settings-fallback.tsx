import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-44" />
      <Skeleton className="h-64" />
    </div>
  );
}

export function SettingsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-destructive">Impossibile caricare le impostazioni. {message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw className="h-4 w-4" /> Riprova
        </Button>
      </CardContent>
    </Card>
  );
}
