import { TrashTable } from '@/components/trash/trash-table';

export default function TrashPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Lixeira</h1>
      <TrashTable />
    </div>
  );
}
