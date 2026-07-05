import { TransfersTable } from '@/components/transfers/transfers-table';
import { RotaSuggestionLink } from '@/components/transfers/rota-suggestion-link';

export default function TransfersPage() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Transferências</h1>
        <RotaSuggestionLink />
      </div>
      <TransfersTable />
    </div>
  );
}
