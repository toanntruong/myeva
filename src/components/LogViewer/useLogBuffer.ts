import { useMemo } from 'react';
import { useLogStore } from '../../store/logStore';

export function useLogBuffer(taskId: string | null) {
  const logs = useLogStore((state) => state.logs);
  return useMemo(() => (taskId ? logs[taskId] ?? [] : []), [logs, taskId]);
}
