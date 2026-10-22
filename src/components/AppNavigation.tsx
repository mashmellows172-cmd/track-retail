'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ScanLine, Receipt, Package } from 'lucide-react';

const sections = [
  { href: '/', label: 'Inicio', icon: LayoutDashboard },
  { href: '/catalogo', label: 'Catálogo', icon: Package },
  { href: '/registro', label: 'Registrar', icon: ScanLine },
  { href: '/historial', label: 'Historial', icon: Receipt },
];

export default function AppNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return <nav aria-label={mobile ? 'Navegación móvil' : 'Secciones de la aplicación'} className={mobile
    ? 'md:hidden fixed bottom-0 left-0 right-0 z-50 grid grid-cols-4 gap-2 border-t border-surface-border bg-surface-elevated px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]'
    : 'flex-1 flex flex-col gap-2 px-4'}>
    {sections.map(({ href, label, icon: Glyph }) => {
      const active = pathname === href;
      return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`${mobile ? 'flex-col gap-1 py-2' : 'gap-3 px-4 py-3'} flex min-h-12 min-w-0 items-center rounded-xl transition-colors ${active ? 'bg-secondary/15 text-secondary font-semibold' : 'text-on-surface-variant hover:bg-surface-base hover:text-on-surface'}`}>
        <Glyph size={22} aria-hidden="true" className="shrink-0" />
        <span className={mobile ? 'text-xs' : 'text-sm'}>{label}</span>
      </Link>;
    })}
  </nav>;
}
