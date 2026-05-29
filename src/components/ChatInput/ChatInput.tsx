import { FormEvent, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Send } from 'lucide-react';
import type { CliType, Task } from '../../types';
import { useTaskStore } from '../../store/taskStore';

export default function ChatInput() {
  const tasks = useTaskStore((state) => state.tasks);
  const addTask = useTaskStore((state) => state.addTask);
  const setActiveTask = useTaskStore((state) => state.setActiveTask);
  const setTasks = useTaskStore((state) => state.setTasks);
  const setEdges = useTaskStore((state) => state.setEdges);
  const [prompt, setPrompt] = useState('');
  const [cliType, setCliType] = useState<CliType>('codex');
  const [parentId, setParentId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => prompt.trim().length > 0 && !isSubmitting, [prompt, isSubmitting]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const task = await invoke<Task>('create_task', {
        input: { parent_id: parentId || null, title: '', cli_type: cliType, prompt },
      });
      addTask(task);
      setActiveTask(task.id);
      setPrompt('');
      await invoke('spawn_task', { taskId: task.id });
      const [nextTasks, nextEdges] = await Promise.all([
        invoke<Task[]>('get_all_tasks'),
        invoke<Array<{ id: string; source_id: string; target_id: string }>>('get_all_edges'),
      ]);
      setTasks(nextTasks);
      setEdges(nextEdges);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-t border-gray-800 bg-gray-900 p-3">
      <div className="mb-2 flex gap-2">
        <select className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-sm text-gray-100" value={cliType} onChange={(event) => setCliType(event.target.value as CliType)}>
          <option value="codex">codex</option>
          <option value="claude">claude</option>
        </select>
        <select className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-sm text-gray-100" value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">Không có parent</option>
          {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <textarea
          className="min-h-20 flex-1 resize-none rounded-lg border border-gray-700 bg-gray-950 p-3 text-sm text-gray-100 outline-none ring-blue-500 focus:ring-2"
          placeholder="Nhập yêu cầu vĩ mô cho Layer 1..."
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <button type="submit" disabled={!canSubmit} className="flex w-28 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-700">
          <Send size={16} />
          {isSubmitting ? '...' : 'Send'}
        </button>
      </div>
      {error && <div className="mt-2 rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-200">{error}</div>}
    </form>
  );
}
