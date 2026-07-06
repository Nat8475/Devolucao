import { describe, expect, it } from 'vitest';
import { groupPendingByCity } from '@/lib/rotas';
import type { ReturnRecord, SupplierAddress } from '@/lib/types';

const ret = (id: string, supplier_id: string) =>
  ({ id, supplier_id, status: 'pendente' }) as ReturnRecord;
const addr = (id: string, supplier_id: string, city: string, uf: string) =>
  ({ id, supplier_id, city, uf, active: true, label: id }) as SupplierAddress;

describe('groupPendingByCity', () => {
  it('groups returns by their supplier address city/UF', () => {
    const returns = [ret('r1', 's1'), ret('r2', 's2'), ret('r3', 's3')];
    const addresses = new Map([
      ['s1', [addr('a1', 's1', 'Campinas', 'SP')]],
      ['s2', [addr('a2', 's2', 'Campinas', 'SP'), addr('a3', 's2', 'Curitiba', 'PR')]],
    ]);
    const groups = groupPendingByCity(returns, addresses);

    const campinas = groups.find((g) => g.city === 'Campinas');
    expect(campinas?.returns.map((r) => r.id).sort()).toEqual(['r1', 'r2']);

    const curitiba = groups.find((g) => g.city === 'Curitiba');
    expect(curitiba?.returns.map((r) => r.id)).toEqual(['r2']);

    const semEndereco = groups[groups.length - 1];
    expect(semEndereco.city).toBe('Sem endereço cadastrado');
    expect(semEndereco.returns.map((r) => r.id)).toEqual(['r3']);
  });

  it('ignores inactive addresses and city-less addresses', () => {
    const addresses = new Map([
      ['s1', [{ ...addr('a1', 's1', 'Campinas', 'SP'), active: false }]],
      ['s2', [addr('a2', 's2', '', 'SP')]],
    ]);
    const groups = groupPendingByCity([ret('r1', 's1'), ret('r2', 's2')], addresses);
    expect(groups).toHaveLength(1);
    expect(groups[0].city).toBe('Sem endereço cadastrado');
  });
});
