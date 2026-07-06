import { SettingsNav } from '@/components/settings/settings-nav';
import { FeatureFlagsPanel } from '@/components/settings/feature-flags-panel';
import { LogoUpload } from '@/components/settings/logo-upload';

export default function FeaturesSettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-bold text-foreground">Configurações</h1>
      </div>
      <SettingsNav />
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-semibold text-foreground">Funcionalidades</h2>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FeatureFlagsPanel />
        <LogoUpload />
      </div>
    </div>
  );
}
