import { invoke } from '@tauri-apps/api/core';

export function useProcess() {
  return {
    spawnTask: (taskId: string) => invoke<void>('spawn_task', { taskId }),
    killTask: (taskId: string) => invoke<void>('kill_task', { taskId }),
  };
}
