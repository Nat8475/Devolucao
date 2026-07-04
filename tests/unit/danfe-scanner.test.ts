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

  describe('check digit (DV, mod-11)', () => {
    it('accepts a chave whose DV is valid', () => {
      // DV da CHAVE_VALIDA é 0 (soma ponderada mod 11 cai no caso 10/11 → 0).
      expect(parseDanfeCode(CHAVE_VALIDA)).not.toBeNull();
      // Chave com DV não-trivial (6) calculado pelo algoritmo padrão da NF-e.
      const chaveDv6 = '35240199999999000199550010000678901234567806';
      expect(parseDanfeCode(chaveDv6)).toEqual({
        chaveAcesso: chaveDv6,
        cnpjEmitente: '99999999000199',
        nNF: '67890',
      });
    });

    it('rejects a chave corrupted by a single digit (DV mismatch)', () => {
      // Troca um dígito do nNF; o DV deixa de bater → leitura truncada/erro de
      // scanner não pode preencher o formulário com lixo.
      const corrupted = CHAVE_VALIDA.slice(0, 30) + '9' + CHAVE_VALIDA.slice(31);
      expect(corrupted).toHaveLength(44);
      expect(corrupted).not.toBe(CHAVE_VALIDA);
      expect(parseDanfeCode(corrupted)).toBeNull();
    });

    it('rejects a chave with only the DV altered', () => {
      const wrongDv = CHAVE_VALIDA.slice(0, 43) + '5';
      expect(parseDanfeCode(wrongDv)).toBeNull();
    });

    it('rejects a QR URL whose embedded chave has an invalid DV', () => {
      const wrongDv = CHAVE_VALIDA.slice(0, 43) + '5';
      expect(
        parseDanfeCode(`https://www.sefazvirtual.fazenda.gov.br/nfce/qrcode?p=${wrongDv}|2|1|abc`)
      ).toBeNull();
    });

    it('accepts the all-zeros chave (DV 0 is arithmetically valid per the mod-11 algorithm)', () => {
      // Documentado: a validação implementada é a do dígito verificador, não
      // uma validação semântica de cUF/CNPJ. 44 zeros passam no mod-11.
      const zeros = '0'.repeat(44);
      expect(parseDanfeCode(zeros)).toEqual({
        chaveAcesso: zeros,
        cnpjEmitente: '00000000000000',
        nNF: '0',
      });
    });
  });
});
