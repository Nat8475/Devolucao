export interface ParsedNFe {
  nf: string;
  supplierName: string;
  descricao: string;
  qtd: number;
  valorUnitario: number;
  valorTotal: number;
}

export function parseNFeXml(xmlString: string): ParsedNFe {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  if (doc.querySelector('parsererror')) {
    throw new Error('XML inválido: não foi possível interpretar o arquivo.');
  }

  const nNF = doc.querySelector('ide > nNF')?.textContent;
  const xNome = doc.querySelector('emit > xNome')?.textContent;
  const firstProd = doc.querySelector('det > prod');
  const xProd = firstProd?.querySelector('xProd')?.textContent;
  const qCom = firstProd?.querySelector('qCom')?.textContent;
  const vUnCom = firstProd?.querySelector('vUnCom')?.textContent;
  const vNF = doc.querySelector('total > ICMSTot > vNF')?.textContent;

  if (!nNF || !xNome || !xProd || !qCom || !vUnCom) {
    throw new Error(
      'XML da NF-e não contém todos os campos esperados (nNF, xNome, xProd, qCom, vUnCom).'
    );
  }

  const qtd = parseFloat(qCom);
  const valorUnitario = parseFloat(vUnCom);

  return {
    nf: nNF,
    supplierName: xNome,
    descricao: xProd,
    qtd,
    valorUnitario,
    valorTotal: vNF ? parseFloat(vNF) : qtd * valorUnitario,
  };
}
