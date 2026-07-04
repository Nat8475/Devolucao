import Link from 'next/link';
import { ReturnForm } from '@/components/returns/return-form';

export default function NewReturnPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <Link href="/returns" className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar para devoluções
        </Link>
        <h1 className="font-heading text-2xl font-bold text-foreground">Lançar devolução</h1>
      </div>
      <ReturnForm />
    </div>
  );
}
