import { useCallback, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import AgentNode from './AgentNode';
import { buildGraphEdges, buildGraphNodes } from './graphUtils';
import { useTaskStore } from '../../store/taskStore';

const nodeTypes = { agentNode: AgentNode };

function GraphCanvasInner() {
  const tasks = useTaskStore((state) => state.tasks);
  const edges = useTaskStore((state) => state.edges);
  const activeTaskId = useTaskStore((state) => state.activeTaskId);
  const setActiveTask = useTaskStore((state) => state.setActiveTask);
  const updateTaskPosition = useTaskStore((state) => state.updateTaskPosition);
  const reactFlow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);

  const computedNodes = useMemo(() => buildGraphNodes(tasks), [tasks]);
  const computedEdges = useMemo(() => buildGraphEdges(edges), [edges]);

  useEffect(() => setNodes(computedNodes), [computedNodes, setNodes]);
  useEffect(() => setRfEdges(computedEdges), [computedEdges, setRfEdges]);

  useEffect(() => {
    if (!activeTaskId) return;
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === activeTaskId })));
    const node = reactFlow.getNode(activeTaskId);
    if (node) reactFlow.setCenter(node.position.x + 100, node.position.y + 40, { zoom: 1, duration: 500 });
  }, [activeTaskId, reactFlow, setNodes]);

  const onNodeDragStop = useCallback((_event: unknown, node: Node) => {
    updateTaskPosition(node.id, node.position.x, node.position.y);
    invoke('update_node_position', { taskId: node.id, x: node.position.x, y: node.position.y }).catch(console.error);
  }, [updateTaskPosition]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => setActiveTask(node.id)}
      onNodeDragStop={onNodeDragStop}
      fitView
      className="bg-gray-950"
    >
      <Background color="#334155" gap={20} />
      <Controls className="!bg-gray-900 !text-gray-100" />
    </ReactFlow>
  );
}

export default function GraphCanvas() {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner />
    </ReactFlowProvider>
  );
}
