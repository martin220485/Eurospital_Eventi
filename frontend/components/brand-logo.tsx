"use client";

import { useState } from "react";
import { ListChecks } from "lucide-react";

export function BrandLogo({ className = "" }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = `/api/public/logo`;

  return (
    <div className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-brand-600 text-white ${className}`}>
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-contain bg-white"
          onError={() => setFailed(true)}
        />
      ) : (
        <ListChecks className="h-5 w-5" />
      )}
    </div>
  );
}
