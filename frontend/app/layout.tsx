import type { ReactNode } from "react";

export const metadata = {
  title: "Eurospital Eventi",
  description: "Event booking platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
