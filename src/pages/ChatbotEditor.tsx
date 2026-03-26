import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ChatbotNode from '@/components/chatbot/ChatbotNode';
import ChatbotEdge from '@/components/chatbot/ChatbotEdgeLabel';
import NodeConfigPanel from '@/components/chatbot/NodeConfigPanel';
import EdgeConfigModal from '@/components/chatbot/EdgeConfigModal';

const nodeTypes = { chatbotNode: ChatbotNode };
const edgeTypes = { chatbotEdge: ChatbotEdge };

interface LabelOption {
  id: string;
  name: string;
  color: string;
}

export default function ChatbotEditor() {
  const { flowId } = useParams<{ flowId: string }>();
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [flowName, setFlowName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [editingEdge, setEditingEdge] = useState<Edge | null>(null);
  const [labels, setLabels] = useState<LabelOption[]>([]);
  const [dbNodes, setDbNodes] = useState<any[]>([]);
  const [dbEdges, setDbEdges] = useState<any[]>([]);
  const [responseCounts, setResponseCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (flowId) loadFlow();
  }, [flowId]);

  const loadFlow = async () => {
    setLoading(true);

    const [flowRes, nodesRes, edgesRes, labelsRes] = await Promise.all([
      supabase.from('chatbot_flows').select('*').eq('id', flowId!).single(),
      supabase.from('chatbot_nodes').select('*').eq('flow_id', flowId!),
      supabase.from('chatbot_edges').select('*').eq('flow_id', flowId!),
      supabase.from('labels').select('id, name, color'),
    ]);

    if (flowRes.data) setFlowName(flowRes.data.name);
    if (labelsRes.data) setLabels(labelsRes.data);

    const rawNodes = nodesRes.data || [];
    const rawEdges = edgesRes.data || [];
    setDbNodes(rawNodes);
    setDbEdges(rawEdges);

    // Load response counts
    if (rawNodes.length > 0) {
      const { data: respData } = await supabase
        .from('chatbot_node_responses')
        .select('node_id')
        .in('node_id', rawNodes.map(n => n.id));
      const counts: Record<string, number> = {};
      (respData || []).forEach(r => { counts[r.node_id] = (counts[r.node_id] || 0) + 1; });
      setResponseCounts(counts);
    }

    // Map to ReactFlow format
    const labelMap = new Map((labelsRes.data || []).map(l => [l.id, l]));

    const rfNodes: Node[] = rawNodes.map(n => ({
      id: n.id,
      type: 'chatbotNode',
      position: { x: n.position_x, y: n.position_y },
      data: {
        name: n.name,
        type: n.type,
        responsesCount: 0,
        labelName: n.label_id ? labelMap.get(n.label_id)?.name : undefined,
        labelColor: n.label_id ? labelMap.get(n.label_id)?.color : undefined,
        absenceTimeout: n.absence_timeout_minutes,
      },
    }));

    const rfEdges: Edge[] = rawEdges.map(e => ({
      id: e.id,
      source: e.source_node_id,
      target: e.target_node_id,
      type: 'chatbotEdge',
      data: { keywords: e.keywords, matchType: e.match_type },
      animated: true,
      style: { stroke: 'hsl(var(--primary))' },
    }));

    setNodes(rfNodes);
    setEdges(rfEdges);
    setLoading(false);
  };

  // Update response counts in node data
  useEffect(() => {
    if (Object.keys(responseCounts).length > 0) {
      setNodes(nds =>
        nds.map(n => ({
          ...n,
          data: { ...n.data, responsesCount: responseCounts[n.id] || 0 },
        }))
      );
    }
  }, [responseCounts]);

  const onConnect = useCallback(async (connection: Connection) => {
    if (!flowId) return;
    // Save edge to DB
    const { data, error } = await supabase.from('chatbot_edges').insert({
      flow_id: flowId,
      source_node_id: connection.source,
      target_node_id: connection.target,
      keywords: [],
      match_type: 'contains',
    }).select().single();

    if (data) {
      const newEdge: Edge = {
        id: data.id,
        source: connection.source!,
        target: connection.target!,
        type: 'chatbotEdge',
        data: { keywords: [], matchType: 'contains' },
        animated: true,
        style: { stroke: 'hsl(var(--primary))' },
      };
      setEdges(eds => addEdge(newEdge, eds));
      // Open config modal right away
      setEditingEdge(newEdge);
    }
    if (error) toast.error('Erro ao conectar nós');
  }, [flowId, setEdges]);

  const addNode = async () => {
    if (!flowId) return;
    const { data, error } = await supabase.from('chatbot_nodes').insert({
      flow_id: flowId,
      type: 'response',
      name: 'Novo nó',
      position_x: 250 + Math.random() * 100,
      position_y: 200 + nodes.length * 120,
    }).select().single();

    if (data) {
      const newNode: Node = {
        id: data.id,
        type: 'chatbotNode',
        position: { x: data.position_x, y: data.position_y },
        data: { name: data.name, type: data.type, responsesCount: 0 },
      };
      setNodes(nds => [...nds, newNode]);
    }
    if (error) toast.error('Erro ao criar nó');
  };

  const savePositions = async () => {
    setSaving(true);
    const updates = nodes.map(n =>
      supabase.from('chatbot_nodes')
        .update({ position_x: n.position.x, position_y: n.position.y })
        .eq('id', n.id)
    );
    await Promise.all(updates);
    setSaving(false);
    toast.success('Posições salvas');
  };

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node.id);
  }, []);

  const onEdgeClick = useCallback((_: any, edge: Edge) => {
    setEditingEdge(edge);
  }, []);

  const handleNodeUpdate = async (data: any) => {
    if (!selectedNode) return;
    await supabase.from('chatbot_nodes').update(data).eq('id', selectedNode);

    const labelMap = new Map(labels.map(l => [l.id, l]));
    setNodes(nds =>
      nds.map(n => {
        if (n.id !== selectedNode) return n;
        const updated = { ...n.data };
        if (data.name !== undefined) updated.name = data.name;
        if (data.absence_timeout_minutes !== undefined) updated.absenceTimeout = data.absence_timeout_minutes;
        if (data.label_id !== undefined) {
          if (data.label_id) {
            const lbl = labelMap.get(data.label_id);
            updated.labelName = lbl?.name;
            updated.labelColor = lbl?.color;
          } else {
            updated.labelName = undefined;
            updated.labelColor = undefined;
          }
        }
        return { ...n, data: updated };
      })
    );
  };

  const handleEdgeSave = async (keywords: string[], matchType: string) => {
    if (!editingEdge) return;
    await supabase.from('chatbot_edges')
      .update({ keywords, match_type: matchType })
      .eq('id', editingEdge.id);

    setEdges(eds =>
      eds.map(e => e.id === editingEdge.id ? { ...e, data: { ...e.data, keywords, matchType } } : e)
    );
    setEditingEdge(null);
  };

  const onNodesDelete = useCallback(async (deleted: Node[]) => {
    for (const n of deleted) {
      await supabase.from('chatbot_nodes').delete().eq('id', n.id);
    }
    if (selectedNode && deleted.some(n => n.id === selectedNode)) {
      setSelectedNode(null);
    }
  }, [selectedNode]);

  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    for (const e of deleted) {
      await supabase.from('chatbot_edges').delete().eq('id', e.id);
    }
  }, []);

  const selectedNodeData = nodes.find(n => n.id === selectedNode);
  const selectedDbNode = dbNodes.find(n => n.id === selectedNode);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-card/50 z-10">
        <Button size="icon" variant="ghost" onClick={() => navigate('/chatbot')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="font-semibold text-foreground text-sm">{flowName}</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={addNode}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nó
          </Button>
          <Button size="sm" onClick={savePositions} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Flow canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          deleteKeyCode="Delete"
          className="bg-background"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--muted-foreground) / 0.15)" />
          <Controls className="!bg-card !border-border !rounded-lg !shadow-lg" />
          <MiniMap
            className="!bg-card !border-border !rounded-lg"
            nodeColor="hsl(var(--primary))"
            maskColor="hsl(var(--background) / 0.8)"
          />
        </ReactFlow>

        {/* Node config panel */}
        {selectedNode && selectedDbNode && (
          <NodeConfigPanel
            nodeId={selectedNode}
            nodeName={selectedNodeData?.data?.name as string || ''}
            nodeType={selectedDbNode.type}
            absenceMessage={selectedDbNode.absence_message || ''}
            absenceTimeout={selectedDbNode.absence_timeout_minutes || 0}
            labelId={selectedDbNode.label_id}
            labels={labels}
            onClose={() => setSelectedNode(null)}
            onUpdate={handleNodeUpdate}
          />
        )}
      </div>

      {/* Edge config modal */}
      {editingEdge && (
        <EdgeConfigModal
          open={!!editingEdge}
          keywords={(editingEdge.data as any)?.keywords || []}
          matchType={(editingEdge.data as any)?.matchType || 'contains'}
          onSave={handleEdgeSave}
          onClose={() => setEditingEdge(null)}
        />
      )}
    </div>
  );
}
