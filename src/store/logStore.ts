import { create } from 'zustand';
import type { LogLinePayload } from '../types';

const MAX_LINES_PER_TASK = 2_000;

interface LogStore {
  logs: Record<string, string[]>;
  appendLog: (payload: LogLinePayload) => void;
  clearLogs: (taskId: string) => void;
}

export const useLogStore = create<LogStore>((set) => ({
  logs: {},
  appendLog: ({ task_id, stream, line }) => set((state) => {
    const prefix = stream === 'stderr' ? '[err] ' : '';
    const next = [...(state.logs[task_id] ?? []), `${prefix}${line}`].slice(-MAX_LINES_PER_TASK);
    return { logs: { ...state.logs, [task_id]: next } };
  }),
  clearLogs: (taskId) => set((state) => ({ logs: { ...state.logs, [taskId]: [] } })),
}));
