import Link from 'next/link';
import { ReasonsCrud } from '@/components/settings/reasons-crud';

export default function ReasonsSettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <Link href="/settings/suppliers" className="text-sm text-muted-foreground hover:text-foreground">
          ← Fornecedores
        </Link>
        <h1 className="font-heading text-2xl font-bold text-foreground">Motivos de devolução</h1>
      </div>
      <ReasonsCrud />
    </div>
  );
}
