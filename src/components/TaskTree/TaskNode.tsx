import { ChevronRight, Copy, Square, Terminal } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { Task } from '../../types';
import { useTaskStore } from '../../store/taskStore';

interface TaskNodeProps {
  task: Task;
  allTasks: Task[];
  expanded: Record<string, boolean>;
  onToggle: (taskId: string) => void;
  depth: number;
}

export default function TaskNode({ task, allTasks, expanded, onToggle, depth }: TaskNodeProps) {
  const setActiveTask = useTaskStore((state) => state.setActiveTask);
  const childrenTasks = allTasks.filter((item) => item.parent_id === task.id);
  const hasChildren = childrenTasks.length > 0;

  const killTask = async () => {
    try { await invoke('kill_task', { taskId: task.id }); } catch (error) { console.error(error); }
  };

  const copyCommand = async () => {
    await navigator.clipboard.writeText(task.command);
  };

  return (
    <div>
      <div
        className="group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm text-gray-200 hover:bg-gray-800"
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => setActiveTask(task.id)}
      >
        <button
          className="flex h-4 w-4 items-center justify-center text-gray-400"
          onClick={(event) => { event.stopPropagation(); if (hasChildren) onToggle(task.id); }}
          aria-label={expanded[task.id] ? 'Collapse task' : 'Expand task'}
        >
          {hasChildren && <ChevronRight size={14} className={expanded[task.id] ? 'rotate-90 transition-transform' : 'transition-transform'} />}
        </button>
        <Terminal size={14} className={task.status === 'running' ? 'text-green-400' : 'text-gray-500'} />
        <span className="min-w-0 flex-1 truncate">{task.title}</span>
        <span className={task.status === 'running' ? 'text-green-400' : 'text-gray-500'}>●</span>
        <button className="hidden text-gray-400 hover:text-red-300 group-hover:block" onClick={(e) => { e.stopPropagation(); void killTask(); }} title="Kill Process">
          <Square size={12} />
        </button>
        <button className="hidden text-gray-400 hover:text-blue-300 group-hover:block" onClick={(e) => { e.stopPropagation(); void copyCommand(); }} title="Copy Command">
          <Copy size={12} />
        </button>
      </div>
      {expanded[task.id] && childrenTasks.map((child) => (
        <TaskNode key={child.id} task={child} allTasks={allTasks} expanded={expanded} onToggle={onToggle} depth={depth + 1} />
      ))}
    </div>
  );
}
