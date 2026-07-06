import { describe, expect, it } from 'vitest';
import {
  branchSchema,
  supplierAddressSchema,
  transferCreateSchema,
  cancelarTransferenciaSchema,
  reagendarSchema,
} from '@/lib/validation';

const uuid = '550e8400-e29b-41d4-a716-446655440000';
const uuid2 = '550e8400-e29b-41d4-a716-446655440001';

describe('branchSchema', () => {
  it('requires name', () => {
    expect(branchSchema.safeParse({}).success).toBe(false);
    expect(branchSchema.safeParse({ name: 'Filial A' }).success).toBe(true);
  });
});

describe('supplierAddressSchema', () => {
  it('requires supplier_id and label; validates emails', () => {
    expect(supplierAddressSchema.safeParse({ supplier_id: uuid, label: 'CD SP' }).success).toBe(true);
    expect(
      supplierAddressSchema.safeParse({ supplier_id: uuid, label: 'CD', contact_emails: ['nope'] }).success
    ).toBe(false);
  });
});

describe('transferCreateSchema', () => {
  const base = {
    return_ids: [uuid],
    scheduled_date: '2026-07-10',
  };

  it('filial requires branch_id and rejects supplier_address_id', () => {
    expect(
      transferCreateSchema.safeParse({ ...base, destination_type: 'filial', branch_id: uuid2 }).success
    ).toBe(true);
    expect(
      transferCreateSchema.safeParse({ ...base, destination_type: 'filial' }).success
    ).toBe(false);
    expect(
      transferCreateSchema.safeParse({
        ...base, destination_type: 'filial', branch_id: uuid2, supplier_address_id: uuid2,
      }).success
    ).toBe(false);
  });

  it('fornecedor requires supplier_address_id', () => {
    expect(
      transferCreateSchema.safeParse({ ...base, destination_type: 'fornecedor', supplier_address_id: uuid2 }).success
    ).toBe(true);
    expect(
      transferCreateSchema.safeParse({ ...base, destination_type: 'fornecedor' }).success
    ).toBe(false);
  });

  it('rejects empty return_ids and bad freight_type', () => {
    expect(
      transferCreateSchema.safeParse({
        return_ids: [], destination_type: 'filial', branch_id: uuid2, scheduled_date: '2026-07-10',
      }).success
    ).toBe(false);
    expect(
      transferCreateSchema.safeParse({
        ...base, destination_type: 'filial', branch_id: uuid2, freight_type: 'gratis',
      }).success
    ).toBe(false);
  });
});

describe('cancelarTransferenciaSchema', () => {
  it('requires non-blank motivo', () => {
    expect(cancelarTransferenciaSchema.safeParse({ motivo: '  ' }).success).toBe(false);
    expect(cancelarTransferenciaSchema.safeParse({ motivo: 'sem frete' }).success).toBe(true);
  });
});

describe('reagendarSchema', () => {
  it('requires YYYY-MM-DD date', () => {
    expect(reagendarSchema.safeParse({ scheduled_date: '10/07/2026' }).success).toBe(false);
    expect(reagendarSchema.safeParse({ scheduled_date: '2026-07-10' }).success).toBe(true);
  });
});
