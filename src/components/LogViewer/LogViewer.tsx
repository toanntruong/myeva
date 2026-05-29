import { useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/taskStore';
import { useLogBuffer } from './useLogBuffer';

export default function LogViewer() {
  const activeTaskId = useTaskStore((state) => state.activeTaskId);
  const activeTask = useTaskStore((state) => state.tasks.find((task) => task.id === activeTaskId));
  const lines = useLogBuffer(activeTaskId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length, activeTaskId]);

  return (
    <aside className="flex h-full flex-col border-l border-gray-800 bg-black">
      <div className="border-b border-gray-800 bg-gray-950 px-4 py-3">
        <div className="text-xs font-bold uppercase tracking-widest text-gray-500">Single Log Panel</div>
        <div className="mt-1 truncate text-sm text-gray-200">{activeTask?.title ?? 'Chọn một node để xem log'}</div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-6 text-gray-300">
        {!activeTaskId && <div className="p-4 text-gray-600">Click vào node trên graph hoặc task bên trái để switch context log.</div>}
        {activeTaskId && lines.length === 0 && <div className="p-4 text-gray-600">Chưa có log cho task này.</div>}
        {lines.map((line, index) => (
          <div key={`${index}-${line}`} className="whitespace-pre-wrap break-words">{line}</div>
        ))}
        <div ref={bottomRef} />
      </div>
    </aside>
  );
}
