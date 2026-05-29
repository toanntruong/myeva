import { create } from 'zustand';
import type { EdgeRecord, Task, TaskStatus } from '../types';

interface TaskStore {
  tasks: Task[];
  edges: EdgeRecord[];
  activeTaskId: string | null;
  setTasks: (tasks: Task[]) => void;
  setEdges: (edges: EdgeRecord[]) => void;
  addTask: (task: Task) => void;
  setActiveTask: (taskId: string | null) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus, exitCode: number | null) => void;
  updateTaskPosition: (taskId: string, x: number, y: number) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  edges: [],
  activeTaskId: null,
  setTasks: (tasks) => set({ tasks }),
  setEdges: (edges) => set({ edges }),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks.filter((t) => t.id !== task.id), task] })),
  setActiveTask: (taskId) => set({ activeTaskId: taskId }),
  updateTaskStatus: (taskId, status, exitCode) => set((state) => ({
    tasks: state.tasks.map((task) => task.id === taskId ? { ...task, status, exit_code: exitCode } : task),
  })),
  updateTaskPosition: (taskId, x, y) => set((state) => ({
    tasks: state.tasks.map((task) => task.id === taskId ? { ...task, pos_x: x, pos_y: y } : task),
  })),
}));
