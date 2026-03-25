import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, User, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface Contact {
  id: string;
  name: string;
  push_name: string;
  phone: string;
  jid: string;
  instance_id: string;
  instance_name?: string;
}

export default function Contacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchContacts = useCallback(async () => {
    if (!user) return;

    const [contactsRes, instRes] = await Promise.all([
      supabase.from('contacts').select('*').order('name'),
      supabase.from('instances').select('id, name'),
    ]);

    const instMap = new Map(
      (instRes.data || []).map((i: any) => [i.id, i.name])
    );

    setContacts(
      (contactsRes.data || []).map((c: any) => ({
        ...c,
        instance_name: instMap.get(c.instance_id) || 'Desconhecido',
      }))
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const filtered = contacts.filter(c => {
    const displayName = c.name || c.push_name || c.phone;
    return (
      displayName.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.jid.includes(search)
    );
  });

  const grouped = filtered.reduce((acc, c) => {
    const displayName = c.name || c.push_name || c.phone;
    const letter = displayName[0]?.toUpperCase() || '#';
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(c);
    return acc;
  }, {} as Record<string, Contact[]>);

  const handleContactClick = async (contact: Contact) => {
    // Find or create conversation for this contact
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('instance_id', contact.instance_id)
      .eq('jid', contact.jid)
      .single();

    if (conv) {
      navigate(`/chat/${conv.id}`);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 space-y-3 border-b border-border">
        <h1 className="text-xl font-semibold text-foreground">Contatos</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contatos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-border"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum contato encontrado</p>
            <p className="text-sm">Contatos aparecerão conforme mensagens forem recebidas</p>
          </div>
        ) : (
          Object.entries(grouped).sort().map(([letter, letterContacts]) => (
            <div key={letter}>
              <div className="px-4 py-1.5 bg-secondary/30">
                <span className="text-xs font-semibold text-muted-foreground">{letter}</span>
              </div>
              {letterContacts.map((contact, i) => {
                const displayName = contact.name || contact.push_name || contact.phone;
                return (
                  <motion.button
                    key={contact.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => handleContactClick(contact)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-secondary/30 transition-colors border-b border-border/30 text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{displayName}</p>
                      <p className="text-xs text-muted-foreground">{contact.phone}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{contact.instance_name}</Badge>
                  </motion.button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
