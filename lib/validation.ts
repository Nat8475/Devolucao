import { z } from 'zod';

export const supplierSchema = z.object({
  name: z.string().min(1, 'name é obrigatório'),
  is_key_account: z.boolean().optional().default(false),
  cnpj: z.string().nullable().optional(),
  contact_emails: z.array(z.string().email()).optional().default([]),
});

export const returnReasonSchema = z.object({
  supplier_id: z.string().uuid().nullable().optional(),
  label: z.string().min(1, 'label é obrigatório'),
  active: z.boolean().optional().default(true),
});

const returnBaseSchema = z.object({
  nf: z.string().nullable().optional(),
  nfd: z.string().nullable().optional(),
  supplier_id: z.string().uuid(),
  type: z.enum(['avaria', 'falta', 'rejeicao']),
  reason_id: z.string().uuid().nullable().optional(),
  motivo_detalhe: z.string().nullable().optional(),
  descricao: z.string().nullable().optional(),
  qtd: z.number().positive(),
  valor_unitario: z.number().positive(),
  status: z.enum(['rascunho', 'pendente']).optional().default('pendente'),
});

export const returnCreateSchema = returnBaseSchema
  // nf só é opcional em rascunho; criar já como pendente sem nf pularia o
  // portão que fn_confirmar_rascunho aplica no fluxo normal (rascunho -> pendente).
  .superRefine((data, ctx) => {
    if (data.status === 'pendente' && (!data.nf || data.nf.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'nf é obrigatório para lançar como pendente',
        path: ['nf'],
      });
    }
  });

export const returnPatchSchema = returnBaseSchema.partial().omit({ status: true });

export const batchVendaSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'ids deve ser uma lista não vazia'),
});

export const batchReabrirSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'ids deve ser uma lista não vazia'),
  motivo: z.string().trim().min(1, 'motivo é obrigatório'),
});

export const excluirSchema = z.object({
  motivo: z.string().trim().min(1, 'motivo é obrigatório'),
});

const dateYmd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve ser YYYY-MM-DD');

export const branchSchema = z.object({
  name: z.string().min(1, 'name é obrigatório'),
  address: z.string().nullable().optional(),
  active: z.boolean().optional().default(true),
});

export const branchPatchSchema = branchSchema.partial();

export const supplierAddressSchema = z.object({
  supplier_id: z.string().uuid(),
  label: z.string().min(1, 'label é obrigatório'),
  city: z.string().nullable().optional(),
  uf: z.string().max(2).nullable().optional(),
  address: z.string().nullable().optional(),
  contact_emails: z.array(z.string().email()).optional().default([]),
  active: z.boolean().optional().default(true),
});

export const supplierAddressPatchSchema = supplierAddressSchema.partial().omit({ supplier_id: true });

export const branchUserSchema = z.object({
  branch_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

export const transferCreateSchema = z
  .object({
    return_ids: z.array(z.string().uuid()).min(1, 'selecione ao menos uma devolução'),
    destination_type: z.enum(['filial', 'fornecedor']),
    branch_id: z.string().uuid().nullable().optional(),
    supplier_address_id: z.string().uuid().nullable().optional(),
    carrier: z.string().nullable().optional(),
    numero_pedido: z.string().nullable().optional(),
    freight_type: z.enum(['tabela', 'valor_icms', 'valor', 'cortesia']).nullable().optional(),
    freight_value: z.number().nonnegative().nullable().optional(),
    scheduled_date: dateYmd,
  })
  .superRefine((data, ctx) => {
    if (data.destination_type === 'filial' && (!data.branch_id || data.supplier_address_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'destino filial exige branch_id (e não supplier_address_id)',
        path: ['branch_id'],
      });
    }
    if (data.destination_type === 'fornecedor' && (!data.supplier_address_id || data.branch_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'destino fornecedor exige supplier_address_id (e não branch_id)',
        path: ['supplier_address_id'],
      });
    }
  });

export const cancelarTransferenciaSchema = z.object({
  motivo: z.string().trim().min(1, 'motivo é obrigatório'),
});

export const reagendarSchema = z.object({
  scheduled_date: dateYmd,
});

export const featureFlagPatchSchema = z.object({
  enabled: z.boolean(),
});
