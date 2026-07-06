'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/settings/suppliers', label: 'Fornecedores e Motivos' },
  { href: '/settings/branches', label: 'Filiais' },
  { href: '/settings/features', label: 'Funcionalidades' },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 border-b border-border" aria-label="Configurações">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'cursor-pointer px-3 py-2 text-sm font-medium transition-colors duration-150',
              isActive
                ? 'border-b-2 border-brand text-foreground'
                : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
