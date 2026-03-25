import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Send, Paperclip, Mic, Image, FileText, Video, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface Message {
  id: string;
  text: string;
  time: string;
  fromMe: boolean;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
}

const mockMessages: Message[] = [
  { id: '1', text: 'Olá! Vi o anúncio do produto X', time: '14:20', fromMe: false, type: 'text' },
  { id: '2', text: 'Olá Maria! Claro, posso ajudar. Qual produto te interessou?', time: '14:22', fromMe: true, type: 'text' },
  { id: '3', text: 'O modelo azul, tamanho M. Qual o valor?', time: '14:25', fromMe: false, type: 'text' },
  { id: '4', text: 'O modelo azul M está por R$ 89,90 com frete grátis para SP!', time: '14:28', fromMe: true, type: 'text' },
  { id: '5', text: 'Ótimo! Aceita PIX?', time: '14:30', fromMe: false, type: 'text' },
  { id: '6', text: 'Sim! Vou te enviar a chave agora', time: '14:31', fromMe: true, type: 'text' },
  { id: '7', text: 'Gostaria de saber o preço do modelo vermelho também', time: '14:32', fromMe: false, type: 'text' },
];

const instances = [
  { id: '1', name: 'Vendas', phone: '+55 11 99999-0001' },
  { id: '2', name: 'Suporte', phone: '+55 11 99999-0002' },
];

export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState(mockMessages);
  const [text, setText] = useState('');
  const [selectedInstance, setSelectedInstance] = useState(instances[0]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    setMessages([...messages, {
      id: Date.now().toString(),
      text: text.trim(),
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      fromMe: true,
      type: 'text',
    }]);
    setText('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessages([...messages, {
      id: Date.now().toString(),
      text: `📎 ${file.name}`,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      fromMe: true,
      type: 'document',
    }]);
  };

  return (
    <div className="flex-1 flex flex-col h-screen md:h-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-border bg-card/50 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-foreground">
          MS
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground">Maria Silva</p>
          <p className="text-xs text-muted-foreground">Online</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs gap-1">
              {selectedInstance.name}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border">
            {instances.map(inst => (
              <DropdownMenuItem
                key={inst.id}
                onClick={() => setSelectedInstance(inst)}
                className={cn(inst.id === selectedInstance.id && 'bg-primary/10 text-primary')}
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
        {messages.map((msg, i) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className={cn('flex', msg.fromMe ? 'justify-end' : 'justify-start')}
          >
            <div className={cn(
              'max-w-[80%] md:max-w-[60%] rounded-2xl px-4 py-2',
              msg.fromMe
                ? 'bg-chat-outgoing rounded-br-md'
                : 'bg-chat-incoming rounded-bl-md'
            )}>
              <p className="text-sm text-foreground">{msg.text}</p>
              <p className="text-[10px] text-muted-foreground text-right mt-1">{msg.time}</p>
            </div>
          </motion.div>
        ))}
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
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            className="bg-secondary/50 border-border"
          />
          <Button size="icon" onClick={handleSend} disabled={!text.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          Respondendo via <span className="text-primary font-medium">{selectedInstance.name}</span> ({selectedInstance.phone})
        </p>
      </div>
    </div>
  );
}
