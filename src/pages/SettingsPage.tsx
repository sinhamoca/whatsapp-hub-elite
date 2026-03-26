import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, User, Shield } from 'lucide-react';
import LabelsManager from '@/components/LabelsManager';

export default function SettingsPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Configurações</h1>

      <div className="glass rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">{user?.email}</p>
            <p className="text-xs text-muted-foreground">Conta ativa</p>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl p-4">
        <LabelsManager />
      </div>

      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span className="text-sm font-medium">Segurança</span>
        </div>
        <Button variant="outline" className="w-full justify-start" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sair da conta
        </Button>
      </div>
    </div>
  );
}
