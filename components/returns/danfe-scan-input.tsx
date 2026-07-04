'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseDanfeCode, type ParsedDanfeCode } from '@/lib/danfe-scanner';

export function DanfeScanInput({
  onScan,
}: {
  onScan: (result: Pick<ParsedDanfeCode, 'cnpjEmitente' | 'nNF'>) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const raw = e.currentTarget.value;
    const parsed = parseDanfeCode(raw);

    if (!parsed) {
      setError('Código não reconhecido. Tente novamente ou preencha manualmente.');
    } else {
      setError(null);
      onScan(parsed);
    }

    e.currentTarget.value = '';
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="danfe-scan">Leitor de código de barras</Label>
      <Input
        id="danfe-scan"
        autoFocus
        placeholder="Aponte o leitor de código de barras aqui"
        onKeyDown={handleKeyDown}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
