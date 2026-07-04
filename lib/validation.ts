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
