import { describe, it, expect } from 'vitest';
import { supplierSchema, returnReasonSchema } from '@/lib/validation';

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
