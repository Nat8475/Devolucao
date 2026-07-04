'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseNFeXml, type ParsedNFe } from '@/lib/xml-parser';

export function XmlUpload({ onParsed }: { onParsed: (data: ParsedNFe) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const text = await file.text();
    try {
      onParsed(parseNFeXml(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ler o XML');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".xml"
        onChange={handleFile}
        className="hidden"
        id="xml-input"
      />
      <Button type="button" variant="outline" className="cursor-pointer" onClick={() => inputRef.current?.click()}>
        <Upload />
        Importar XML da NF-e
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
