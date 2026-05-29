import { useEffect, useState } from 'react';
import TaskNode from './TaskNode';
import { useTaskStore } from '../../store/taskStore';

export default function TaskTree() {
  const tasks = useTaskStore((state) => state.tasks);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const rootTasks = tasks.filter((task) => !task.parent_id);

  useEffect(() => {
    setExpanded(Object.fromEntries(tasks.map((task) => [task.id, localStorage.getItem(`myeva-expanded-${task.id}`) !== 'false'])));
    const refresh = () => setExpanded(Object.fromEntries(tasks.map((task) => [task.id, localStorage.getItem(`myeva-expanded-${task.id}`) !== 'false'])));
    window.addEventListener('myeva-tree-toggle', refresh);
    return () => window.removeEventListener('myeva-tree-toggle', refresh);
  }, [tasks]);

  const toggle = (taskId: string) => {
    setExpanded((state) => {
      const next = { ...state, [taskId]: !state[taskId] };
      localStorage.setItem(`myeva-expanded-${taskId}`, JSON.stringify(next[taskId]));
      return next;
    });
  };

  return (
    <aside className="h-full overflow-auto border-r border-gray-800 bg-gray-950 p-3">
      <div className="mb-3 px-2 text-xs font-bold uppercase tracking-widest text-gray-500">Task Tree</div>
      {rootTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-800 p-4 text-sm text-gray-500">Chưa có task. Hãy nhập prompt ở ô Layer 1.</div>
      ) : rootTasks.map((task) => (
        <TaskNode
          key={task.id}
          task={task}
          allTasks={tasks}
          expanded={expanded}
          onToggle={toggle}
          depth={0}
        />
      ))}
    </aside>
  );
}
