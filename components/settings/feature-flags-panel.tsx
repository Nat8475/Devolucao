'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { FeatureFlag } from '@/lib/types';

const COPY: Record<string, string> = {
  confirmacao_chegada_filial:
    'Exige confirmação de chegada na filial antes de liberar a próxima etapa da transferência.',
  assinatura_baixa: 'Solicita assinatura do responsável no momento da baixa da devolução.',
  roteirizacao_coleta: 'Sugere roteirização automática para coletas agendadas.',
  batch_mode: 'Permite operar devoluções em lote.',
  email_devolucao_programada: 'Envia e-mail automático quando uma devolução é programada.',
};

const FASE_3_KEYS = new Set(['batch_mode', 'email_devolucao_programada']);

function Toggle({
  checked,
  disabled,
  saving,
  onToggle,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  saving?: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || saving}
      onClick={onToggle}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        checked ? 'bg-primary' : 'bg-input',
        (disabled || saving) && 'cursor-not-allowed opacity-50'
      )}
    >
      <span
        className={cn(
          'inline-block size-4 transform rounded-full bg-background shadow-sm transition-transform duration-150',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}

export function FeatureFlagsPanel() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/feature-flags');
      if (!res.ok) throw new Error('feature flags fetch failed');
      const data = await res.json();
      setFlags(data);
      setLoadError(null);
    } catch {
      setLoadError('Não foi possível carregar as funcionalidades. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function toggle(flag: FeatureFlag) {
    setSavingKey(flag.key);
    setError(null);
    try {
      const res = await fetch(`/api/feature-flags/${flag.key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !flag.enabled }),
      });
      if (!res.ok) {
        setError('Não foi possível salvar a alteração. Tente novamente.');
        return;
      }
      await load();
    } catch {
      setError('Não foi possível salvar a alteração. Tente novamente.');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Funcionalidades</CardTitle>
        <CardDescription>Ative ou desative comportamentos opcionais do sistema.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {loadError && (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {!loading && (
          <ul className="divide-y divide-border">
            {flags.map((flag) => {
              const isFase3 = FASE_3_KEYS.has(flag.key);
              return (
                <li key={flag.key} className="flex items-center justify-between gap-4 py-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{flag.key}</span>
                      {isFase3 && (
                        <Badge variant="outline" className="text-muted-foreground">
                          Disponível na Fase 3
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {COPY[flag.key] ?? flag.description ?? '—'}
                    </p>
                  </div>
                  <Toggle
                    checked={flag.enabled}
                    disabled={isFase3}
                    saving={savingKey === flag.key}
                    onToggle={() => toggle(flag)}
                    label={flag.key}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
