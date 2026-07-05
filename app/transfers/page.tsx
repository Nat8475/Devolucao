import { TransfersTable } from '@/components/transfers/transfers-table';

export default function TransfersPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Transferências</h1>
      <TransfersTable />
    </div>
  );
}
