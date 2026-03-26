import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Label {
  id: string;
  name: string;
  color: string;
}

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
];

export default function LabelsManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [labels, setLabels] = useState<Label[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [loading, setLoading] = useState(true);

  const fetchLabels = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('labels')
      .select('id, name, color')
      .order('created_at', { ascending: true });
    setLabels((data || []) as Label[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchLabels(); }, [fetchLabels]);

  const handleCreate = async () => {
    if (!newName.trim() || !user) return;
    const { error } = await supabase.from('labels').insert({
      user_id: user.id,
      name: newName.trim(),
      color: newColor,
    });
    if (error) {
      toast({ title: 'Erro ao criar etiqueta', variant: 'destructive' });
      return;
    }
    setNewName('');
    setNewColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
    fetchLabels();
    toast({ title: 'Etiqueta criada!' });
  };

  const handleDelete = async (id: string) => {
    await supabase.from('labels').delete().eq('id', id);
    fetchLabels();
    toast({ title: 'Etiqueta removida' });
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Tag className="h-4 w-4" />
        <span className="text-sm font-medium">Etiquetas</span>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Nome da etiqueta..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          className="flex-1 bg-secondary/50 border-border"
        />
        <div className="flex gap-1 items-center">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setNewColor(c)}
              className="w-5 h-5 rounded-full border-2 transition-transform shrink-0"
              style={{
                backgroundColor: c,
                borderColor: c === newColor ? 'hsl(var(--foreground))' : 'transparent',
                transform: c === newColor ? 'scale(1.2)' : 'scale(1)',
              }}
            />
          ))}
        </div>
        <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {labels.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nenhuma etiqueta criada ainda
        </p>
      ) : (
        <div className="space-y-2">
          {labels.map(label => (
            <div key={label.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/30">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
              <span className="text-sm text-foreground flex-1">{label.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(label.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
