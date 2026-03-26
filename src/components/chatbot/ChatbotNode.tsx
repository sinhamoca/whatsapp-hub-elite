import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { MessageSquare, Play, Tag, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ChatbotNodeData {
  name: string;
  type: string;
  responsesCount?: number;
  labelName?: string;
  labelColor?: string;
  absenceTimeout?: number;
  [key: string]: unknown;
}

function ChatbotNode({ data, selected }: NodeProps & { data: ChatbotNodeData }) {
  const isStart = data.type === 'start';

  return (
    <div
      className={`rounded-xl border-2 bg-card shadow-lg min-w-[180px] max-w-[220px] transition-all ${
        selected ? 'border-primary shadow-primary/20' : 'border-border'
      } ${isStart ? 'border-green-500/50' : ''}`}
    >
      {!isStart && (
        <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-primary !border-2 !border-background" />
      )}

      <div className={`px-3 py-2 rounded-t-[10px] flex items-center gap-2 ${
        isStart ? 'bg-green-500/10' : 'bg-primary/5'
      }`}>
        {isStart ? (
          <Play className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <MessageSquare className="h-3.5 w-3.5 text-primary" />
        )}
        <span className="text-xs font-semibold text-foreground truncate">{data.name}</span>
      </div>

      <div className="px-3 py-2 space-y-1.5">
        {(data.responsesCount ?? 0) > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {data.responsesCount} resposta{(data.responsesCount ?? 0) > 1 ? 's' : ''}
          </p>
        )}
        {data.labelName && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0"
            style={{ borderColor: data.labelColor, color: data.labelColor }}
          >
            <Tag className="h-2.5 w-2.5 mr-0.5" />
            {data.labelName}
          </Badge>
        )}
        {(data.absenceTimeout ?? 0) > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            {data.absenceTimeout}min ausência
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-primary !border-2 !border-background" />
    </div>
  );
}

export default memo(ChatbotNode);
