import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLogStore } from '../store/logStore';
import { useTaskStore } from '../store/taskStore';
import type { LogLinePayload, ProcessStoppedPayload } from '../types';

export function useTauriEvents() {
  const appendLog = useLogStore((state) => state.appendLog);
  const updateTaskStatus = useTaskStore((state) => state.updateTaskStatus);

  useEffect(() => {
    let cleanup = true;
    const unlisteners: Array<() => void> = [];

    listen<LogLinePayload>('log-line', (event) => appendLog(event.payload)).then((unlisten) => {
      if (cleanup) unlisteners.push(unlisten); else unlisten();
    });

    listen<ProcessStoppedPayload>('process-stopped', (event) => {
      updateTaskStatus(event.payload.task_id, 'stopped', event.payload.exit_code);
    }).then((unlisten) => {
      if (cleanup) unlisteners.push(unlisten); else unlisten();
    });

    return () => {
      cleanup = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [appendLog, updateTaskStatus]);
}
