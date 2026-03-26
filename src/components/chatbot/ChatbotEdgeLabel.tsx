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

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} id={id} />
      {keywords.length > 0 && (
        <EdgeLabelRenderer>
          <div
            className="absolute pointer-events-auto nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <div className="flex flex-wrap gap-0.5 max-w-[160px] justify-center">
              {keywords.slice(0, 3).map((kw, i) => (
                <Badge key={i} variant="secondary" className="text-[9px] px-1 py-0 bg-background border border-border">
                  {kw}
                </Badge>
              ))}
              {keywords.length > 3 && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0">
                  +{keywords.length - 3}
                </Badge>
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(ChatbotEdge);
