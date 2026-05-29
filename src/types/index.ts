export type TaskStatus = 'pending' | 'running' | 'stopped';
export type CliType = 'codex' | 'claude';

export interface Task {
  id: string;
  parent_id: string | null;
  title: string;
  cli_type: CliType;
  command: string;
  status: TaskStatus;
  exit_code: number | null;
  created_at: string;
  updated_at: string;
  pos_x: number;
  pos_y: number;
}

export interface EdgeRecord {
  id: string;
  source_id: string;
  target_id: string;
}

export interface LogLinePayload {
  task_id: string;
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface ProcessStoppedPayload {
  task_id: string;
  exit_code: number | null;
}
