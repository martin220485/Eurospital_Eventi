import "./globals.css";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";

export const metadata = {
  title: "Eurospital Eventi",
  description: "Event booking platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
