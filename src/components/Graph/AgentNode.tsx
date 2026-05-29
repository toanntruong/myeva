import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Task, TaskStatus } from '../../types';

const statusColor: Record<TaskStatus, string> = {
  pending: '#6b7280',
  running: '#22c55e',
  stopped: '#4b5563',
};

function AgentNode({ data, selected }: NodeProps) {
  const task = data.task as Task;
  const color = statusColor[task.status];

  return (
    <div
      className="min-w-48 rounded-xl border-2 px-4 py-3 text-gray-100 shadow-2xl transition-all"
      style={{
        borderColor: selected ? '#60a5fa' : color,
        background: task.status === 'running' ? '#052e16' : '#111827',
        boxShadow: task.status === 'running' ? '0 0 24px rgba(34,197,94,0.25)' : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="rounded bg-gray-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-300">
          {task.cli_type}
        </span>
        {task.exit_code !== null && <span className="text-[10px] text-gray-400">exit {task.exit_code}</span>}
      </div>
      <div className="line-clamp-2 text-sm font-semibold leading-snug">{task.title}</div>
      <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color }}>
        <span>●</span>
        <span className="capitalize">{task.status}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
    </div>
  );
}

export default memo(AgentNode);
