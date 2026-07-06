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
  responsible_branch_id: string | null;
}

export type TransferStatus = 'em_transferencia' | 'concluida' | 'cancelada';
export type DestinationType = 'filial' | 'fornecedor';
export type FreightType = 'tabela' | 'valor_icms' | 'valor' | 'cortesia';

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
  created_at: string;
}

export interface SupplierAddress {
  id: string;
  supplier_id: string;
  label: string;
  city: string | null;
  uf: string | null;
  address: string | null;
  contact_emails: string[];
  active: boolean;
  created_at: string;
}

export interface BranchUser {
  branch_id: string;
  user_id: string;
  created_at: string;
}

export interface TransferRecord {
  id: string;
  return_id: string;
  lote_id: string;
  destination_type: DestinationType;
  branch_id: string | null;
  supplier_address_id: string | null;
  carrier: string | null;
  numero_pedido: string | null;
  freight_type: FreightType | null;
  freight_value: number | null;
  scheduled_date: string;
  status: TransferStatus;
  arrived_at_branch_at: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface TransferWithJoins extends TransferRecord {
  returns: Pick<ReturnRecord, 'id' | 'nf' | 'nfd' | 'supplier_id' | 'valor_total' | 'status'> & {
    suppliers?: Pick<Supplier, 'id' | 'name'> | null;
  };
  branches: Pick<Branch, 'id' | 'name'> | null;
  supplier_addresses: Pick<SupplierAddress, 'id' | 'label' | 'city' | 'uf' | 'supplier_id'> | null;
}

export interface FileRecord {
  id: string;
  entity_type: 'return' | 'transfer' | 'system';
  entity_id: string | null;
  file_type: 'photo' | 'attachment' | 'receipt' | 'document' | 'signature' | 'logo';
  r2_key: string;
  filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  version: number;
  uploaded_by: string | null;
  deleted_at: string | null;
  created_at: string;
  /** presente só nas respostas da API (URL assinada, expira) */
  url?: string;
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string | null;
}
