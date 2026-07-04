import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ReturnsTable } from '@/components/returns/returns-table';

export default function ReturnsPage() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Devoluções</h1>
        <Link href="/returns/new">
          <Button className="cursor-pointer">Nova devolução</Button>
        </Link>
      </div>
      <ReturnsTable />
    </div>
  );
}
