import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  Plus, X, Clock, Save, Loader2, Trash2, Image, Video,
  Timer, CalendarClock, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

interface ScheduledMessage {
  id: string;
  label_id: string;
  delay_minutes: number;
  message_1: string;
  message_2: string | null;
  message_3: string | null;
  message_4: string | null;
  media_url: string | null;
  media_type: string | null;
  caption: string | null;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  labelId: string;
  labelName: string;
  labelColor: string;
}

function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

export default function LabelScheduledMessages({ open, onClose, labelId, labelName, labelColor }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMsg, setEditingMsg] = useState<Partial<ScheduledMessage> | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open && labelId) loadMessages();
  }, [open, labelId]);

  const loadMessages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('label_scheduled_messages')
      .select('*')
      .eq('label_id', labelId)
      .order('delay_minutes');
    setMessages((data as ScheduledMessage[]) || []);
    setLoading(false);
  };

  const openNew = () => {
    setEditingMsg({
      label_id: labelId,
      delay_minutes: 60,
      message_1: '',
      message_2: null,
      message_3: null,
      message_4: null,
      media_url: null,
      media_type: 'none',
      caption: '',
      is_active: true,
    });
  };

  const openEdit = (msg: ScheduledMessage) => {
    setEditingMsg({ ...msg });
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingMsg) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) { toast.error('Selecione uma imagem ou vídeo'); return; }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `scheduled/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from('media').upload(path, file);
    if (error) { toast.error('Erro ao enviar mídia'); setUploading(false); return; }

    const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
    setEditingMsg({
      ...editingMsg,
      media_url: urlData.publicUrl,
      media_type: isImage ? 'image' : 'video',
    });
    setUploading(false);
  };

  const saveMessage = async () => {
    if (!editingMsg || !user) return;
    if (!editingMsg.message_1?.trim() && (!editingMsg.media_url || editingMsg.media_type === 'none')) {
      toast.error('Adicione pelo menos uma mensagem ou mídia');
      return;
    }

    setSaving(true);
    const payload = {
      user_id: user.id,
      label_id: labelId,
      delay_minutes: editingMsg.delay_minutes || 60,
      message_1: editingMsg.message_1 || '',
      message_2: editingMsg.message_2 || null,
      message_3: editingMsg.message_3 || null,
      message_4: editingMsg.message_4 || null,
      media_url: editingMsg.media_url || null,
      media_type: editingMsg.media_type || 'none',
      caption: editingMsg.caption || '',
      is_active: editingMsg.is_active ?? true,
    };

    if (editingMsg.id) {
      const { error } = await supabase
        .from('label_scheduled_messages')
        .update(payload)
        .eq('id', editingMsg.id);
      if (error) toast.error('Erro ao salvar');
      else toast.success('Mensagem atualizada');
    } else {
      const { error } = await supabase
        .from('label_scheduled_messages')
        .insert(payload);
      if (error) toast.error('Erro ao criar');
      else toast.success('Mensagem programada criada');
    }

    setSaving(false);
    setEditingMsg(null);
    loadMessages();
  };

  const deleteMessage = async (id: string) => {
    await supabase.from('label_scheduled_messages').delete().eq('id', id);
    toast.success('Removida');
    loadMessages();
  };

  const toggleActive = async (msg: ScheduledMessage) => {
    await supabase
      .from('label_scheduled_messages')
      .update({ is_active: !msg.is_active })
      .eq('id', msg.id);
    loadMessages();
  };

  const variationCount = editingMsg
    ? [editingMsg.message_1, editingMsg.message_2, editingMsg.message_3, editingMsg.message_4].filter(m => m?.trim()).length
    : 0;

  // Delay input helpers
  const delayDays = Math.floor((editingMsg?.delay_minutes || 0) / 1440);
  const delayHours = Math.floor(((editingMsg?.delay_minutes || 0) % 1440) / 60);
  const delayMins = (editingMsg?.delay_minutes || 0) % 60;

  const setDelay = (d: number, h: number, m: number) => {
    if (!editingMsg) return;
    setEditingMsg({ ...editingMsg, delay_minutes: Math.max(1, d * 1440 + h * 60 + m) });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg h-[90vh] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Mensagens programadas
            <Badge style={{ backgroundColor: `${labelColor}20`, color: labelColor }} className="ml-1 text-xs">
              {labelName}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {editingMsg ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <ScrollArea className="flex-1 min-h-0 pr-2">
              <div className="space-y-4 pb-4">
                {/* Delay config */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5" /> Enviar após
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Dias</Label>
                      <Input
                        type="number" min={0} max={30}
                        value={delayDays}
                        onChange={e => setDelay(Number(e.target.value), delayHours, delayMins)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Horas</Label>
                      <Input
                        type="number" min={0} max={23}
                        value={delayHours}
                        onChange={e => setDelay(delayDays, Number(e.target.value), delayMins)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Minutos</Label>
                      <Input
                        type="number" min={0} max={59}
                        value={delayMins}
                        onChange={e => setDelay(delayDays, delayHours, Number(e.target.value))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    A mensagem será enviada <strong>{formatDelay(editingMsg.delay_minutes || 60)}</strong> após o lead entrar na etiqueta
                  </p>
                </div>

                {/* Message variations */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Variações de mensagem</Label>
                    {variationCount < 4 && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs gap-1"
                        onClick={() => {
                          if (!editingMsg) return;
                          if (!editingMsg.message_2) setEditingMsg({ ...editingMsg, message_2: '' });
                          else if (!editingMsg.message_3) setEditingMsg({ ...editingMsg, message_3: '' });
                          else if (!editingMsg.message_4) setEditingMsg({ ...editingMsg, message_4: '' });
                        }}
                      >
                        <Plus className="h-3 w-3" /> Variação
                      </Button>
                    )}
                  </div>

                  {(['message_1', 'message_2', 'message_3', 'message_4'] as const).map((key, i) => {
                    const val = editingMsg[key];
                    if (val === null || val === undefined) return null;
                    return (
                      <div key={key} className="flex gap-1.5 items-start">
                        <Badge variant="outline" className="mt-2 text-[10px] shrink-0 tabular-nums">{i + 1}</Badge>
                        <Textarea
                          value={val}
                          onChange={e => setEditingMsg({ ...editingMsg, [key]: e.target.value })}
                          placeholder={`Mensagem variação ${i + 1}...`}
                          className="text-xs min-h-[60px] flex-1"
                        />
                        {i > 0 && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 mt-1 shrink-0"
                            onClick={() => setEditingMsg({ ...editingMsg, [key]: null })}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Media */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Mídia (opcional)</Label>
                  {(!editingMsg.media_url || editingMsg.media_type === 'none') ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-xs gap-1.5" disabled={uploading}
                        onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = 'image/*'; fileInputRef.current.click(); } }}>
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Image className="h-3.5 w-3.5" />} Imagem
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs gap-1.5" disabled={uploading}
                        onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = 'video/*'; fileInputRef.current.click(); } }}>
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />} Vídeo
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 border border-border">
                      {editingMsg.media_type === 'image' ? <Image className="h-4 w-4 text-primary" /> : <Video className="h-4 w-4 text-primary" />}
                      <span className="text-xs flex-1 truncate">{editingMsg.media_url?.split('/').pop()}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6"
                        onClick={() => setEditingMsg({ ...editingMsg, media_url: null, media_type: 'none' })}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {editingMsg.media_url && editingMsg.media_type !== 'none' && (
                    <Input
                      value={editingMsg.caption || ''}
                      onChange={e => setEditingMsg({ ...editingMsg, caption: e.target.value })}
                      placeholder="Legenda da mídia (opcional)"
                      className="h-8 text-xs"
                    />
                  )}
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleMediaUpload} />
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                  <div>
                    <p className="text-xs font-medium">Ativo</p>
                    <p className="text-[10px] text-muted-foreground">Habilitar/desabilitar este agendamento</p>
                  </div>
                  <Switch
                    checked={editingMsg.is_active ?? true}
                    onCheckedChange={v => setEditingMsg({ ...editingMsg, is_active: v })}
                  />
                </div>
              </div>
            </ScrollArea>

            <div className="pt-3 border-t border-border flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditingMsg(null)}>
                Voltar
              </Button>
              <Button className="flex-1 gap-1.5" onClick={saveMessage} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <ScrollArea className="flex-1 min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <CalendarClock className="h-10 w-10 mb-3 opacity-40" />
                  <p className="text-sm">Nenhuma mensagem programada</p>
                  <p className="text-xs mt-1">Crie um agendamento para enviar mensagens automaticamente</p>
                </div>
              ) : (
                <div className="space-y-2 p-1">
                  {messages.map(msg => (
                    <Card
                      key={msg.id}
                      className={`p-3 cursor-pointer hover:border-primary/30 transition-colors ${!msg.is_active ? 'opacity-50' : ''}`}
                      onClick={() => openEdit(msg)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-xs font-medium">{formatDelay(msg.delay_minutes)}</span>
                            {!msg.is_active && (
                              <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                            )}
                            {msg.media_type && msg.media_type !== 'none' && (
                              <Badge variant="outline" className="text-[10px] gap-0.5">
                                {msg.media_type === 'image' ? <Image className="h-2.5 w-2.5" /> : <Video className="h-2.5 w-2.5" />}
                                {msg.media_type === 'image' ? 'Img' : 'Vídeo'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {msg.message_1 || '(apenas mídia)'}
                          </p>
                          {(msg.message_2 || msg.message_3 || msg.message_4) && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {[msg.message_1, msg.message_2, msg.message_3, msg.message_4].filter(Boolean).length} variações
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Switch
                            checked={msg.is_active}
                            onCheckedChange={e => { e; toggleActive(msg); }}
                            onClick={e => e.stopPropagation()}
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={e => { e.stopPropagation(); deleteMessage(msg.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="pt-3 border-t border-border">
              <Button className="w-full gap-1.5" onClick={openNew}>
                <Plus className="h-4 w-4" /> Nova mensagem programada
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
