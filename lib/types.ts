export type ReturnStatus = 'rascunho' | 'pendente' | 'em_transferencia' | 'devolvido' | 'venda';
export type ReturnType = 'avaria' | 'falta' | 'rejeicao';

export interface Supplier {
  id: string;
  name: string;
  is_key_account: boolean;
  cnpj: string | null;
  contact_emails: string[];
  created_at: string;
}

export interface ReturnReason {
  id: string;
  supplier_id: string | null;
  label: string;
  active: boolean;
}

export interface ReturnRecord {
  id: string;
  nf: string | null;
  nfd: string | null;
  supplier_id: string;
  type: ReturnType;
  reason_id: string | null;
  motivo_detalhe: string | null;
  descricao: string | null;
  qtd: number;
  valor_unitario: number;
  valor_total: number;
  status: ReturnStatus;
  data_entrada: string;
  responsavel: string | null;
  priority: string | null;
  origin_row_ref: string | null;
  resolved_at: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
  deleted_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
