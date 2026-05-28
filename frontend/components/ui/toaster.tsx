"use client";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      toastOptions={{
        classNames: {
          toast: "rounded-md border shadow-card",
        },
      }}
    />
  );
}

export { toast } from "sonner";
