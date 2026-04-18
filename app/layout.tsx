import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "CREDICELL · Ventas",
  description: "Sistema de ventas multi-sede para CREDICELL",
  manifest: "/manifest.json"
};

export const viewport: Viewport = {
  themeColor: "#ff6a00",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
