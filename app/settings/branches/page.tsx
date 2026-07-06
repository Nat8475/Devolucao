import { SettingsNav } from '@/components/settings/settings-nav';
import { BranchesCrud } from '@/components/settings/branches-crud';

export default function BranchesSettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-bold text-foreground">Configurações</h1>
      </div>
      <SettingsNav />
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-semibold text-foreground">Filiais</h2>
      </div>
      <BranchesCrud />
    </div>
  );
}
