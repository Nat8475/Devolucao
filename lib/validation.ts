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

export const returnCreateSchema = z.object({
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

export const returnPatchSchema = returnCreateSchema.partial().omit({ status: true });
