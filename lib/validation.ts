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
