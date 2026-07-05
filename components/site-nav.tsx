'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/returns', label: 'Devoluções' },
  { href: '/transfers', label: 'Transferências' },
  { href: '/returns/new', label: 'Lançamento' },
  { href: '/trash', label: 'Lixeira' },
  { href: '/settings/suppliers', label: 'Configurações' },
];

// '/returns' deve marcar ativo em '/returns' e '/returns/[id]' (detalhe), mas
// não em '/returns/new' — essa rota tem seu próprio item ("Lançamento").
function isLinkActive(pathname: string, href: string): boolean {
  if (href === '/returns') {
    return pathname === '/returns' || (/^\/returns\/[^/]+$/.test(pathname) && pathname !== '/returns/new');
  }
  // 'Configurações' aponta pra /settings/suppliers mas cobre toda a seção
  // /settings/* (branches, features, ...) — o sub-nav interno diferencia.
  if (href === '/settings/suppliers') {
    return pathname === '/settings' || pathname.startsWith('/settings/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const pathname = usePathname();

  // Tela de login fica limpa, sem navegação (ver docs/design-system.md — Task 8).
  if (!pathname || pathname.startsWith('/login') || pathname.startsWith('/auth')) return null;

  return (
    <header className="border-b border-border bg-card">
      <nav className="mx-auto flex h-12 max-w-6xl items-center gap-1 px-6" aria-label="Navegação principal">
        <span className="font-heading text-sm font-semibold text-brand">Devoluções</span>
        <div className="ml-4 flex items-center gap-1">
          {LINKS.map((link) => {
            const isActive = isLinkActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'border-b-2 border-brand text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
