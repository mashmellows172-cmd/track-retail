import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import VendedorSelector from "@/components/VendedorSelector";
import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";
import { ToastProvider } from "@/components/ToastProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import OfflineSyncManager from "@/components/OfflineSyncManager";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });
const outfit = Outfit({ subsets: ["latin"], variable: '--font-outfit' });

export const metadata: Metadata = {
  title: "BryanApp",
  description: "Sales Intelligence",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BryanApp",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#10131a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const bodyClass = [
    inter.variable,
    outfit.variable,
    'bg-background',
    'text-on-surface',
    'font-body-md',
    'overflow-x-hidden',
    'min-h-[100dvh]',
    'relative',
    'flex',
    'flex-col',
    'md:flex-row',
  ].join(' ');

  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body className={bodyClass}>
        <ErrorBoundary>
          {/* Mobile Top Header (Hidden on Desktop) */}
          <div className="md:hidden flex items-center justify-between p-4 border-b border-surface-border bg-surface-base sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-background text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>insights</span>
              </div>
              <span className="font-headline-sm text-on-surface font-bold text-lg">BryanApp</span>
            </div>
            <div className="w-1/2 max-w-[150px] flex items-center gap-2">
              <ThemeToggle />
              <VendedorSelector />
            </div>
          </div>

          {/* Desktop SideNavBar */}
          <aside className="hidden md:flex flex-col fixed left-4 top-4 bottom-4 w-64 rounded-xl border border-surface-border bg-surface-elevated py-8 z-50">
            {/* Logo */}
            <div className="px-6 mb-8 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                <span
                  className="material-symbols-outlined text-background"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  insights
                </span>
              </div>
              <div className="flex-1">
                <h1 className="font-headline-md text-headline-md font-bold text-on-surface">BryanApp</h1>
                <p className="font-label-sm text-label-sm text-on-surface-variant/70">Inteligencia de Ventas</p>
              </div>
              <ThemeToggle />
            </div>

            {/* CTA */}
            <div className="px-6 mb-8">
              <Link
                href="/registro"
                className="w-full bg-gradient-to-r from-primary-container to-inverse-primary text-on-primary-container font-label-md text-label-md py-3 rounded-lg flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform shadow-[0_0_15px_rgba(77,142,255,0.3)]"
              >
                <span className="material-symbols-outlined text-[20px]">add</span>
                Nuevo Registro
              </Link>
            </div>

            {/* Nav Links */}
            <nav className="flex-1 flex flex-col gap-1 px-2">
              <Link
                href="/"
                className="flex items-center gap-3 px-4 py-3 text-on-surface-variant/70 hover:text-on-surface hover:bg-white/10 mx-2 rounded-lg hover:translate-x-1 transition-all duration-200"
              >
                <span className="material-symbols-outlined">dashboard</span>
                <span className="font-label-md text-label-md">Panel de Control</span>
              </Link>
              <Link
                href="/registro"
                className="flex items-center gap-3 px-4 py-3 text-on-surface-variant/70 hover:text-on-surface hover:bg-white/10 mx-2 rounded-lg hover:translate-x-1 transition-all duration-200"
              >
                <span className="material-symbols-outlined">qr_code_scanner</span>
                <span className="font-label-md text-label-md">Registrar Boleta</span>
              </Link>
              <Link
                href="/historial"
                className="flex items-center gap-3 px-4 py-3 text-on-surface-variant/70 hover:text-on-surface hover:bg-white/10 mx-2 rounded-lg hover:translate-x-1 transition-all duration-200"
              >
                <span className="material-symbols-outlined">receipt_long</span>
                <span className="font-label-md text-label-md">Historial</span>
              </Link>
            </nav>

            {/* User */}
            <div className="mt-auto px-4">
              <VendedorSelector />
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 w-full md:ml-[280px] p-4 md:p-10 min-h-[100dvh] flex flex-col gap-8 pb-24 md:pb-10 relative">
            <ToastProvider>
              <OfflineSyncManager />
              {children}
            </ToastProvider>
          </main>

          {/* Mobile Bottom Nav */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface-elevated border-t border-surface-border z-50 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] px-4 flex justify-around items-center">
            <Link href="/" className="flex flex-col items-center gap-1 p-2 text-on-surface-variant hover:text-secondary transition-colors">
              <span className="material-symbols-outlined">dashboard</span>
              <span className="font-label-sm text-[10px]">Inicio</span>
            </Link>
            <div className="relative -top-5">
              <Link
                href="/registro"
                className="w-14 h-14 rounded-full bg-gradient-to-tr from-primary to-primary-container text-on-primary-container flex items-center justify-center shadow-[0_0_20px_rgba(77,142,255,0.5)] border-2 border-surface-container"
              >
                <span className="material-symbols-outlined text-[28px]">add</span>
              </Link>
            </div>
            <Link href="/historial" className="flex flex-col items-center gap-1 p-2 text-on-surface-variant hover:text-secondary transition-colors">
              <span className="material-symbols-outlined">receipt_long</span>
              <span className="font-label-sm text-[10px]">Historial</span>
            </Link>
          </nav>
          <div className="md:hidden h-20 w-full" />
        </ErrorBoundary>
      </body>
    </html>
  );
}
