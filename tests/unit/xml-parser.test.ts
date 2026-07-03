import { describe, it, expect } from 'vitest';
import { parseNFeXml } from '@/lib/xml-parser';

const SAMPLE_NFE = `<?xml version="1.0"?>
<nfeProc>
  <NFe><infNFe>
    <ide><nNF>123456</nNF></ide>
    <emit><xNome>Fornecedor Exemplo Ltda</xNome></emit>
    <det nItem="1">
      <prod>
        <xProd>Produto de Teste</xProd>
        <qCom>10.0000</qCom>
        <vUnCom>25.50</vUnCom>
      </prod>
    </det>
    <total><ICMSTot><vNF>255.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;

const SAMPLE_NFE_WITH_XMLNS = `<?xml version="1.0"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe>
    <ide><nNF>123456</nNF></ide>
    <emit><xNome>Fornecedor Exemplo Ltda</xNome></emit>
    <det nItem="1">
      <prod>
        <xProd>Produto de Teste</xProd>
        <qCom>10.0000</qCom>
        <vUnCom>25.50</vUnCom>
      </prod>
    </det>
    <total><ICMSTot><vNF>255.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;

describe('parseNFeXml', () => {
  it('extracts nf, supplier, product and values from a valid NF-e XML', () => {
    const result = parseNFeXml(SAMPLE_NFE);
    expect(result).toEqual({
      nf: '123456',
      supplierName: 'Fornecedor Exemplo Ltda',
      descricao: 'Produto de Teste',
      qtd: 10,
      valorUnitario: 25.5,
      valorTotal: 255,
    });
  });

  it('throws on malformed XML', () => {
    expect(() => parseNFeXml('<not-valid')).toThrow('XML inválido');
  });

  it('throws when required fields are missing', () => {
    expect(() => parseNFeXml('<nfeProc><NFe><infNFe><ide></ide></infNFe></NFe></nfeProc>')).toThrow(
      'não contém todos os campos'
    );
  });

  it('parses NF-e with xmlns namespace attribute', () => {
    const result = parseNFeXml(SAMPLE_NFE_WITH_XMLNS);
    expect(result).toEqual({
      nf: '123456',
      supplierName: 'Fornecedor Exemplo Ltda',
      descricao: 'Produto de Teste',
      qtd: 10,
      valorUnitario: 25.5,
      valorTotal: 255,
    });
  });

  it('throws on non-numeric qCom value', () => {
    const invalidXml = `<?xml version="1.0"?>
<nfeProc>
  <NFe><infNFe>
    <ide><nNF>123456</nNF></ide>
    <emit><xNome>Fornecedor Exemplo Ltda</xNome></emit>
    <det nItem="1">
      <prod>
        <xProd>Produto de Teste</xProd>
        <qCom>abc</qCom>
        <vUnCom>25.50</vUnCom>
      </prod>
    </det>
    <total><ICMSTot><vNF>255.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;
    expect(() => parseNFeXml(invalidXml)).toThrow('contém valores numéricos inválidos');
  });
});
