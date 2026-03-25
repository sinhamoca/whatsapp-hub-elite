import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Server, Wifi, WifiOff, Trash2, QrCode, Loader2, RefreshCw, Webhook } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Instance {
  id: string;
  name: string;
  phone: string;
  api_url: string;
  token: string;
  webhook_url?: string;
  connected?: boolean;
  statusLoading?: boolean;
}

export default function Instances() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [qrDialog, setQrDialog] = useState<{ open: boolean; instanceId: string; qr: string }>({ open: false, instanceId: '', qr: '' });
  const [qrLoading, setQrLoading] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', apiUrl: '', token: '' });
  const [saving, setSaving] = useState(false);

  const fetchInstances = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('instances')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    const mapped = (data || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      phone: d.phone || '',
      api_url: d.api_url,
      token: d.token,
      webhook_url: d.webhook_url || '',
      connected: undefined,
      statusLoading: true,
    }));
    setInstances(mapped);
    setLoading(false);
    // Check status for each
    mapped.forEach((inst: Instance) => checkStatus(inst.id));
  }, [user]);

  const checkStatus = async (instanceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('wuzapi-proxy', {
        body: { instanceId, endpoint: '/session/status', method: 'GET' },
      });

      const connectedValue = (data as any)?.Connected ?? (data as any)?.connected ?? (data as any)?.data?.Connected ?? (data as any)?.data?.connected;
      const isConnected = !error && Boolean(connectedValue);

      setInstances(prev =>
        prev.map(i =>
          i.id === instanceId ? { ...i, connected: isConnected, statusLoading: false } : i
        )
      );
    } catch {
      setInstances(prev =>
        prev.map(i =>
          i.id === instanceId ? { ...i, connected: false, statusLoading: false } : i
        )
      );
    }
  };

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const configureWebhook = async (instanceId: string) => {
    const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wuzapi-webhook`;
    try {
      await supabase.functions.invoke('wuzapi-proxy', {
        body: {
          instanceId,
          endpoint: '/webhook',
          method: 'POST',
          payload: { webhookURL: webhookUrl },
        },
      });
      // Update DB record
      await supabase.from('instances').update({ webhook_url: webhookUrl }).eq('id', instanceId);
      toast({ title: 'Webhook configurado!', description: 'Mensagens serão recebidas automaticamente.' });
    } catch (err: any) {
      console.error('Webhook config error:', err);
    }
  };

  const handleAdd = async () => {
    if (!form.name || !form.apiUrl || !form.token || !user) return;
    setSaving(true);

    const { data, error } = await supabase
      .from('instances')
      .insert({
        user_id: user.id,
        name: form.name,
        phone: form.phone,
        api_url: form.apiUrl,
        token: form.token,
      })
      .select()
      .single();

    setSaving(false);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    // Auto-configure webhook
    if (data) {
      await configureWebhook((data as any).id);
    }

    setForm({ name: '', phone: '', apiUrl: '', token: '' });
    setDialogOpen(false);
    toast({ title: 'Instância adicionada!' });
    fetchInstances();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('instances').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setInstances(prev => prev.filter(i => i.id !== id));
  };

  const handleQrCode = async (instanceId: string) => {
    setQrLoading(true);
    setQrDialog({ open: true, instanceId, qr: '' });

    try {
      const { data, error } = await supabase.functions.invoke('wuzapi-proxy', {
        body: { instanceId, endpoint: '/session/qr', method: 'GET' },
      });

      const qrCode = (data as any)?.QRCode ?? (data as any)?.qrCode ?? (data as any)?.qrcode ?? (data as any)?.data?.QRCode ?? (data as any)?.data?.qrCode ?? (data as any)?.data?.qrcode;

      if (error || !qrCode) {
        toast({ title: 'Erro', description: 'Não foi possível obter o QR Code. Verifique se a instância está desconectada.', variant: 'destructive' });
        setQrDialog(prev => ({ ...prev, open: false }));
      } else {
        setQrDialog(prev => ({ ...prev, qr: String(qrCode).replace(/^data:image\/png;base64,/, '') }));
      }
    } catch {
      toast({ title: 'Erro', description: 'Falha ao conectar com a WuzAPI', variant: 'destructive' });
      setQrDialog(prev => ({ ...prev, open: false }));
    }
    setQrLoading(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Instâncias</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus números de WhatsApp</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={fetchInstances} title="Atualizar status">
            <RefreshCw className="h-4 w-4" />
          </Button>
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
                  <Input placeholder="Ex: Vendas" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-secondary/50" />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input placeholder="+55 11 99999-0000" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="bg-secondary/50" />
                </div>
                <div className="space-y-2">
                  <Label>URL da WuzAPI</Label>
                  <Input placeholder="https://sua-wuzapi.com" value={form.apiUrl} onChange={e => setForm({ ...form, apiUrl: e.target.value })} className="bg-secondary/50" />
                </div>
                <div className="space-y-2">
                  <Label>Token</Label>
                  <Input type="password" placeholder="Token de autenticação" value={form.token} onChange={e => setForm({ ...form, token: e.target.value })} className="bg-secondary/50" />
                </div>
                <Button className="w-full" onClick={handleAdd} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar instância
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Server className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma instância cadastrada</p>
          <p className="text-sm">Clique em "Adicionar" para conectar um número</p>
        </div>
      ) : (
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
                    {inst.statusLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    ) : (
                      <span className={`flex items-center gap-1 text-xs ${inst.connected ? 'text-status-online' : 'text-status-offline'}`}>
                        {inst.connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                        {inst.connected ? 'Conectado' : 'Desconectado'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{inst.phone}</p>
                </div>
                <div className="flex gap-1">
                  {!inst.webhook_url && inst.connected && (
                    <Button variant="ghost" size="icon" title="Configurar Webhook" onClick={() => configureWebhook(inst.id)}>
                      <Webhook className="h-4 w-4 text-accent-foreground" />
                    </Button>
                  )}
                  {!inst.connected && !inst.statusLoading && (
                    <Button variant="ghost" size="icon" title="QR Code" onClick={() => handleQrCode(inst.id)}>
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
      )}

      {/* QR Code Dialog */}
      <Dialog open={qrDialog.open} onOpenChange={(open) => setQrDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="bg-card border-border max-w-xs">
          <DialogHeader>
            <DialogTitle>Escanear QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-4">
            {qrLoading ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : qrDialog.qr ? (
              <img src={`data:image/png;base64,${qrDialog.qr}`} alt="QR Code" className="w-full rounded-lg" />
            ) : (
              <p className="text-muted-foreground text-sm">QR Code indisponível</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
