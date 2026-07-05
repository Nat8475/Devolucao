'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { FeatureFlag } from '@/lib/types';

export function RotaSuggestionLink() {
  const [flagOn, setFlagOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/feature-flags')
      .then((res) => (res.ok ? res.json() : []))
      .then((flags: FeatureFlag[]) => {
        if (cancelled) return;
        setFlagOn(flags.find((f) => f.key === 'roteirizacao_coleta')?.enabled ?? false);
      })
      .catch(() => {
        if (!cancelled) setFlagOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!flagOn) return null;

  return (
    <Button asChild variant="outline" className="cursor-pointer">
      <Link href="/transfers/rotas">Sugestão de rota</Link>
    </Button>
  );
}
