import "./globals.css";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";

export const metadata = {
  title: "Eurospital Eventi",
  description: "Event booking platform",
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
