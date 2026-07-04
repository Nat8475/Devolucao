import { describe, it, expect } from 'vitest';
import {
  supplierSchema,
  returnReasonSchema,
  returnCreateSchema,
  batchVendaSchema,
  batchReabrirSchema,
  excluirSchema,
} from '@/lib/validation';

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

  it('rejects status pendente with null nf', () => {
    expect(
      returnCreateSchema.safeParse({
        supplier_id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'avaria',
        qtd: 1,
        valor_unitario: 1,
        status: 'pendente',
        nf: null,
      }).success
    ).toBe(false);
  });

  it('rejects status pendente with blank nf', () => {
    expect(
      returnCreateSchema.safeParse({
        supplier_id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'avaria',
        qtd: 1,
        valor_unitario: 1,
        status: 'pendente',
        nf: '   ',
      }).success
    ).toBe(false);
  });

  it('accepts status pendente with a non-blank nf', () => {
    const result = returnCreateSchema.parse({
      supplier_id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'avaria',
      qtd: 1,
      valor_unitario: 1,
      status: 'pendente',
      nf: '1001',
    });
    expect(result.nf).toBe('1001');
  });
});

describe('batchVendaSchema', () => {
  it('rejects an empty ids list', () => {
    expect(batchVendaSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it('rejects a non-array ids', () => {
    expect(batchVendaSchema.safeParse({ ids: 'not-an-array' }).success).toBe(false);
  });

  it('rejects ids that are not uuids', () => {
    expect(batchVendaSchema.safeParse({ ids: ['not-a-uuid'] }).success).toBe(false);
  });

  it('accepts a non-empty list of uuids', () => {
    const result = batchVendaSchema.parse({
      ids: ['123e4567-e89b-12d3-a456-426614174000'],
    });
    expect(result.ids).toHaveLength(1);
  });
});

describe('batchReabrirSchema', () => {
  it('rejects an empty ids list', () => {
    expect(
      batchReabrirSchema.safeParse({ ids: [], motivo: 'erro' }).success
    ).toBe(false);
  });

  it('rejects a missing motivo', () => {
    expect(
      batchReabrirSchema.safeParse({ ids: ['123e4567-e89b-12d3-a456-426614174000'] }).success
    ).toBe(false);
  });

  it('rejects a blank motivo', () => {
    expect(
      batchReabrirSchema.safeParse({
        ids: ['123e4567-e89b-12d3-a456-426614174000'],
        motivo: '   ',
      }).success
    ).toBe(false);
  });

  it('accepts a valid payload', () => {
    const result = batchReabrirSchema.parse({
      ids: ['123e4567-e89b-12d3-a456-426614174000'],
      motivo: 'erro de digitação',
    });
    expect(result.motivo).toBe('erro de digitação');
  });
});

describe('excluirSchema', () => {
  it('rejects a missing motivo', () => {
    expect(excluirSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a blank motivo', () => {
    expect(excluirSchema.safeParse({ motivo: '   ' }).success).toBe(false);
  });

  it('accepts a valid motivo', () => {
    const result = excluirSchema.parse({ motivo: 'lançado por engano' });
    expect(result.motivo).toBe('lançado por engano');
  });
});
