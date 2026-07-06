import Link from 'next/link';
import { SettingsNav } from '@/components/settings/settings-nav';
import { SuppliersCrud } from '@/components/settings/suppliers-crud';

export default function SuppliersSettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-bold text-foreground">Configurações</h1>
      </div>
      <SettingsNav />
      <div className="space-y-1">
        <Link href="/settings/reasons" className="text-sm text-muted-foreground hover:text-foreground">
          Motivos de devolução →
        </Link>
        <h2 className="font-heading text-lg font-semibold text-foreground">Fornecedores</h2>
      </div>
      <SuppliersCrud />
    </div>
  );
}
