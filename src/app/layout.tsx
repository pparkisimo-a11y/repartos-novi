import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { AppleSplashScreens } from "@/components/pwa/apple-splash";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Repartos NOVI — Gestión de reparto nocturno",
  description:
    "Sencilla gestión del reparto entre varios restaurantes y un repartidor. Solicita, acepta, recoge y entrega. Historial y estadísticas incluidas.",
  keywords: ["reparto", "kebab", "delivery", "repartidor", "restaurantes", "novi"],
  authors: [{ name: "Repartos NOVI" }],
  // PWA: instalable como app independiente (iPhone "Añadir a pantalla de inicio")
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Repartos NOVI",
  },
  // Evita que iOS convierta teléfonos en enlaces automáticamente
  formatDetection: { telephone: false },
  other: {
    // Nombre clásico de Apple (Next.js 16 emite el estándar "mobile-web-app-capable")
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#121212",
  width: "device-width",
  initialScale: 1,
  // Permitir zoom para accesibilidad (WCAG 1.4.4). Los usuarios con baja
  // visión deben poder hacer pellizco/zoom. iOS Safari lo permite igualmente
  // en la PWA instalada; Android Chrome respeta estos valores.
  maximumScale: 5,
  userScalable: true,
  // Contenido a pantalla completa en iPhones con notch / Dynamic Island
  viewportFit: "cover",
  // Android/Chrome: al abrir el teclado el viewport se reajusta (en vez de
  // quedar el teclado encima), así los diálogos fijos no quedan tapados.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AppleSplashScreens />
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </body>
    </html>
  );
}
