import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus } from 'lucide-react';

interface Props {
  open: boolean;
  keywords: string[];
  matchType: string;
  onSave: (keywords: string[], matchType: string) => void;
  onClose: () => void;
}

export default function EdgeConfigModal({ open, keywords: initial, matchType: initMatch, onSave, onClose }: Props) {
  const [keywords, setKeywords] = useState<string[]>(initial);
  const [matchType, setMatchType] = useState(initMatch);
  const [input, setInput] = useState('');

  const addKeyword = () => {
    const kw = input.trim();
    if (kw && !keywords.some(k => k.toLowerCase() === kw.toLowerCase())) {
      setKeywords([...keywords, kw]);
      setInput('');
    }
  };

  const removeKeyword = (idx: number) => {
    setKeywords(keywords.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Configurar conexão</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de correspondência</Label>
            <Select value={matchType} onValueChange={setMatchType}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">Contém a palavra-chave</SelectItem>
                <SelectItem value="exact">Correspondência exata</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              {matchType === 'contains'
                ? 'A mensagem do lead precisa conter a palavra-chave (ignora maiúsculas/minúsculas)'
                : 'A mensagem do lead deve ser exatamente a palavra-chave (ignora maiúsculas/minúsculas)'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Palavras-chave</Label>
            <div className="flex gap-1">
              <Input
                placeholder="Adicionar palavra..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                className="h-8 text-xs flex-1"
              />
              <Button size="sm" variant="outline" className="h-8" onClick={addKeyword}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-1 mt-1">
              {keywords.map((kw, i) => (
                <Badge key={i} variant="secondary" className="text-xs gap-1 pr-1">
                  {kw}
                  <button onClick={() => removeKeyword(i)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => onSave(keywords, matchType)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
