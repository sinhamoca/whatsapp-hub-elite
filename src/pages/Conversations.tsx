import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Filter } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  contactName: string;
  lastMessage: string;
  time: string;
  unread: number;
  instanceName: string;
  instanceColor: string;
  avatar?: string;
}

const mockConversations: Conversation[] = [
  { id: '1', contactName: 'Maria Silva', lastMessage: 'Olá, gostaria de saber o preço...', time: '14:32', unread: 3, instanceName: 'Vendas', instanceColor: 'bg-primary/20 text-primary' },
  { id: '2', contactName: 'João Santos', lastMessage: 'Obrigado pelo retorno!', time: '13:15', unread: 0, instanceName: 'Suporte', instanceColor: 'bg-status-online/20 text-status-online' },
  { id: '3', contactName: 'Ana Oliveira', lastMessage: 'Foto do produto enviada ✓', time: '12:40', unread: 1, instanceName: 'Vendas', instanceColor: 'bg-primary/20 text-primary' },
  { id: '4', contactName: 'Carlos Souza', lastMessage: 'Pode me enviar o catálogo?', time: '11:20', unread: 0, instanceName: 'Vendas', instanceColor: 'bg-primary/20 text-primary' },
  { id: '5', contactName: 'Fernanda Lima', lastMessage: 'Qual o prazo de entrega?', time: '10:05', unread: 2, instanceName: 'Suporte', instanceColor: 'bg-status-online/20 text-status-online' },
  { id: '6', contactName: 'Pedro Costa', lastMessage: 'Vou verificar e retorno.', time: 'Ontem', unread: 0, instanceName: 'Vendas', instanceColor: 'bg-primary/20 text-primary' },
];

export default function Conversations() {
  const [search, setSearch] = useState('');
  const [filterInstance, setFilterInstance] = useState<string | null>(null);
  const navigate = useNavigate();

  const filtered = mockConversations.filter(c => {
    const matchSearch = c.contactName.toLowerCase().includes(search.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(search.toLowerCase());
    const matchFilter = !filterInstance || c.instanceName === filterInstance;
    return matchSearch && matchFilter;
  });

  const instances = [...new Set(mockConversations.map(c => c.instanceName))];

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
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
        <div className="flex gap-2">
          <button
            onClick={() => setFilterInstance(null)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-all',
              !filterInstance ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            Todas
          </button>
          {instances.map(inst => (
            <button
              key={inst}
              onClick={() => setFilterInstance(filterInstance === inst ? null : inst)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-all',
                filterInstance === inst ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
              )}
            >
              {inst}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((conv, i) => (
          <motion.button
            key={conv.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => navigate(`/chat/${conv.id}`)}
            className="w-full flex items-center gap-3 p-4 hover:bg-secondary/50 transition-colors border-b border-border/50 text-left"
          >
            <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center shrink-0 text-sm font-semibold text-foreground">
              {conv.contactName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground text-sm truncate">{conv.contactName}</span>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">{conv.time}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <p className="text-xs text-muted-foreground truncate">{conv.lastMessage}</p>
                {conv.unread > 0 && (
                  <span className="ml-2 shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {conv.unread}
                  </span>
                )}
              </div>
              <Badge variant="secondary" className={cn('mt-1 text-[10px] px-1.5 py-0', conv.instanceColor)}>
                {conv.instanceName}
              </Badge>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
