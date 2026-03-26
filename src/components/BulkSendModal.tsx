import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Plus, X, Send, Loader2, Image, Video, Clock, Package,
  CheckCircle2, XCircle, AlertTriangle, Square
} from 'lucide-react';
import { toast } from 'sonner';

interface Contact {
  id: string;
  name: string | null;
  push_name: string | null;
  phone: string | null;
  jid: string;
  instance_id: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contacts: Contact[];
  labelName: string;
  labelColor: string;
}

type SendStatus = 'idle' | 'sending' | 'paused' | 'done' | 'cancelled';

interface SendResult {
  contactName: string;
  success: boolean;
  error?: string;
}

function buildRecipient(jid: string) {
  if (jid.endsWith('@lid')) return { Phone: jid };
  return { Phone: jid.split('@')[0] };
}

export default function BulkSendModal({ open, onClose, contacts, labelName, labelColor }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<string[]>(['']);
  const [mediaType, setMediaType] = useState<'none' | 'image' | 'video'>('none');
  const [mediaBase64, setMediaBase64] = useState('');
  const [mediaName, setMediaName] = useState('');
  const [caption, setCaption] = useState('');
  const [batchSize, setBatchSize] = useState(10);
  const [delayBetweenMessages, setDelayBetweenMessages] = useState(5);
  const [delayBetweenBatches, setDelayBetweenBatches] = useState(60);
  const [status, setStatus] = useState<SendStatus>('idle');
  const [results, setResults] = useState<SendResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const cancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addVariation = () => {
    if (messages.length < 4) setMessages([...messages, '']);
  };

  const removeVariation = (idx: number) => {
    if (messages.length > 1) setMessages(messages.filter((_, i) => i !== idx));
  };

  const updateMessage = (idx: number, val: string) => {
    const updated = [...messages];
    updated[idx] = val;
    setMessages(updated);
  };

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) { toast.error('Selecione uma imagem ou vídeo'); return; }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setMediaBase64(`data:${file.type};base64,${base64}`);
      setMediaName(file.name);
      setMediaType(isImage ? 'image' : 'video');
    };
    reader.readAsDataURL(file);
  };

  const removeMedia = () => {
    setMediaType('none');
    setMediaBase64('');
    setMediaName('');
    setCaption('');
  };

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const getRandomMessage = () => {
    const valid = messages.filter(m => m.trim());
    if (valid.length === 0) return '';
    return valid[Math.floor(Math.random() * valid.length)];
  };

  const startSending = async () => {
    const validMessages = messages.filter(m => m.trim());
    if (validMessages.length === 0 && mediaType === 'none') {
      toast.error('Adicione pelo menos uma mensagem ou mídia');
      return;
    }
    if (contacts.length === 0) {
      toast.error('Nenhum contato para enviar');
      return;
    }

    cancelRef.current = false;
    setStatus('sending');
    setResults([]);
    setCurrentIndex(0);

    // Group contacts by instance_id
    const instanceMap = new Map<string, typeof contacts>();
    contacts.forEach(c => {
      const list = instanceMap.get(c.instance_id) || [];
      list.push(c);
      instanceMap.set(c.instance_id, list);
    });

    // Flatten with instance info preserved
    const allContacts = [...contacts];
    let sent = 0;

    for (let i = 0; i < allContacts.length; i++) {
      if (cancelRef.current) {
        setStatus('cancelled');
        return;
      }

      const contact = allContacts[i];
      const displayName = contact.name || contact.push_name || contact.phone || contact.jid.split('@')[0];
      setCurrentIndex(i + 1);

      try {
        const recipient = buildRecipient(contact.jid);

        // Send text message (random variation)
        const msgText = getRandomMessage();
        if (msgText) {
          await supabase.functions.invoke('wuzapi-proxy', {
            body: {
              instanceId: contact.instance_id,
              endpoint: '/chat/send/text',
              method: 'POST',
              payload: { ...recipient, Body: msgText },
            },
          });
        }

        // Send media if configured
        if (mediaType !== 'none' && mediaBase64) {
          const endpoint = mediaType === 'image' ? '/chat/send/image' : '/chat/send/video';
          const mediaKey = mediaType === 'image' ? 'Image' : 'Video';
          await supabase.functions.invoke('wuzapi-proxy', {
            body: {
              instanceId: contact.instance_id,
              endpoint,
              method: 'POST',
              payload: { ...recipient, [mediaKey]: mediaBase64, Caption: caption || '' },
            },
          });
        }

        setResults(prev => [...prev, { contactName: displayName, success: true }]);
      } catch (err: any) {
        setResults(prev => [...prev, { contactName: displayName, success: false, error: err.message }]);
      }

      sent++;

      // Delay logic
      if (i < allContacts.length - 1) {
        const isEndOfBatch = sent % batchSize === 0;
        if (isEndOfBatch) {
          // Batch pause
          setStatus('paused');
          for (let s = 0; s < delayBetweenBatches; s++) {
            if (cancelRef.current) { setStatus('cancelled'); return; }
            await sleep(1000);
          }
          setStatus('sending');
        } else {
          // Normal delay
          for (let s = 0; s < delayBetweenMessages; s++) {
            if (cancelRef.current) { setStatus('cancelled'); return; }
            await sleep(1000);
          }
        }
      }
    }

    setStatus('done');
  };

  const cancelSending = () => {
    cancelRef.current = true;
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  const progress = contacts.length > 0 ? (currentIndex / contacts.length) * 100 : 0;

  const handleClose = () => {
    if (status === 'sending' || status === 'paused') return;
    setStatus('idle');
    setResults([]);
    setCurrentIndex(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4" />
            Envio em massa
            <Badge style={{ backgroundColor: `${labelColor}20`, color: labelColor }} className="ml-1 text-xs">
              {labelName} · {contacts.length} leads
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {status === 'idle' ? (
          <ScrollArea className="flex-1 max-h-[60vh] pr-2">
            <div className="space-y-4">
              {/* Message variations */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Variações de mensagem</Label>
                  {messages.length < 4 && (
                    <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={addVariation}>
                      <Plus className="h-3 w-3" /> Variação
                    </Button>
                  )}
                </div>
                {messages.map((msg, i) => (
                  <div key={i} className="flex gap-1.5 items-start">
                    <Badge variant="outline" className="mt-2 text-[10px] shrink-0 tabular-nums">
                      {i + 1}
                    </Badge>
                    <Textarea
                      value={msg}
                      onChange={e => updateMessage(i, e.target.value)}
                      placeholder={`Mensagem variação ${i + 1}...`}
                      className="text-xs min-h-[60px] flex-1"
                    />
                    {messages.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 mt-1 shrink-0" onClick={() => removeVariation(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">
                  {messages.length > 1
                    ? `${messages.length} variações — uma será escolhida aleatoriamente para cada lead`
                    : 'Adicione até 4 variações para diminuir risco de banimento'}
                </p>
              </div>

              {/* Media */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Mídia (opcional)</Label>
                {mediaType === 'none' ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5"
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.accept = 'image/*';
                          fileInputRef.current.click();
                        }
                      }}
                    >
                      <Image className="h-3.5 w-3.5" /> Imagem
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5"
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.accept = 'video/*';
                          fileInputRef.current.click();
                        }
                      }}
                    >
                      <Video className="h-3.5 w-3.5" /> Vídeo
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 border border-border">
                    {mediaType === 'image' ? <Image className="h-4 w-4 text-primary" /> : <Video className="h-4 w-4 text-primary" />}
                    <span className="text-xs flex-1 truncate">{mediaName}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={removeMedia}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {mediaType !== 'none' && (
                  <Input
                    value={caption}
                    onChange={e => setCaption(e.target.value)}
                    placeholder="Legenda da mídia (opcional)"
                    className="h-8 text-xs"
                  />
                )}
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleMediaSelect} />
              </div>

              {/* Batch config */}
              <div className="space-y-3 p-3 rounded-lg bg-secondary/30 border border-border">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Package className="h-3.5 w-3.5" /> Configuração de envio
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Lote</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={batchSize}
                      onChange={e => setBatchSize(Number(e.target.value))}
                      className="h-8 text-xs"
                    />
                    <p className="text-[9px] text-muted-foreground">msgs/lote</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Pausa msg</Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={delayBetweenMessages}
                      onChange={e => setDelayBetweenMessages(Number(e.target.value))}
                      className="h-8 text-xs"
                    />
                    <p className="text-[9px] text-muted-foreground">segundos</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Pausa lote</Label>
                    <Input
                      type="number"
                      min={10}
                      max={600}
                      value={delayBetweenBatches}
                      onChange={e => setDelayBetweenBatches(Number(e.target.value))}
                      className="h-8 text-xs"
                    />
                    <p className="text-[9px] text-muted-foreground">segundos</p>
                  </div>
                </div>

                <div className="p-2 rounded bg-muted/50 text-[10px] text-muted-foreground space-y-0.5">
                  <p>📋 <strong>{contacts.length}</strong> leads em <strong>{Math.ceil(contacts.length / batchSize)}</strong> lotes</p>
                  <p>⏱ Tempo estimado: ~<strong>{Math.ceil(
                    (contacts.length * delayBetweenMessages) +
                    (Math.floor(contacts.length / batchSize) * delayBetweenBatches)
                  )}s</strong> ({Math.ceil(
                    ((contacts.length * delayBetweenMessages) +
                    (Math.floor(contacts.length / batchSize) * delayBetweenBatches)) / 60
                  )} min)</p>
                </div>
              </div>

              {/* Send button */}
              <Button className="w-full gap-2" onClick={startSending}>
                <Send className="h-4 w-4" />
                Iniciar envio para {contacts.length} leads
              </Button>
            </div>
          </ScrollArea>
        ) : (
          /* Progress / Results view */
          <div className="space-y-4">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {status === 'sending' && 'Enviando...'}
                  {status === 'paused' && '⏸ Pausa entre lotes...'}
                  {status === 'done' && '✅ Envio concluído'}
                  {status === 'cancelled' && '⛔ Envio cancelado'}
                </span>
                <span className="tabular-nums font-medium">{currentIndex}/{contacts.length}</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Stats */}
            <div className="flex gap-3">
              <div className="flex items-center gap-1.5 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                <span className="tabular-nums">{successCount} enviados</span>
              </div>
              {failCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  <span className="tabular-nums">{failCount} erros</span>
                </div>
              )}
            </div>

            {/* Results list */}
            <ScrollArea className="h-48 rounded-lg border border-border">
              <div className="p-2 space-y-0.5">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-secondary/30">
                    {r.success
                      ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                      : <XCircle className="h-3 w-3 text-destructive shrink-0" />}
                    <span className="truncate flex-1">{r.contactName}</span>
                    {r.error && <span className="text-destructive text-[10px] truncate max-w-[120px]">{r.error}</span>}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Actions */}
            <div className="flex gap-2">
              {(status === 'sending' || status === 'paused') ? (
                <Button variant="destructive" className="w-full gap-2" onClick={cancelSending}>
                  <Square className="h-3.5 w-3.5" /> Cancelar envio
                </Button>
              ) : (
                <Button variant="outline" className="w-full" onClick={handleClose}>
                  Fechar
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
