import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bot, Plus, Pencil, Trash2, Loader2, MessageSquare, Zap, X } from 'lucide-react';
import { toast } from 'sonner';

interface Flow {
  id: string;
  name: string;
  instance_id: string;
  is_active: boolean;
  created_at: string;
  trigger_type: string;
  trigger_keywords: string[];
  trigger_match_type: string;
}

interface Instance {
  id: string;
  name: string;
  phone: string | null;
}

export default function ChatbotFlows() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [selectedInstance, setSelectedInstance] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<string | null>(null);
  const [triggerKeywordInput, setTriggerKeywordInput] = useState('');

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    const [flowsRes, instancesRes] = await Promise.all([
      supabase.from('chatbot_flows').select('*').order('created_at', { ascending: false }),
      supabase.from('instances').select('id, name, phone'),
    ]);
    if (flowsRes.data) setFlows(flowsRes.data as Flow[]);
    if (instancesRes.data) setInstances(instancesRes.data);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !selectedInstance || !user) return;
    setCreating(true);
    const { data, error } = await supabase.from('chatbot_flows').insert({
      name: newName.trim(),
      instance_id: selectedInstance,
      user_id: user.id,
    }).select().single();

    if (error) {
      toast.error('Erro ao criar fluxo');
    } else if (data) {
      await supabase.from('chatbot_nodes').insert({
        flow_id: data.id,
        type: 'start',
        name: 'Início',
        position_x: 250,
        position_y: 50,
      });
      toast.success('Fluxo criado!');
      setNewName('');
      navigate(`/chatbot/${data.id}`);
    }
    setCreating(false);
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from('chatbot_flows').update({ is_active: active }).eq('id', id);
    setFlows(f => f.map(flow => flow.id === id ? { ...flow, is_active: active } : flow));
    toast.success(active ? 'Fluxo ativado' : 'Fluxo desativado');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este fluxo?')) return;
    await supabase.from('chatbot_flows').delete().eq('id', id);
    setFlows(f => f.filter(flow => flow.id !== id));
    toast.success('Fluxo excluído');
  };

  const handleTriggerTypeChange = async (flowId: string, triggerType: string) => {
    await supabase.from('chatbot_flows').update({ trigger_type: triggerType }).eq('id', flowId);
    setFlows(f => f.map(flow => flow.id === flowId ? { ...flow, trigger_type: triggerType } : flow));
  };

  const handleTriggerMatchChange = async (flowId: string, matchType: string) => {
    await supabase.from('chatbot_flows').update({ trigger_match_type: matchType }).eq('id', flowId);
    setFlows(f => f.map(flow => flow.id === flowId ? { ...flow, trigger_match_type: matchType } : flow));
  };

  const addTriggerKeyword = async (flowId: string) => {
    if (!triggerKeywordInput.trim()) return;
    const flow = flows.find(f => f.id === flowId);
    if (!flow) return;
    const updated = [...(flow.trigger_keywords || []), triggerKeywordInput.trim()];
    await supabase.from('chatbot_flows').update({ trigger_keywords: updated }).eq('id', flowId);
    setFlows(f => f.map(fl => fl.id === flowId ? { ...fl, trigger_keywords: updated } : fl));
    setTriggerKeywordInput('');
  };

  const removeTriggerKeyword = async (flowId: string, index: number) => {
    const flow = flows.find(f => f.id === flowId);
    if (!flow) return;
    const updated = flow.trigger_keywords.filter((_, i) => i !== index);
    await supabase.from('chatbot_flows').update({ trigger_keywords: updated }).eq('id', flowId);
    setFlows(f => f.map(fl => fl.id === flowId ? { ...fl, trigger_keywords: updated } : fl));
  };

  const instanceName = (id: string) => instances.find(i => i.id === id)?.name || 'Desconhecida';

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Bot className="h-5 w-5" /> Chatbot Flows
        </h1>
      </div>

      {/* Create new flow */}
      <div className="glass rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Novo fluxo</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input placeholder="Nome do fluxo" value={newName} onChange={e => setNewName(e.target.value)} className="flex-1" />
          <Select value={selectedInstance} onValueChange={setSelectedInstance}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Instância" />
            </SelectTrigger>
            <SelectContent>
              {instances.map(inst => (
                <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleCreate} disabled={creating || !newName.trim() || !selectedInstance}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="ml-1">Criar</span>
          </Button>
        </div>
      </div>

      {/* Flows list */}
      {flows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bot className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Nenhum fluxo criado ainda</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flows.map(flow => (
            <div key={flow.id} className="glass rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{flow.name}</p>
                  <p className="text-xs text-muted-foreground">{instanceName(flow.instance_id)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={flow.is_active} onCheckedChange={(v) => handleToggle(flow.id, v)} />
                  <Button size="icon" variant="ghost" onClick={() => navigate(`/chatbot/${flow.id}`)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(flow.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {/* Trigger config */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Disparar:</span>
                <Select value={flow.trigger_type || 'keyword'} onValueChange={(v) => handleTriggerTypeChange(flow.id, v)}>
                  <SelectTrigger className="h-7 w-auto min-w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword">
                      <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> Por palavra-chave</span>
                    </SelectItem>
                    <SelectItem value="any">
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Qualquer mensagem</span>
                    </SelectItem>
                  </SelectContent>
                </Select>

                {(flow.trigger_type || 'keyword') === 'keyword' && (
                  <Select value={flow.trigger_match_type || 'contains'} onValueChange={(v) => handleTriggerMatchChange(flow.id, v)}>
                    <SelectTrigger className="h-7 w-auto min-w-[110px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contém</SelectItem>
                      <SelectItem value="exact">Exata</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => setEditingTrigger(editingTrigger === flow.id ? null : flow.id)}
                >
                  {(flow.trigger_type || 'keyword') === 'keyword'
                    ? `${(flow.trigger_keywords || []).length} palavra(s)`
                    : ''}
                </Button>
              </div>

              {/* Keywords editor */}
              {editingTrigger === flow.id && (flow.trigger_type || 'keyword') === 'keyword' && (
                <div className="space-y-2 pl-2 border-l-2 border-primary/20">
                  <div className="flex flex-wrap gap-1">
                    {(flow.trigger_keywords || []).map((kw, i) => (
                      <Badge key={i} variant="secondary" className="text-xs gap-1">
                        {kw}
                        <button onClick={() => removeTriggerKeyword(flow.id, i)}>
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <Input
                      placeholder="Adicionar palavra-chave..."
                      value={triggerKeywordInput}
                      onChange={e => setTriggerKeywordInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addTriggerKeyword(flow.id)}
                      className="h-7 text-xs flex-1"
                    />
                    <Button size="sm" className="h-7 text-xs" onClick={() => addTriggerKeyword(flow.id)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
