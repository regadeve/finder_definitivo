import type { Metadata } from "next";
import { Suspense } from "react";
import NavProgress from "@/components/NavProgress";
import UserPresenceHeartbeat from "@/components/UserPresenceHeartbeat";
import "./globals.css";

export const metadata: Metadata = {
  title: "103 FINDER",
  description: "Acceso y busqueda avanzada de referencias en Discogs con streaming en tiempo real.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className="antialiased"
        style={{
          ["--font-body-sans" as string]: '"Segoe UI", "Trebuchet MS", sans-serif',
          ["--font-display-serif" as string]: 'Georgia, "Times New Roman", serif',
          ["--font-code-mono" as string]: '"Consolas", "Courier New", monospace',
        }}
      >
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <UserPresenceHeartbeat />
        {children}
      </body>
    </html>
  );
}
