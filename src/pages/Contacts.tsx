import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, User } from 'lucide-react';
import { motion } from 'framer-motion';

interface Contact {
  id: string;
  name: string;
  phone: string;
  instanceName: string;
}

const mockContacts: Contact[] = [
  { id: '1', name: 'Ana Oliveira', phone: '+55 11 98765-4321', instanceName: 'Vendas' },
  { id: '2', name: 'Carlos Souza', phone: '+55 21 97654-3210', instanceName: 'Vendas' },
  { id: '3', name: 'Fernanda Lima', phone: '+55 31 96543-2109', instanceName: 'Suporte' },
  { id: '4', name: 'João Santos', phone: '+55 41 95432-1098', instanceName: 'Suporte' },
  { id: '5', name: 'Maria Silva', phone: '+55 11 94321-0987', instanceName: 'Vendas' },
  { id: '6', name: 'Pedro Costa', phone: '+55 51 93210-9876', instanceName: 'Vendas' },
];

export default function Contacts() {
  const [search, setSearch] = useState('');

  const filtered = mockContacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const grouped = filtered.reduce((acc, c) => {
    const letter = c.name[0].toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(c);
    return acc;
  }, {} as Record<string, Contact[]>);

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
        {Object.entries(grouped).sort().map(([letter, contacts]) => (
          <div key={letter}>
            <div className="px-4 py-1.5 bg-secondary/30">
              <span className="text-xs font-semibold text-muted-foreground">{letter}</span>
            </div>
            {contacts.map((contact, i) => (
              <motion.div
                key={contact.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 p-4 hover:bg-secondary/30 transition-colors border-b border-border/30"
              >
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{contact.name}</p>
                  <p className="text-xs text-muted-foreground">{contact.phone}</p>
                </div>
                <Badge variant="secondary" className="text-[10px]">{contact.instanceName}</Badge>
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
