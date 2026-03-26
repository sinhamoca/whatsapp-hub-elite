import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Conversation {
  id: string;
  jid: string;
  contact_name: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  instance_id: string;
  instance_name?: string;
  avatar_url?: string;
}

export default function Conversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [instances, setInstances] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [filterInstance, setFilterInstance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    if (!user) return;

    const [convRes, instRes] = await Promise.all([
      supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false }),
      supabase.from('instances').select('id, name'),
    ]);

    const instMap = new Map(
      (instRes.data || []).map((i: any) => [i.id, i.name])
    );

    setInstances((instRes.data || []) as any);
    setConversations(
      (convRes.data || []).map((c: any) => ({
        ...c,
        instance_name: instMap.get(c.instance_id) || 'Desconhecido',
      }))
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();

    // Realtime subscription for new conversations / updates
    const channel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => fetchData()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const filtered = conversations.filter(c => {
    const s = search.toLowerCase();
    const searchDigits = search.replace(/\D/g, '');
    const jidLocal = c.jid.split('@')[0] || '';
    const matchSearch =
      c.contact_name.toLowerCase().includes(s) ||
      c.last_message.toLowerCase().includes(s) ||
      c.jid.includes(s) ||
      (searchDigits.length >= 3 && jidLocal.includes(searchDigits));
    const matchFilter = !filterInstance || c.instance_id === filterInstance;
    return matchSearch && matchFilter;
  });

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-4 space-y-3 border-b border-border">
        <h1 className="text-xl font-semibold text-foreground">Conversas</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-border"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterInstance(null)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap',
              !filterInstance ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            Todas
          </button>
          {instances.map(inst => (
            <button
              key={inst.id}
              onClick={() => setFilterInstance(filterInstance === inst.id ? null : inst.id)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                filterInstance === inst.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
              )}
            >
              {inst.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma conversa encontrada</p>
            <p className="text-sm">As conversas aparecerão quando mensagens forem recebidas via webhook</p>
          </div>
        ) : (
          filtered.map((conv, i) => (
            <motion.button
              key={conv.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => navigate(`/chat/${conv.id}`)}
              className="w-full flex items-center gap-3 p-4 hover:bg-secondary/50 transition-colors border-b border-border/50 text-left"
            >
              {conv.avatar_url ? (
                <img src={conv.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center shrink-0 text-sm font-semibold text-foreground">
                  {conv.contact_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground text-sm truncate">{conv.contact_name}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">{formatTime(conv.last_message_at)}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-muted-foreground truncate">{conv.last_message}</p>
                  {conv.unread_count > 0 && (
                    <span className="ml-2 shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
                <Badge variant="secondary" className="mt-1 text-[10px] px-1.5 py-0 bg-primary/10 text-primary">
                  {conv.instance_name}
                </Badge>
              </div>
            </motion.button>
          ))
        )}
      </div>
    </div>
  );
}
