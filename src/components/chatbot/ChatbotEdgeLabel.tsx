import { memo } from 'react';
import { type EdgeProps, BaseEdge, getSmoothStepPath, EdgeLabelRenderer } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';

interface ChatbotEdgeData {
  keywords?: string[];
  matchType?: string;
  [key: string]: unknown;
}

function ChatbotEdge(props: EdgeProps & { data?: ChatbotEdgeData }) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style, id } = props;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition
  });

  const keywords = data?.keywords ?? [];
  const matchType = data?.matchType ?? 'contains';

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} id={id} />
      <EdgeLabelRenderer>
        <div
          className="absolute pointer-events-auto nodrag nopan cursor-pointer"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <div className="flex flex-wrap gap-0.5 max-w-[180px] justify-center bg-card/95 backdrop-blur-sm rounded-md px-1.5 py-1 border border-border shadow-sm">
            {keywords.length > 0 ? (
              <>
                <span className="text-[8px] text-muted-foreground w-full text-center mb-0.5">
                  {matchType === 'exact' ? 'Exato' : 'Contém'}
                </span>
                {keywords.slice(0, 4).map((kw, i) => (
                  <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                    {kw}
                  </Badge>
                ))}
                {keywords.length > 4 && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 text-muted-foreground">
                    +{keywords.length - 4}
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-[9px] text-muted-foreground italic">sem palavras-chave</span>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(ChatbotEdge);
