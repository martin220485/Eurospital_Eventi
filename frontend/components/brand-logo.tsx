"use client";

import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";

export function BrandLogo({ className = "" }: { className?: string }) {
  const [hasLogo, setHasLogo] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/public/logo", { method: "HEAD" })
      .then((r) => setHasLogo(r.ok))
      .catch(() => setHasLogo(false));
  }, []);

  return (
    <div className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-brand-600 text-white ${className}`}>
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/api/public/logo" alt="" className="h-full w-full object-contain" />
      ) : (
        <ListChecks className="h-5 w-5" />
      )}
    </div>
  );
}
