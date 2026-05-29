import type { Edge, Node } from '@xyflow/react';
import type { EdgeRecord, Task } from '../../types';

export function buildGraphNodes(tasks: Task[]): Node[] {
  return tasks.map((task) => ({
    id: task.id,
    type: 'agentNode',
    position: { x: task.pos_x ?? 0, y: task.pos_y ?? 0 },
    data: { task },
  }));
}

export function buildGraphEdges(edges: EdgeRecord[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source_id,
    target: edge.target_id,
    animated: true,
    style: { stroke: '#64748b', strokeWidth: 2 },
  }));
}
