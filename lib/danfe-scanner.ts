export interface ParsedDanfeCode {
  chaveAcesso: string;
  cnpjEmitente: string;
  nNF: string;
}

function extractChaveFromQrParam(raw: string): string | null {
  try {
    const url = new URL(raw);
    const p = url.searchParams.get('p');
    if (!p) return null;
    return p.split('|')[0];
  } catch {
    return null;
  }
}

export function parseDanfeCode(raw: string): ParsedDanfeCode | null {
  const trimmed = raw.trim();
  const candidate = /^\d{44}$/.test(trimmed) ? trimmed : extractChaveFromQrParam(trimmed);

  if (!candidate || !/^\d{44}$/.test(candidate)) {
    return null;
  }

  const cnpjEmitente = candidate.slice(6, 20);
  const nNF = String(parseInt(candidate.slice(25, 34), 10));

  return { chaveAcesso: candidate, cnpjEmitente, nNF };
}
