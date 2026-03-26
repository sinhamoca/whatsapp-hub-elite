import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, GripVertical, X, Image, Video, Type, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface NodeResponse {
  id: string;
  response_type: string;
  content: string;
  media_url: string;
  sort_order: number;
  delay_seconds: number;
}

interface LabelOption {
  id: string;
  name: string;
  color: string;
}

interface Props {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  absenceMessage: string;
  absenceTimeout: number;
  labelId: string | null;
  labels: LabelOption[];
  onClose: () => void;
  onUpdate: (data: { name?: string; absence_message?: string; absence_timeout_minutes?: number; label_id?: string | null }) => void;
}

export default function NodeConfigPanel({ nodeId, nodeName, nodeType, absenceMessage, absenceTimeout, labelId, labels, onClose, onUpdate }: Props) {
  const [name, setName] = useState(nodeName);
  const [responses, setResponses] = useState<NodeResponse[]>([]);
  const [absMsg, setAbsMsg] = useState(absenceMessage);
  const [absTime, setAbsTime] = useState(absenceTimeout);
  const [selLabel, setSelLabel] = useState(labelId || 'none');
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{ id: string; type: string } | null>(null);

  useEffect(() => {
    loadResponses();
  }, [nodeId]);

  const loadResponses = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('chatbot_node_responses')
      .select('*')
      .eq('node_id', nodeId)
      .order('sort_order');
    if (data) setResponses(data);
    setLoading(false);
  };

  const saveName = () => {
    if (name.trim() && name !== nodeName) {
      onUpdate({ name: name.trim() });
    }
  };

  const saveAbsence = () => {
    onUpdate({ absence_message: absMsg, absence_timeout_minutes: absTime });
  };

  const saveLabel = (val: string) => {
    setSelLabel(val);
    onUpdate({ label_id: val === 'none' ? null : val });
  };

  const addResponse = async (type: string) => {
    const { data, error } = await supabase.from('chatbot_node_responses').insert({
      node_id: nodeId,
      response_type: type,
      sort_order: responses.length,
      delay_seconds: 2,
    }).select().single();
    if (data) setResponses([...responses, data]);
    if (error) toast.error('Erro ao adicionar resposta');
  };

  const updateResponse = async (id: string, field: string, value: string | number) => {
    await supabase.from('chatbot_node_responses').update({ [field]: value }).eq('id', id);
    setResponses(r => r.map(res => res.id === id ? { ...res, [field]: value } : res));
  };

  const deleteResponse = async (id: string) => {
    await supabase.from('chatbot_node_responses').delete().eq('id', id);
    setResponses(r => r.filter(res => res.id !== id));
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = uploadTargetRef.current;
    if (!file || !target) return;
    e.target.value = '';

    setUploadingId(target.id);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `chatbot/${nodeId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('media').upload(path, file);
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
      await updateResponse(target.id, 'media_url', urlData.publicUrl);
      toast.success('Mídia enviada');
    } catch (err: any) {
      toast.error('Erro ao enviar mídia: ' + err.message);
    }
    setUploadingId(null);
  };

  const triggerUpload = (id: string, type: string) => {
    uploadTargetRef.current = { id, type };
    if (fileInputRef.current) {
      fileInputRef.current.accept = type === 'image' ? 'image/*' : 'video/*';
      fileInputRef.current.click();
    }
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-card border-l border-border z-50 flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">Configurar Nó</span>
        <Button size="icon" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs">Nome</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={saveName}
              className="h-8 text-sm"
            />
          </div>

          <Separator />

          {/* Responses */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Respostas sequenciais</Label>
            </div>

            {responses.map((res, idx) => (
              <div key={res.id} className="glass rounded-lg p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <GripVertical className="h-3 w-3" />
                    <span>#{idx + 1}</span>
                    {res.response_type === 'text' && <Type className="h-3 w-3" />}
                    {res.response_type === 'image' && <Image className="h-3 w-3" />}
                    {res.response_type === 'video' && <Video className="h-3 w-3" />}
                  </div>
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => deleteResponse(res.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>

                {res.response_type === 'text' ? (
                  <Textarea
                    placeholder="Mensagem de texto..."
                    value={res.content}
                    onChange={e => updateResponse(res.id, 'content', e.target.value)}
                    className="text-xs min-h-[60px]"
                  />
                ) : (
                  <div className="space-y-1">
                    <Input
                      placeholder="URL da mídia"
                      value={res.media_url}
                      onChange={e => updateResponse(res.id, 'media_url', e.target.value)}
                      className="h-7 text-xs"
                    />
                    <Input
                      placeholder="Legenda (opcional)"
                      value={res.content}
                      onChange={e => updateResponse(res.id, 'content', e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                )}

                <div className="flex items-center gap-1">
                  <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Delay (s):</Label>
                  <Input
                    type="number"
                    min={0}
                    value={res.delay_seconds}
                    onChange={e => updateResponse(res.id, 'delay_seconds', parseInt(e.target.value) || 0)}
                    className="h-6 text-xs w-16"
                  />
                </div>
              </div>
            ))}

            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => addResponse('text')}>
                <Type className="h-3 w-3 mr-1" /> Texto
              </Button>
              <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => addResponse('image')}>
                <Image className="h-3 w-3 mr-1" /> Imagem
              </Button>
              <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => addResponse('video')}>
                <Video className="h-3 w-3 mr-1" /> Vídeo
              </Button>
            </div>
          </div>

          <Separator />

          {/* Label */}
          <div className="space-y-1.5">
            <Label className="text-xs">Etiqueta ao atingir este nó</Label>
            <Select value={selLabel} onValueChange={saveLabel}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Nenhuma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {labels.map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                      {l.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Absence */}
          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem de ausência</Label>
            <Textarea
              placeholder="Mensagem enviada se o lead não responder..."
              value={absMsg}
              onChange={e => setAbsMsg(e.target.value)}
              onBlur={saveAbsence}
              className="text-xs min-h-[60px]"
            />
            <div className="flex items-center gap-1">
              <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Tempo (min):</Label>
              <Input
                type="number"
                min={0}
                value={absTime}
                onChange={e => { setAbsTime(parseInt(e.target.value) || 0); }}
                onBlur={saveAbsence}
                className="h-6 text-xs w-20"
              />
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
