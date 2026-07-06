'use client';

import { useEffect, useState } from 'react';

/**
 * Detecta se o R2 está configurado no servidor sem expor um endpoint dedicado:
 * `POST /api/files` valida `isR2Configured()` antes de qualquer outra coisa
 * (inclusive antes de exigir `file`), então um FormData vazio responde 503
 * quando R2 está off e 400 (ou outro erro de validação) quando está ligado —
 * nenhum dos dois caminhos grava nada.
 */
export function useR2Status(): boolean | null {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/files', { method: 'POST', body: new FormData() });
        if (!cancelled) setConfigured(res.status !== 503);
      } catch {
        if (!cancelled) setConfigured(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return configured;
}
