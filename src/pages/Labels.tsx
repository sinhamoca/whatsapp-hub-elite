import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Tag, ArrowLeft, Users, Hash, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import BulkSendModal from '@/components/BulkSendModal';
import LabelScheduledMessages from '@/components/LabelScheduledMessages';

interface Label {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface Contact {
  id: string;
  name: string | null;
  push_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  jid: string;
  instance_id: string;
}

export default function Labels() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  useEffect(() => {
    if (user) loadLabels();
  }, [user]);

  const loadLabels = async () => {
    setLoading(true);
    const { data: labelsData } = await supabase
      .from('labels')
      .select('id, name, color')
      .eq('user_id', user!.id)
      .order('name');

    if (!labelsData) { setLoading(false); return; }

    const { data: clData } = await supabase
      .from('contact_labels')
      .select('label_id');

    const counts: Record<string, number> = {};
    (clData || []).forEach(cl => {
      counts[cl.label_id] = (counts[cl.label_id] || 0) + 1;
    });

    setLabels(labelsData.map(l => ({ ...l, count: counts[l.id] || 0 })));
    setLoading(false);
  };

  const openLabel = async (label: Label) => {
    setSelectedLabel(label);
    setLoadingContacts(true);

    const { data: clData } = await supabase
      .from('contact_labels')
      .select('contact_id')
      .eq('label_id', label.id);

    if (!clData || clData.length === 0) {
      setContacts([]);
      setLoadingContacts(false);
      return;
    }

    const contactIds = clData.map(cl => cl.contact_id);
    const { data: contactsData } = await supabase
      .from('contacts')
      .select('id, name, push_name, phone, avatar_url, jid, instance_id')
      .in('id', contactIds)
      .order('name');

    setContacts(contactsData || []);
    setLoadingContacts(false);
  };

  const openChat = async (contact: Contact) => {
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('jid', contact.jid)
      .eq('instance_id', contact.instance_id)
      .maybeSingle();

    if (conv) {
      navigate(`/chat/${conv.id}`);
    } else {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          user_id: user!.id,
          instance_id: contact.instance_id,
          jid: contact.jid,
          contact_name: contact.name || contact.push_name || contact.phone || '',
          avatar_url: contact.avatar_url || '',
        })
        .select('id')
        .single();
      if (newConv) navigate(`/chat/${newConv.id}`);
    }
  };

  const totalLeads = labels.reduce((sum, l) => sum + l.count, 0);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-card/50">
        {selectedLabel ? (
          <Button size="icon" variant="ghost" onClick={() => setSelectedLabel(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : (
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Tag className="h-4 w-4 text-primary" />
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-foreground">
            {selectedLabel ? selectedLabel.name : 'Etiquetas'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {selectedLabel
              ? `${contacts.length} lead${contacts.length !== 1 ? 's' : ''}`
              : `${labels.length} etiqueta${labels.length !== 1 ? 's' : ''} · ${totalLeads} lead${totalLeads !== 1 ? 's' : ''}`}
          </p>
        </div>
        {selectedLabel && contacts.length > 0 && !loadingContacts && (
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => setBulkSendOpen(true)}>
            <Send className="h-3.5 w-3.5" /> Envio em massa
          </Button>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <AnimatePresence mode="wait">
          {!selectedLabel ? (
            <motion.div
              key="labels-grid"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            >
              {labels.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Tag className="h-10 w-10 mb-3 opacity-40" />
                  <p className="text-sm">Nenhuma etiqueta criada</p>
                  <p className="text-xs mt-1">Crie etiquetas em Configurações</p>
                </div>
              ) : (
                labels.map((label, i) => (
                  <motion.div
                    key={label.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.25 }}
                  >
                    <Card
                      className="group cursor-pointer border border-border hover:border-primary/30 transition-all duration-200 hover:shadow-md hover:shadow-primary/5 overflow-hidden"
                      onClick={() => openLabel(label)}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                            style={{ backgroundColor: `${label.color}18` }}
                          >
                            <Tag className="h-4 w-4" style={{ color: label.color }} />
                          </div>
                          <Badge
                            variant="secondary"
                            className="text-xs tabular-nums"
                          >
                            <Users className="h-3 w-3 mr-1" />
                            {label.count}
                          </Badge>
                        </div>
                        <h3 className="font-medium text-foreground text-sm truncate">
                          {label.name}
                        </h3>
                        <div className="mt-2 h-1 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              backgroundColor: label.color,
                              width: totalLeads > 0 ? `${Math.max((label.count / totalLeads) * 100, 4)}%` : '0%',
                            }}
                          />
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))
              )}
            </motion.div>
          ) : (
            <motion.div
              key="contacts-list"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="p-4 space-y-1.5"
            >
              {loadingContacts ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : contacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Users className="h-10 w-10 mb-3 opacity-40" />
                  <p className="text-sm">Nenhum lead com esta etiqueta</p>
                </div>
              ) : (
                contacts.map((contact, i) => {
                  const displayName = contact.name || contact.push_name || contact.phone || contact.jid.split('@')[0];
                  const initials = displayName.slice(0, 2).toUpperCase();
                  return (
                    <motion.div
                      key={contact.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03, duration: 0.2 }}
                    >
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer" onClick={() => openChat(contact)}>
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={contact.avatar_url || undefined} />
                          <AvatarFallback
                            className="text-xs font-medium"
                            style={{ backgroundColor: `${selectedLabel.color}20`, color: selectedLabel.color }}
                          >
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {displayName}
                          </p>
                          {contact.phone && (
                            <p className="text-xs text-muted-foreground truncate">
                              {contact.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </ScrollArea>

      {selectedLabel && (
        <BulkSendModal
          open={bulkSendOpen}
          onClose={() => setBulkSendOpen(false)}
          contacts={contacts}
          labelName={selectedLabel.name}
          labelColor={selectedLabel.color}
        />
      )}
    </div>
  );
}
