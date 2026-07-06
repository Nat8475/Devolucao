import type { ReturnRecord } from '@/lib/types';
import { STATUS_LABELS } from '@/lib/return-status';

const TYPE_LABELS: Record<ReturnRecord['type'], string> = {
  avaria: 'Avaria',
  falta: 'Falta',
  rejeicao: 'Rejeição',
};

const dateFormatter = new Intl.DateTimeFormat('pt-BR');
const numberFormatter = new Intl.NumberFormat('pt-BR');

export interface EtiquetaProps {
  record: ReturnRecord;
  supplierName: string;
  reasonLabel: string;
  logoUrl: string | null;
}

/**
 * Etiqueta de caixa 100x100mm para impressão térmica.
 * Ignora intencionalmente o tema do app (preto sobre branco puro) — ver docs/design-system.md.
 */
export function Etiqueta({ record, supplierName, reasonLabel, logoUrl }: EtiquetaProps) {
  return (
    <>
      <style>{`
        @media print {
          @page { size: 100mm 100mm; margin: 0; }
          body * { visibility: hidden; }
          .etiqueta, .etiqueta * { visibility: visible; }
          .etiqueta { position: fixed; inset: 0; }
        }
        .etiqueta {
          width: 100mm;
          height: 100mm;
          box-sizing: border-box;
          padding: 4mm;
          background: #fff;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          font-weight: 700;
          font-family: Arial, Helvetica, sans-serif;
          display: flex;
          flex-direction: column;
          gap: 1.5mm;
          overflow: hidden;
        }
        .etiqueta-logo {
          display: block;
          margin: 0 auto;
          max-height: 10mm;
          max-width: 60mm;
          object-fit: contain;
        }
        .etiqueta-nf {
          font-size: 14mm;
          font-weight: 900;
          line-height: 1;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .etiqueta-rows {
          margin: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1mm;
          justify-content: flex-end;
        }
        .etiqueta-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 2mm;
          font-size: 3.4mm;
          line-height: 1.25;
        }
        .etiqueta-row dt {
          flex: none;
          margin: 0;
        }
        .etiqueta-row dd {
          margin: 0;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: right;
        }
      `}</style>
      <div className="etiqueta">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="etiqueta-logo" />
        )}
        <div className="etiqueta-nf">{record.nf ?? '(sem NF)'}</div>
        <dl className="etiqueta-rows">
          <div className="etiqueta-row">
            <dt>NFD</dt>
            <dd>{record.nfd ?? '—'}</dd>
          </div>
          <div className="etiqueta-row">
            <dt>Fornecedor</dt>
            <dd>{supplierName}</dd>
          </div>
          <div className="etiqueta-row">
            <dt>Tipo</dt>
            <dd>{TYPE_LABELS[record.type]}</dd>
          </div>
          <div className="etiqueta-row">
            <dt>Motivo</dt>
            <dd>{reasonLabel}</dd>
          </div>
          <div className="etiqueta-row">
            <dt>Qtd</dt>
            <dd>{numberFormatter.format(record.qtd)}</dd>
          </div>
          <div className="etiqueta-row">
            <dt>Data</dt>
            <dd>{dateFormatter.format(new Date(record.data_entrada))}</dd>
          </div>
          <div className="etiqueta-row">
            <dt>Status</dt>
            <dd>{STATUS_LABELS[record.status]}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
