import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import GraphCanvas from './components/Graph/GraphCanvas';
import LogViewer from './components/LogViewer/LogViewer';
import TaskTree from './components/TaskTree/TaskTree';
import ChatInput from './components/ChatInput/ChatInput';
import { useTauriEvents } from './hooks/useTauriEvents';
import { useTaskStore } from './store/taskStore';
import type { EdgeRecord, Task } from './types';

export default function App() {
  useTauriEvents();
  const setTasks = useTaskStore((state) => state.setTasks);
  const setEdges = useTaskStore((state) => state.setEdges);
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(360);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([invoke<Task[]>('get_all_tasks'), invoke<EdgeRecord[]>('get_all_edges')])
      .then(([tasks, edges]) => {
        setTasks(tasks);
        setEdges(edges);
      })
      .catch((error) => setBootError(error instanceof Error ? error.message : String(error)));
  }, [setEdges, setTasks]);

  const startResize = (side: 'left' | 'right') => (event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startLeft = leftWidth;
    const startRight = rightWidth;
    const move = (moveEvent: MouseEvent) => {
      if (side === 'left') setLeftWidth(Math.min(420, Math.max(220, startLeft + moveEvent.clientX - startX)));
      else setRightWidth(Math.min(520, Math.max(280, startRight - (moveEvent.clientX - startX))));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-gray-950 text-gray-100">
      <div style={{ width: leftWidth }} className="shrink-0"><TaskTree /></div>
      <div className="w-1 cursor-col-resize bg-gray-800 hover:bg-blue-500" onMouseDown={startResize('left')} />
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between border-b border-gray-800 bg-gray-900 px-4">
          <div>
            <h1 className="text-sm font-bold tracking-wide">MyEva</h1>
            <p className="text-xs text-gray-500">Desktop Task & Multi-Agent Management Tool</p>
          </div>
          {bootError && <div className="rounded bg-red-950 px-3 py-1 text-xs text-red-200">{bootError}</div>}
        </header>
        <div className="min-h-0 flex-1"><GraphCanvas /></div>
        <ChatInput />
      </section>
      <div className="w-1 cursor-col-resize bg-gray-800 hover:bg-blue-500" onMouseDown={startResize('right')} />
      <div style={{ width: rightWidth }} className="shrink-0"><LogViewer /></div>
    </main>
  );
}
