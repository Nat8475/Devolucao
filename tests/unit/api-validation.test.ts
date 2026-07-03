import { describe, it, expect } from 'vitest';
import { supplierSchema, returnReasonSchema, returnCreateSchema } from '@/lib/validation';

describe('supplierSchema', () => {
  it('rejects a missing name', () => {
    const result = supplierSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts a minimal valid payload and fills defaults', () => {
    const result = supplierSchema.parse({ name: 'Fornecedor X' });
    expect(result).toEqual({ name: 'Fornecedor X', is_key_account: false, contact_emails: [] });
  });
});

describe('returnReasonSchema', () => {
  it('rejects a missing label', () => {
    expect(returnReasonSchema.safeParse({ supplier_id: null }).success).toBe(false);
  });

  it('accepts a generic reason with null supplier_id', () => {
    const result = returnReasonSchema.parse({ supplier_id: null, label: 'Avaria genérica' });
    expect(result.active).toBe(true);
  });
});

describe('returnCreateSchema', () => {
  it('requires a valid supplier_id and positive qtd/valor_unitario', () => {
    expect(
      returnCreateSchema.safeParse({ supplier_id: 'not-a-uuid', type: 'avaria', qtd: 1, valor_unitario: 1 })
        .success
    ).toBe(false);
  });

  it('allows nf to be omitted for a rascunho', () => {
    const result = returnCreateSchema.parse({
      supplier_id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'avaria',
      qtd: 1,
      valor_unitario: 1,
      status: 'rascunho',
    });
    expect(result.nf).toBeUndefined();
  });
});
