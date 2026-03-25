import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Server, Wifi, WifiOff, Trash2, QrCode } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Instance {
  id: string;
  name: string;
  phone: string;
  apiUrl: string;
  token: string;
  connected: boolean;
}

// Mock data for UI demo
const mockInstances: Instance[] = [
  { id: '1', name: 'Vendas', phone: '+55 11 99999-0001', apiUrl: 'https://wuzapi1.example.com', token: 'tok_xxx', connected: true },
  { id: '2', name: 'Suporte', phone: '+55 11 99999-0002', apiUrl: 'https://wuzapi2.example.com', token: 'tok_yyy', connected: false },
];

export default function Instances() {
  const [instances, setInstances] = useState(mockInstances);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', apiUrl: '', token: '' });

  const handleAdd = () => {
    if (!form.name || !form.apiUrl || !form.token) return;
    setInstances([...instances, {
      id: Date.now().toString(),
      ...form,
      connected: false,
    }]);
    setForm({ name: '', phone: '', apiUrl: '', token: '' });
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    setInstances(instances.filter(i => i.id !== id));
  };

  return (
    <div className="flex-1 p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Instâncias</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus números de WhatsApp</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Nova Instância</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input placeholder="Ex: Vendas" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="bg-secondary/50" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input placeholder="+55 11 99999-0000" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="bg-secondary/50" />
              </div>
              <div className="space-y-2">
                <Label>URL da WuzAPI</Label>
                <Input placeholder="https://sua-wuzapi.com" value={form.apiUrl} onChange={e => setForm({...form, apiUrl: e.target.value})} className="bg-secondary/50" />
              </div>
              <div className="space-y-2">
                <Label>Token</Label>
                <Input type="password" placeholder="Token de autenticação" value={form.token} onChange={e => setForm({...form, token: e.target.value})} className="bg-secondary/50" />
              </div>
              <Button className="w-full" onClick={handleAdd}>Salvar instância</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        <AnimatePresence>
          {instances.map((inst, i) => (
            <motion.div
              key={inst.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-xl p-4 flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground truncate">{inst.name}</span>
                  <span className={`flex items-center gap-1 text-xs ${inst.connected ? 'text-status-online' : 'text-status-offline'}`}>
                    {inst.connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {inst.connected ? 'Conectado' : 'Desconectado'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{inst.phone}</p>
              </div>
              <div className="flex gap-1">
                {!inst.connected && (
                  <Button variant="ghost" size="icon" title="QR Code">
                    <QrCode className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => handleDelete(inst.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
