import type { ReturnRecord, SupplierAddress } from '@/lib/types';

export interface RotaGroup {
  city: string;
  uf: string;
  addresses: SupplierAddress[];
  returns: ReturnRecord[];
}

export const SEM_ENDERECO = 'Sem endereço cadastrado';

// MVP da roteirização (plano v4.1 seção 4): agrupamento por cidade/UF do
// endereço de devolução. Fornecedor com endereços em duas cidades aparece
// nos dois grupos — o operador decide pra onde mandar.
export function groupPendingByCity(
  returns: ReturnRecord[],
  addressesBySupplier: Map<string, SupplierAddress[]>
): RotaGroup[] {
  const groups = new Map<string, RotaGroup>();
  const orphans: ReturnRecord[] = [];

  for (const r of returns) {
    const addrs = (addressesBySupplier.get(r.supplier_id) ?? []).filter(
      (a) => a.active && a.city && a.city.trim() !== ''
    );
    if (addrs.length === 0) {
      orphans.push(r);
      continue;
    }
    const seen = new Set<string>();
    for (const a of addrs) {
      const key = `${a.city!.trim()}|${(a.uf ?? '').trim().toUpperCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let g = groups.get(key);
      if (!g) {
        g = { city: a.city!.trim(), uf: (a.uf ?? '').trim().toUpperCase(), addresses: [], returns: [] };
        groups.set(key, g);
      }
      if (!g.addresses.some((x) => x.id === a.id)) g.addresses.push(a);
      g.returns.push(r);
    }
  }

  const sorted = [...groups.values()].sort(
    (a, b) => b.returns.length - a.returns.length || a.city.localeCompare(b.city)
  );
  if (orphans.length > 0) {
    sorted.push({ city: SEM_ENDERECO, uf: '', addresses: [], returns: orphans });
  }
  return sorted;
}
