import { describe, it, expect } from 'vitest';
import { parseDanfeCode } from '@/lib/danfe-scanner';

const CHAVE_VALIDA = '35240112345678000199550010000123451123456780';

describe('parseDanfeCode', () => {
  it('parses a raw 44-digit chave de acesso (USB scanner input)', () => {
    expect(parseDanfeCode(CHAVE_VALIDA)).toEqual({
      chaveAcesso: CHAVE_VALIDA,
      cnpjEmitente: '12345678000199',
      nNF: '12345',
    });
  });

  it('parses a QR code URL carrying the chave in the p= param', () => {
    const url = `https://www.sefazvirtual.fazenda.gov.br/nfce/qrcode?p=${CHAVE_VALIDA}|2|1|abcdef1234567890`;
    expect(parseDanfeCode(url)).toEqual({
      chaveAcesso: CHAVE_VALIDA,
      cnpjEmitente: '12345678000199',
      nNF: '12345',
    });
  });

  it('returns null for an empty string', () => {
    expect(parseDanfeCode('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(parseDanfeCode('not a valid code at all')).toBeNull();
  });

  it('returns null for a numeric string of the wrong length', () => {
    expect(parseDanfeCode('12345')).toBeNull();
  });

  it('returns null for a QR URL missing the p= param', () => {
    expect(parseDanfeCode('https://example.com/qrcode?x=1')).toBeNull();
  });
});
