import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tag, Plus, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Label {
  id: string;
  name: string;
  color: string;
}

interface Props {
  contactJid: string;
  instanceId: string;
}

export default function ContactLabels({ contactJid, instanceId }: Props) {
  const { user } = useAuth();
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [contactId, setContactId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    const [labelsRes, contactRes] = await Promise.all([
      supabase.from('labels').select('id, name, color').order('created_at'),
      supabase.from('contacts').select('id').eq('jid', contactJid).eq('instance_id', instanceId).maybeSingle(),
    ]);

    setAllLabels((labelsRes.data || []) as Label[]);

    if (contactRes.data) {
      setContactId(contactRes.data.id);
      const { data: applied } = await supabase
        .from('contact_labels')
        .select('label_id')
        .eq('contact_id', contactRes.data.id);
      setAppliedIds(new Set((applied || []).map((a: any) => a.label_id)));
    }
  }, [user, contactJid, instanceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleLabel = async (labelId: string) => {
    if (!contactId) return;

    if (appliedIds.has(labelId)) {
      await supabase.from('contact_labels')
        .delete()
        .eq('contact_id', contactId)
        .eq('label_id', labelId);
      setAppliedIds(prev => { const n = new Set(prev); n.delete(labelId); return n; });
    } else {
      await supabase.from('contact_labels').insert({ contact_id: contactId, label_id: labelId });
      setAppliedIds(prev => new Set(prev).add(labelId));
    }
  };

  const applied = allLabels.filter(l => appliedIds.has(l.id));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Etiquetas</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {applied.map(l => (
          <Badge
            key={l.id}
            className="text-[11px] px-2 py-0.5 text-white border-0"
            style={{ backgroundColor: l.color }}
          >
            {l.name}
          </Badge>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] gap-1" disabled={!contactId}>
              <Plus className="h-3 w-3" />
              {applied.length === 0 ? 'Adicionar' : ''}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2 bg-card border-border" align="start">
            {allLabels.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                Crie etiquetas em Configurações
              </p>
            ) : (
              <div className="space-y-1">
                {allLabels.map(l => (
                  <button
                    key={l.id}
                    onClick={() => toggleLabel(l.id)}
                    className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-secondary/50 transition-colors text-left"
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                    <span className="text-sm text-foreground flex-1">{l.name}</span>
                    {appliedIds.has(l.id) && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
