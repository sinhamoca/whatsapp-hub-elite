import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Send, Paperclip, Mic, Image, FileText, Video, ChevronDown, Loader2, Square } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  body: string;
  timestamp: string;
  from_me: boolean;
  msg_type: string;
  media_url?: string;
  media_mime?: string;
}

interface ConversationInfo {
  id: string;
  jid: string;
  contact_name: string;
  instance_id: string;
}

export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<ConversationInfo | null>(null);
  const [contactPhone, setContactPhone] = useState('');
  const [instances, setInstances] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build the payload with JID support (handles @lid format)
  const buildRecipient = (jid: string) => {
    // If JID is @lid format, send full JID; otherwise extract phone
    if (jid.endsWith('@lid')) {
      return { Phone: jid };
    }
    return { Phone: jid.split('@')[0] };
  };

  const fetchData = useCallback(async () => {
    if (!user || !id) return;

    const [convRes, instRes] = await Promise.all([
      supabase.from('conversations').select('id, jid, contact_name, instance_id').eq('id', id).single(),
      supabase.from('instances').select('id, name, phone'),
    ]);

    if (convRes.error || !convRes.data) {
      navigate('/');
      return;
    }

    setConversation(convRes.data as any);
    setSelectedInstanceId(convRes.data.instance_id);
    setInstances((instRes.data || []) as any);

    // Fetch contact phone
    const { data: contactData } = await supabase
      .from('contacts')
      .select('phone')
      .eq('jid', convRes.data.jid)
      .eq('instance_id', convRes.data.instance_id)
      .maybeSingle();
    
    const phone = (contactData?.phone || '').replace(/\D/g, '');
    const jidLocalPart = convRes.data.jid.split('@')[0] || '';
    const isLidJid = convRes.data.jid.endsWith('@lid');

    if (phone && phone.length <= 15 && /^\d+$/.test(phone) && (!isLidJid || phone !== jidLocalPart)) {
      setContactPhone(phone);
    } else {
      setContactPhone('');
    }

    const msgRes = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('timestamp', { ascending: true });

    setMessages((msgRes.data || []) as any);
    setLoading(false);

    await supabase.from('conversations').update({ unread_count: 0 }).eq('id', id);
  }, [user, id]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`messages-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new as any]);
          supabase.from('conversations').update({ unread_count: 0 }).eq('id', id);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || !conversation || sending) return;
    setSending(true);

    try {
      const recipient = buildRecipient(conversation.jid);
      const { data, error } = await supabase.functions.invoke('wuzapi-proxy', {
        body: {
          instanceId: selectedInstanceId,
          endpoint: '/chat/send/text',
          method: 'POST',
          payload: { ...recipient, Body: text.trim() },
        },
      });

      if (error) throw error;

      const newMsg: Message = {
        id: Date.now().toString(),
        body: text.trim(),
        timestamp: new Date().toISOString(),
        from_me: true,
        msg_type: 'text',
      };
      setMessages(prev => [...prev, newMsg]);

      await supabase.from('messages').insert({
        user_id: user!.id,
        instance_id: selectedInstanceId,
        conversation_id: conversation.id,
        message_id: (data as any)?.data?.Id || '',
        jid: conversation.jid,
        from_me: true,
        body: text.trim(),
        msg_type: 'text',
        timestamp: new Date().toISOString(),
      });

      await supabase.from('conversations').update({
        last_message: text.trim().substring(0, 200),
        last_message_at: new Date().toISOString(),
      }).eq('id', conversation.id);

      setText('');
    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
    }
    setSending(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversation) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');
      const recipient = buildRecipient(conversation.jid);

      let endpoint = '/chat/send/document';
      let payload: any = { ...recipient, Document: `data:${file.type};base64,${base64}`, FileName: file.name };

      if (isImage) {
        endpoint = '/chat/send/image';
        payload = { ...recipient, Image: `data:${file.type};base64,${base64}`, Caption: file.name };
      } else if (isVideo) {
        endpoint = '/chat/send/video';
        payload = { ...recipient, Video: `data:${file.type};base64,${base64}`, Caption: file.name };
      } else if (isAudio) {
        endpoint = '/chat/send/audio';
        payload = { ...recipient, Audio: `data:${file.type};base64,${base64}` };
      }

      try {
        await supabase.functions.invoke('wuzapi-proxy', {
          body: { instanceId: selectedInstanceId, endpoint, method: 'POST', payload },
        });

        const typeLabel = isImage ? '📷 Imagem' : isVideo ? '🎥 Vídeo' : isAudio ? '🎵 Áudio' : `📄 ${file.name}`;
        const newMsg: Message = {
          id: Date.now().toString(),
          body: typeLabel,
          timestamp: new Date().toISOString(),
          from_me: true,
          msg_type: isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'document',
        };
        setMessages(prev => [...prev, newMsg]);

        await supabase.from('messages').insert({
          user_id: user!.id,
          instance_id: selectedInstanceId,
          conversation_id: conversation.id,
          jid: conversation.jid,
          from_me: true,
          body: typeLabel,
          msg_type: newMsg.msg_type,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        toast({ title: 'Erro ao enviar mídia', description: err.message, variant: 'destructive' });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        setRecordingTime(0);

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' });
        if (audioBlob.size < 1000) return; // too small

        const reader = new FileReader();
        reader.onload = async () => {
          if (!conversation) return;
          const base64 = (reader.result as string).split(',')[1];
          const recipient = buildRecipient(conversation.jid);

          try {
            await supabase.functions.invoke('wuzapi-proxy', {
              body: {
                instanceId: selectedInstanceId,
                endpoint: '/chat/send/audio',
                method: 'POST',
                payload: { ...recipient, Audio: `data:audio/ogg;base64,${base64}` },
              },
            });

            const newMsg: Message = {
              id: Date.now().toString(),
              body: '🎤 Áudio',
              timestamp: new Date().toISOString(),
              from_me: true,
              msg_type: 'audio',
            };
            setMessages(prev => [...prev, newMsg]);

            await supabase.from('messages').insert({
              user_id: user!.id,
              instance_id: selectedInstanceId,
              conversation_id: conversation.id,
              jid: conversation.jid,
              from_me: true,
              body: '🎤 Áudio',
              msg_type: 'audio',
              timestamp: new Date().toISOString(),
            });
          } catch (err: any) {
            toast({ title: 'Erro ao enviar áudio', description: err.message, variant: 'destructive' });
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);

      let t = 0;
      recordingTimerRef.current = setInterval(() => {
        t++;
        setRecordingTime(t);
      }, 1000);
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível acessar o microfone', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const formatRecordingTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const selectedInstance = instances.find(i => i.id === selectedInstanceId);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen md:h-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-border bg-card/50 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-foreground">
          {conversation?.contact_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground">{conversation?.contact_name || 'Chat'}</p>
          <p className="text-xs text-muted-foreground">
            {contactPhone || (conversation?.jid?.endsWith('@lid') ? '' : conversation?.jid?.split('@')[0])}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs gap-1">
              {selectedInstance?.name || 'Instância'}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border">
            {instances.map(inst => (
              <DropdownMenuItem
                key={inst.id}
                onClick={() => setSelectedInstanceId(inst.id)}
                className={cn(inst.id === selectedInstanceId && 'bg-primary/10 text-primary')}
              >
                <div>
                  <p className="text-sm font-medium">{inst.name}</p>
                  <p className="text-xs text-muted-foreground">{inst.phone}</p>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhuma mensagem ainda
          </div>
        ) : (
          messages.map((msg, i) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.5) }}
              className={cn('flex', msg.from_me ? 'justify-end' : 'justify-start')}
            >
              <div className={cn(
                'max-w-[80%] md:max-w-[60%] rounded-2xl px-4 py-2',
                msg.from_me
                  ? 'bg-chat-outgoing rounded-br-md'
                  : 'bg-chat-incoming rounded-bl-md'
              )}>
                {msg.media_url && msg.msg_type === 'image' && (
                  <img src={msg.media_url} alt="Imagem" className="rounded-lg mb-1 max-w-full max-h-64 object-contain cursor-pointer" onClick={() => window.open(msg.media_url, '_blank')} />
                )}
                {msg.media_url && msg.msg_type === 'video' && (
                  <video src={msg.media_url} controls className="rounded-lg mb-1 max-w-full max-h-64" />
                )}
                {msg.media_url && msg.msg_type === 'audio' && (
                  <audio src={msg.media_url} controls className="mb-1 max-w-full" />
                )}
                {msg.media_url && msg.msg_type === 'document' && (
                  <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2 mb-1 hover:bg-secondary transition-colors">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-xs text-primary underline truncate">{msg.body || 'Documento'}</span>
                  </a>
                )}
                {msg.media_url && msg.msg_type === 'sticker' && (
                  <img src={msg.media_url} alt="Sticker" className="max-w-[150px] mb-1" />
                )}
                <p className="text-sm text-foreground">{msg.body}</p>
                <p className="text-[10px] text-muted-foreground text-right mt-1">{formatTime(msg.timestamp)}</p>
              </div>
            </motion.div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={handleFileSelect}
          />

          {recording ? (
            <div className="flex-1 flex items-center gap-3 bg-destructive/10 rounded-lg px-4 py-2">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-sm font-medium text-destructive">{formatRecordingTime(recordingTime)}</span>
              <span className="text-xs text-muted-foreground flex-1">Gravando...</span>
              <Button variant="destructive" size="icon" className="h-8 w-8" onClick={stopRecording}>
                <Square className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0">
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-card border-border">
                  <DropdownMenuItem onClick={() => { fileRef.current!.accept = 'image/*'; fileRef.current!.click(); }}>
                    <Image className="h-4 w-4 mr-2" /> Imagem
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { fileRef.current!.accept = 'video/*'; fileRef.current!.click(); }}>
                    <Video className="h-4 w-4 mr-2" /> Vídeo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { fileRef.current!.accept = 'audio/*'; fileRef.current!.click(); }}>
                    <Mic className="h-4 w-4 mr-2" /> Áudio
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { fileRef.current!.accept = '.pdf,.doc,.docx,.xls,.xlsx'; fileRef.current!.click(); }}>
                    <FileText className="h-4 w-4 mr-2" /> Documento
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Input
                placeholder="Digite uma mensagem..."
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                className="bg-secondary/50 border-border"
              />
              {text.trim() ? (
                <Button size="icon" onClick={handleSend} disabled={sending}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              ) : (
                <Button variant="ghost" size="icon" onClick={startRecording} title="Gravar áudio">
                  <Mic className="h-5 w-5" />
                </Button>
              )}
            </>
          )}
        </div>
        {!recording && (
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Respondendo via <span className="text-primary font-medium">{selectedInstance?.name || '...'}</span> ({selectedInstance?.phone || '...'})
          </p>
        )}
      </div>
    </div>
  );
}
