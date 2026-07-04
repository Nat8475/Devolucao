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

// Dígito verificador da chave de acesso (posição 44): mod-11 sobre os 43
// primeiros dígitos, pesos 2..9 aplicados da direita para a esquerda;
// DV = 11 - (soma % 11), com DV = 0 quando o resultado seria 10 ou 11.
function hasValidCheckDigit(chave: string): boolean {
  let weight = 2;
  let sum = 0;
  for (let i = 42; i >= 0; i--) {
    sum += Number(chave[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const result = 11 - (sum % 11);
  const dv = result >= 10 ? 0 : result;
  return dv === Number(chave[43]);
}

export function parseDanfeCode(raw: string): ParsedDanfeCode | null {
  const trimmed = raw.trim();
  const candidate = /^\d{44}$/.test(trimmed) ? trimmed : extractChaveFromQrParam(trimmed);

  if (!candidate || !/^\d{44}$/.test(candidate) || !hasValidCheckDigit(candidate)) {
    return null;
  }

  const cnpjEmitente = candidate.slice(6, 20);
  const nNF = String(parseInt(candidate.slice(25, 34), 10));

  return { chaveAcesso: candidate, cnpjEmitente, nNF };
}
