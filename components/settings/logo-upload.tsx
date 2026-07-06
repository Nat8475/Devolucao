'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { FileRecord } from '@/lib/types';

export function LogoUpload() {
  const [logo, setLogo] = useState<FileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/files?entity_type=system&file_type=logo');
      if (res.ok) {
        const data: FileRecord[] = await res.json();
        setLogo(data[0] ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setStorageUnavailable(false);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('entity_type', 'system');
      form.append('file_type', 'logo');
      const res = await fetch('/api/files', { method: 'POST', body: form });
      if (res.status === 503) {
        setStorageUnavailable(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'Não foi possível enviar o logo.');
        return;
      }
      await load();
    } catch {
      setError('Não foi possível enviar o logo. Tente novamente.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo da etiqueta</CardTitle>
        <CardDescription>Usado na impressão da etiqueta térmica das transferências.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {!loading && (
          <div className="flex items-center gap-4">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40">
              {logo?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo.url} alt="Logo atual da etiqueta" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="px-2 text-center text-xs text-muted-foreground">Sem logo</span>
              )}
            </div>
            <div className="flex-1 space-y-1">
              {logo?.filename && (
                <p className="text-sm text-foreground">{logo.filename}</p>
              )}
              <p className="text-xs text-muted-foreground">
                PNG/SVG em preto sólido — JPEG/foto sai fraco na térmica.
              </p>
            </div>
          </div>
        )}

        {storageUnavailable ? (
          <p className="text-sm text-muted-foreground" role="status">
            Armazenamento (R2) não configurado neste ambiente.
          </p>
        ) : (
          <div className="space-y-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png, image/svg+xml"
              aria-label="Enviar logo da etiqueta"
              disabled={uploading}
              onChange={handleFileChange}
              className="block w-full cursor-pointer text-sm text-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {uploading && <p className="text-sm text-muted-foreground">Enviando...</p>}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
