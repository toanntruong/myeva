# TÀI LIỆU KỸ THUẬT
## MyEva - Desktop Task & Multi-Agent Management Tool

---

## 1. Stack Công nghệ

| Layer | Công nghệ | Phiên bản đề xuất |
|---|---|---|
| Desktop Framework | Tauri 2 | 2.x |
| Frontend | React + TypeScript | React 18 |
| UI Styling | Tailwind CSS | 3.x |
| Visual Graph | React Flow | 11.x |
| Backend Runtime | Rust + Tokio (async) | Tokio 1.x |
| Database | SQLite via sqlx | sqlx 0.7 |
| Process Execution | Rust std::process + tokio::process | — |
| Audio Recording | crate `cpal` + `hound` | — |
| HTTP Client (Rust) | crate `reqwest` (async, multipart) | 0.12.x |

---

## 2. Kiến trúc Tổng thể

```
┌─────────────────────────────────────────────────────────────┐
│                    TAURI APPLICATION                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              FRONTEND (React + TypeScript)           │   │
│  │                                                     │   │
│  │  [Left Panel]   [Center Panel]    [Right Panel]     │   │
│  │  Task Tree      React Flow Graph  Log Viewer        │   │
│  │                                                     │   │
│  │  [Bottom: ChatInput + VoiceToggle + MemoryButton]   │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │ Tauri Commands / Events               │
│  ┌──────────────────▼──────────────────────────────────┐   │
│  │              BACKEND (Rust + Tokio)                  │   │
│  │                                                     │   │
│  │  ProcessManager   LogStreamer   SQLiteStore          │   │
│  │  MemoryReader     AudioRecorder  STTClient           │   │
│  │       │               │              │              │   │
│  │       └───────────────┴──────────────┘              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Child Process: claude CLI]   [Child Process: codex CLI]   │
└─────────────────────────────────────────────────────────────┘
                                        │
                              (HTTP POST multipart)
                                        │
                              [Self-hosted STT Server]
                              (CPU-only, public domain)
```

---

## 3. Cấu trúc Thư mục Dự án

```
myeva/
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── main.rs             # Entry point, Tauri builder
│   │   ├── commands/           # Tauri command handlers
│   │   │   ├── mod.rs
│   │   │   ├── task.rs         # CRUD task commands
│   │   │   ├── process.rs      # Spawn/kill process commands
│   │   │   ├── memory.rs       # read_memory_file, open_memory_file
│   │   │   └── voice.rs        # start_recording, stop_recording, send_audio_to_stt
│   │   ├── process/
│   │   │   ├── mod.rs
│   │   │   ├── manager.rs      # ProcessManager: spawn, track, kill
│   │   │   └── streamer.rs     # Pipe stdout/stderr → Tauri events
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── store.rs        # SQLite queries via sqlx
│   │   │   └── models.rs       # Rust structs: Task, NodePosition, Edge
│   │   ├── voice/
│   │   │   ├── mod.rs
│   │   │   └── recorder.rs     # cpal + hound: ghi âm WAV vào buffer/file tạm
│   │   └── state.rs            # AppState (Mutex-wrapped shared state)
│   ├── migrations/             # SQLite migration files
│   │   └── 001_init.sql
│   └── Cargo.toml
│
├── src/                        # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── TaskTree/           # Left Panel
│   │   │   ├── TaskTree.tsx
│   │   │   └── TaskNode.tsx
│   │   ├── Graph/              # Center Panel
│   │   │   ├── GraphCanvas.tsx
│   │   │   ├── AgentNode.tsx   # Custom React Flow node
│   │   │   └── graphUtils.ts
│   │   ├── LogViewer/          # Right Panel
│   │   │   ├── LogViewer.tsx
│   │   │   └── useLogBuffer.ts
│   │   └── Chat/               # Bottom: Layer 1 input area
│   │       ├── ChatInput.tsx
│   │       └── VoiceToggle.tsx
│   ├── store/                  # Zustand global state
│   │   ├── taskStore.ts
│   │   ├── processStore.ts
│   │   ├── logStore.ts
│   │   └── chatStore.ts        # Layer 1 conversation history + voice state
│   ├── hooks/
│   │   ├── useTauriEvents.ts   # Subscribe Tauri events
│   │   └── useProcess.ts
│   └── types/
│       └── index.ts            # Shared TypeScript types
│
├── memory.md                   # File memory tĩnh, user tự edit
├── package.json
└── tauri.conf.json
```

---

## 4. Database Schema (SQLite)

```sql
-- 001_init.sql

CREATE TABLE tasks (
    id          TEXT PRIMARY KEY,       -- UUID
    parent_id   TEXT,                   -- NULL nếu là root task
    title       TEXT NOT NULL,
    cli_type    TEXT NOT NULL,          -- 'claude' | 'codex'
    command     TEXT NOT NULL,          -- full CLI command string
    status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'running' | 'stopped'
    exit_code   INTEGER,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE node_positions (
    task_id     TEXT PRIMARY KEY REFERENCES tasks(id),
    pos_x       REAL NOT NULL DEFAULT 0,
    pos_y       REAL NOT NULL DEFAULT 0
);

CREATE TABLE edges (
    id          TEXT PRIMARY KEY,       -- UUID
    source_id   TEXT NOT NULL REFERENCES tasks(id),
    target_id   TEXT NOT NULL REFERENCES tasks(id)
);
```

---

## 5. Rust Backend

### 5.1. AppState

```rust
// state.rs
use std::collections::HashMap;
use tokio::sync::Mutex;
use tokio::process::Child;

pub struct ProcessEntry {
    pub task_id: String,
    pub child: Child,
}

pub struct AppState {
    pub processes: Mutex<HashMap<String, ProcessEntry>>,
    pub db: sqlx::SqlitePool,
}
```

### 5.2. ProcessManager – Spawn Layer 2

```rust
// process/manager.rs
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader};
use tauri::AppHandle;

pub async fn spawn_agent(
    app: AppHandle,
    task_id: String,
    cli_type: &str,   // "claude" | "codex"
    prompt: &str,
    state: &AppState,
) -> Result<(), String> {
    let mut cmd = match cli_type {
        "claude" => {
            let mut c = Command::new("claude");
            c.arg("--print").arg(prompt);
            c
        }
        "codex" => {
            let mut c = Command::new("codex");
            c.arg("--quiet").arg(prompt);
            c
        }
        _ => return Err("Unknown CLI type".into()),
    };

    cmd.stdout(std::process::Stdio::piped())
       .stderr(std::process::Stdio::piped())
       .creation_flags(0x08000000); // CREATE_NO_WINDOW trên Windows

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    // Stream stdout
    let stdout = child.stdout.take().unwrap();
    let app_clone = app.clone();
    let tid = task_id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            app_clone.emit_all("log-line", LogEvent {
                task_id: tid.clone(),
                stream: "stdout".into(),
                line,
            }).ok();
        }
    });

    // Stream stderr
    let stderr = child.stderr.take().unwrap();
    let app_clone2 = app.clone();
    let tid2 = task_id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            app_clone2.emit_all("log-line", LogEvent {
                task_id: tid2.clone(),
                stream: "stderr".into(),
                line,
            }).ok();
        }
    });

    // Watch exit
    let app_exit = app.clone();
    let tid_exit = task_id.clone();
    tokio::spawn(async move {
        let status = child.wait().await;
        let exit_code = status.ok().and_then(|s| s.code()).unwrap_or(-1);
        app_exit.emit_all("process-stopped", ProcessStoppedEvent {
            task_id: tid_exit,
            exit_code,
        }).ok();
    });

    state.processes.lock().await.insert(task_id, ProcessEntry { task_id: task_id.clone(), child });

    Ok(())
}
```

### 5.3. Tauri Commands — Process

```rust
// commands/process.rs

#[tauri::command]
pub async fn spawn_task(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    task_id: String,
    cli_type: String,
    prompt: String,
) -> Result<(), String> {
    sqlx::query("UPDATE tasks SET status = 'running' WHERE id = ?")
        .bind(&task_id)
        .execute(&state.db).await.map_err(|e| e.to_string())?;

    spawn_agent(app, task_id, &cli_type, &prompt, &state).await
}

#[tauri::command]
pub async fn kill_task(
    state: tauri::State<'_, AppState>,
    task_id: String,
) -> Result<(), String> {
    let mut procs = state.processes.lock().await;
    if let Some(entry) = procs.get_mut(&task_id) {
        entry.child.kill().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_all_tasks(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Task>, String> {
    sqlx::query_as::<_, Task>("SELECT * FROM tasks ORDER BY created_at ASC")
        .fetch_all(&state.db).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_node_position(
    state: tauri::State<'_, AppState>,
    task_id: String,
    x: f64,
    y: f64,
) -> Result<(), String> {
    sqlx::query(
        "INSERT OR REPLACE INTO node_positions (task_id, pos_x, pos_y) VALUES (?, ?, ?)"
    )
    .bind(&task_id).bind(x).bind(y)
    .execute(&state.db).await.map_err(|e| e.to_string())
}
```

---

## 6. Frontend (React + TypeScript)

### 6.1. TypeScript Types

```typescript
// types/index.ts

export type CliType = 'claude' | 'codex';
export type TaskStatus = 'pending' | 'running' | 'stopped';
export type VoiceState = 'idle' | 'recording' | 'processing';

export interface Task {
  id: string;
  parent_id: string | null;
  title: string;
  cli_type: CliType;
  command: string;
  status: TaskStatus;
  exit_code: number | null;
  created_at: string;
}

export interface NodePosition {
  task_id: string;
  pos_x: number;
  pos_y: number;
}

export interface LogLine {
  task_id: string;
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface ProcessStoppedEvent {
  task_id: string;
  exit_code: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}
```

### 6.2. Zustand Stores

```typescript
// store/processStore.ts
import { create } from 'zustand';
import { Task } from '../types';

interface ProcessStore {
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  updateTaskStatus: (task_id: string, status: Task['status'], exit_code?: number) => void;
}

export const useProcessStore = create<ProcessStore>((set) => ({
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  updateTaskStatus: (task_id, status, exit_code) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === task_id ? { ...t, status, exit_code: exit_code ?? t.exit_code } : t
      ),
    })),
}));
```

```typescript
// store/logStore.ts
import { create } from 'zustand';

const MAX_LINES = 2000;

interface LogStore {
  logs: Record<string, string[]>;   // task_id → lines[]
  activeTaskId: string | null;
  appendLog: (task_id: string, line: string) => void;
  setActiveTask: (task_id: string) => void;
}

export const useLogStore = create<LogStore>((set) => ({
  logs: {},
  activeTaskId: null,
  appendLog: (task_id, line) =>
    set((s) => {
      const prev = s.logs[task_id] ?? [];
      const next = prev.length >= MAX_LINES ? [...prev.slice(-MAX_LINES + 1), line] : [...prev, line];
      return { logs: { ...s.logs, [task_id]: next } };
    }),
  setActiveTask: (task_id) => set({ activeTaskId: task_id }),
}));
```

```typescript
// store/chatStore.ts
import { create } from 'zustand';
import { Message, VoiceState } from '../types';

interface ChatStore {
  messages: Message[];
  voiceState: VoiceState;
  appendMessage: (msg: Message) => void;
  clearHistory: () => void;
  setVoiceState: (state: VoiceState) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  voiceState: 'idle',
  appendMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),
  clearHistory: () => set({ messages: [] }),
  setVoiceState: (voiceState) => set({ voiceState }),
}));
```

### 6.3. Tauri Event Listener

```typescript
// hooks/useTauriEvents.ts
import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useProcessStore } from '../store/processStore';
import { useLogStore } from '../store/logStore';
import type { LogLine, ProcessStoppedEvent } from '../types';

export function useTauriEvents() {
  const { updateTaskStatus } = useProcessStore();
  const { appendLog } = useLogStore();

  useEffect(() => {
    const unlistenLog = listen<LogLine>('log-line', (e) => {
      appendLog(e.payload.task_id, e.payload.line);
    });

    const unlistenStop = listen<ProcessStoppedEvent>('process-stopped', (e) => {
      updateTaskStatus(e.payload.task_id, 'stopped', e.payload.exit_code);
    });

    return () => {
      unlistenLog.then((f) => f());
      unlistenStop.then((f) => f());
    };
  }, []);
}
```

### 6.4. Graph Canvas (React Flow)

```typescript
// components/Graph/GraphCanvas.tsx
import ReactFlow, {
  Node, Edge, useNodesState, useEdgesState, Background, Controls
} from 'reactflow';
import { invoke } from '@tauri-apps/api/tauri';
import AgentNode from './AgentNode';
import { useProcessStore } from '../../store/processStore';
import { useLogStore } from '../../store/logStore';

const nodeTypes = { agentNode: AgentNode };

export default function GraphCanvas() {
  const { tasks } = useProcessStore();
  const { setActiveTask } = useLogStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const rfNodes: Node[] = tasks.map((t) => ({
      id: t.id,
      type: 'agentNode',
      position: { x: t.pos_x ?? 0, y: t.pos_y ?? 0 },
      data: { task: t },
    }));
    setNodes(rfNodes);
  }, [tasks]);

  const onNodeDragStop = (_: any, node: Node) => {
    invoke('update_node_position', {
      taskId: node.id,
      x: node.position.x,
      y: node.position.y,
    });
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, node) => setActiveTask(node.id)}
      onNodeDragStop={onNodeDragStop}
      fitView
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
```

### 6.5. AgentNode Component

```typescript
// components/Graph/AgentNode.tsx
import { Handle, Position } from 'reactflow';
import type { Task } from '../../types';

const statusColor: Record<Task['status'], string> = {
  pending: '#6b7280',
  running: '#22c55e',
  stopped: '#374151',
};

export default function AgentNode({ data }: { data: { task: Task } }) {
  const { task } = data;
  return (
    <div style={{
      border: `2px solid ${statusColor[task.status]}`,
      borderRadius: 8,
      padding: '8px 16px',
      background: task.status === 'running' ? '#052e16' : '#111827',
      color: '#f3f4f6',
      minWidth: 160,
    }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontSize: 11, color: '#9ca3af' }}>{task.cli_type.toUpperCase()}</div>
      <div style={{ fontWeight: 600 }}>{task.title}</div>
      <div style={{ marginTop: 4, fontSize: 11, color: statusColor[task.status] }}>
        ● {task.status}
        {task.exit_code !== null && ` (exit: ${task.exit_code})`}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

### 6.6. Log Viewer

```typescript
// components/LogViewer/LogViewer.tsx
import { useEffect, useRef } from 'react';
import { useLogStore } from '../../store/logStore';

export default function LogViewer() {
  const { logs, activeTaskId } = useLogStore();
  const lines = activeTaskId ? (logs[activeTaskId] ?? []) : [];
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div style={{
      height: '100%',
      background: '#0a0a0a',
      color: '#d4d4d4',
      fontFamily: 'monospace',
      fontSize: 12,
      overflowY: 'auto',
      padding: 8,
    }}>
      {!activeTaskId && (
        <div style={{ color: '#4b5563', padding: 16 }}>
          Click vào một Node để xem log.
        </div>
      )}
      {lines.map((line, i) => (
        <div key={i} style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {line}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

---

## 7. Tauri Event Flow (Toàn cảnh)

```
User nhập prompt
      │
      ▼
React: invoke('spawn_task', { task_id, cli_type, prompt })
      │
      ▼
Rust: UPDATE tasks SET status='running'
Rust: tokio::spawn → Command::new("claude" / "codex")
      │
      ├── tokio::spawn → pipe stdout → emit('log-line', { task_id, line })
      ├── tokio::spawn → pipe stderr → emit('log-line', { task_id, line })
      └── tokio::spawn → child.wait() → emit('process-stopped', { task_id, exit_code })
                                                │
                                                ▼
                                  Rust: UPDATE tasks SET status='stopped'
                                                │
                                                ▼
                                  React: useTauriEvents → updateTaskStatus
                                  React: Node đổi màu → Stopped
```

---

## 8. Cấu hình Tauri (tauri.conf.json)

```json
{
  "tauri": {
    "windows": [{
      "title": "MyEva",
      "width": 1440,
      "height": 900,
      "minWidth": 1024,
      "minHeight": 600,
      "decorations": true,
      "transparent": false
    }],
    "allowlist": {
      "all": false,
      "event": { "all": true },
      "shell": { "all": false }
    }
  },
  "build": {
    "beforeBuildCommand": "npm run build",
    "devPath": "http://localhost:1420",
    "distDir": "../dist"
  }
}
```

---

## 9. Các rủi ro kỹ thuật & Giải pháp

| Rủi ro | Mô tả | Giải pháp |
|---|---|---|
| Windows process isolation | `CREATE_NO_WINDOW` cần flag đúng khi spawn | Dùng `creation_flags(0x08000000)` trong Rust Command |
| Log flood | CLI sinh log quá nhanh → UI lag | Giới hạn buffer 2000 dòng/task trong logStore |
| Process zombie | Child không thoát sạch khi app đóng | Implement `on_window_close` → kill all tracked processes |
| SQLite write contention | Nhiều process cập nhật đồng thời | sqlx pool size = 1 (SQLite single-writer) hoặc WAL mode |
| React Flow performance | Nhiều node re-render | Dùng `memo` trên AgentNode, update node data minimal |
| Git Bash path trên Windows | `claude`/`codex` không có trong PATH mặc định | Prepend Git Bash bin path khi spawn, hoặc yêu cầu user cấu hình PATH |
| memory.md path resolution | Thư mục gốc khác nhau tùy môi trường | Dùng `std::env::current_dir()` để resolve, document rõ cho user |
| Prompt Cache miss | Nội dung system block thay đổi giữa các request | Chỉ đọc file tại thời điểm submit, không transform nội dung trước khi inject |
| Microphone permission | Windows có thể block mic access | Tauri allowlist cần khai báo, hướng dẫn user grant permission lần đầu |
| WAV file tạm không xóa | Tích lũy file âm thanh trong `%TEMP%` | Xóa file tạm sau khi `send_audio_to_stt` hoàn thành (cả thành công lẫn lỗi) |
| STT server timeout | Server CPU-only xử lý chậm với file dài | Set `reqwest` timeout hợp lý (60s), hiển thị trạng thái processing rõ ràng |

---

## 10. Thứ tự Triển khai (Gợi ý)

1. **Scaffold** Tauri 2 + React + TypeScript + Tailwind
2. **SQLite** — migrations, sqlx pool, CRUD commands
3. **ProcessManager** — spawn 1 process, stream log, detect exit
4. **Tauri Events** — kết nối Rust emit → React listen
5. **Log Viewer** — hiển thị log từ 1 process
6. **React Flow Graph** — render nodes từ DB, đổi màu theo status
7. **Task Tree** — Left panel, CRUD
8. **Layer 1 Chat UI** — nhập prompt → invoke spawn_task
9. **Polish** — node drag-save, restore positions on startup, kill on close
10. **Memory Module** — read_memory_file, inject system block, Prompt Caching
11. **Voice Mode** — recording, STT HTTP POST, draft fill

---

## 11. Module Layer 1 Memory

### 11.1. Rust Commands

```rust
// commands/memory.rs

/// Đọc memory.md từ thư mục hiện tại.
/// Nếu file không tồn tại → tạo file trống → trả về "".
#[tauri::command]
pub fn read_memory_file() -> Result<String, String> {
    let path = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .join("memory.md");

    if !path.exists() {
        std::fs::write(&path, "").map_err(|e| e.to_string())?;
        return Ok(String::new());
    }

    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Mở memory.md bằng editor mặc định của hệ thống.
#[tauri::command]
pub fn open_memory_file() -> Result<(), String> {
    let path = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .join("memory.md");

    if !path.exists() {
        std::fs::write(&path, "").map_err(|e| e.to_string())?;
    }

    opener::open(&path).map_err(|e| e.to_string())
    // Cargo.toml: opener = "0.7"
}
```

### 11.2. Cấu trúc API Call với Prompt Caching

Phần memory được đặt vào **`system` block** (không phải `messages[]`) để tận dụng Prompt Caching của Claude. Nội dung system block phải **byte-identical** giữa các request để đạt cache hit.

```typescript
// hooks/useLayer1Api.ts
import { invoke } from '@tauri-apps/api/tauri';
import { useChatStore } from '../store/chatStore';
import type { Message } from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

export async function sendLayer1Message(userPrompt: string): Promise<string> {
  const { messages, appendMessage } = useChatStore.getState();

  // 1. Đọc memory.md tại thời điểm submit
  const memoryContent: string = await invoke('read_memory_file');

  // 2. Build system block (cacheable)
  const systemBlock = memoryContent
    ? [
        {
          type: 'text',
          text: `Đọc nội dung memory sau trước khi thực hiện yêu cầu:\n\n<memory>\n${memoryContent}\n</memory>`,
          cache_control: { type: 'ephemeral' },
        },
      ]
    : [];

  // 3. Build messages payload (conversation history + prompt mới)
  const newUserMsg: Message = { role: 'user', content: userPrompt };
  const payload = {
    model: MODEL,
    max_tokens: 1000,
    system: systemBlock,
    messages: [...messages, newUserMsg],
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const assistantText: string = data.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  // 4. Cập nhật conversation history
  appendMessage(newUserMsg);
  appendMessage({ role: 'assistant', content: assistantText });

  return assistantText;
}
```

### 11.3. ChatInput — Tích hợp Memory & Submit Flow

```typescript
// components/Chat/ChatInput.tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { sendLayer1Message } from '../../hooks/useLayer1Api';
import { useChatStore } from '../../store/chatStore';
import VoiceToggle from './VoiceToggle';

export default function ChatInput() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const { voiceState } = useChatStore();

  const isDisabled = loading || voiceState !== 'idle';

  const handleSubmit = async () => {
    if (!prompt.trim() || isDisabled) return;
    const text = prompt.trim();
    setPrompt('');
    setLoading(true);
    try {
      await sendLayer1Message(text);
    } catch (err) {
      console.error('Layer 1 API error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, padding: 8, background: '#1f2937' }}>
      <button
        onClick={() => invoke('open_memory_file')}
        title="Chỉnh sửa memory.md"
        style={{ padding: '4px 8px', fontSize: 12, background: '#374151', color: '#9ca3af', border: 'none', borderRadius: 4 }}
      >
        📝 Memory
      </button>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={voiceState === 'processing' ? 'Đang nhận dạng giọng nói...' : 'Nhập yêu cầu...'}
        disabled={voiceState === 'processing'}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
        style={{ flex: 1, resize: 'none', background: '#111827', color: '#f3f4f6', border: '1px solid #374151', borderRadius: 4, padding: 8 }}
        rows={3}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <VoiceToggle onTranscript={(text) => setPrompt(text)} />
        <button
          onClick={handleSubmit}
          disabled={isDisabled}
          style={{ padding: '8px 16px', background: isDisabled ? '#374151' : '#2563eb', color: '#fff', border: 'none', borderRadius: 4 }}
        >
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
```

---

## 12. Module Voice Mode (Batch STT)

### 12.1. Luồng hoạt động

```
User nhấn Toggle ON
      │
      ▼
React: invoke('start_recording')
Rust: cpal mở microphone stream, ghi WAV vào %TEMP%\myeva_rec.wav
      │
      ▼  (user nói...)
      │
User nhấn Toggle OFF
      │
      ▼
React: invoke('stop_recording') → nhận path file WAV
React: setVoiceState('processing') → disable Send, placeholder "Đang nhận dạng..."
      │
      ▼
React: invoke('send_audio_to_stt', { path })
Rust: reqwest::multipart POST → STT server
      │
      ▼
Rust: nhận transcript string → trả về frontend
      │
      ▼
React: setPrompt(transcript) → setVoiceState('idle')
User chỉnh sửa → nhấn Send
```

### 12.2. Rust Backend — Audio Recording

```rust
// voice/recorder.rs
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::{WavSpec, WavWriter};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;

pub struct RecorderState {
    // stream phải giữ sống trong suốt quá trình recording
    pub stream: Option<cpal::Stream>,
    pub output_path: Option<PathBuf>,
}

pub fn start_recording(output_path: PathBuf) -> Result<cpal::Stream, String> {
    let host = cpal::default_host();
    let device = host.default_input_device()
        .ok_or("Không tìm thấy microphone")?;
    let config = device.default_input_config().map_err(|e| e.to_string())?;

    let spec = WavSpec {
        channels: config.channels(),
        sample_rate: config.sample_rate().0,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let writer = Arc::new(Mutex::new(
        WavWriter::create(&output_path, spec).map_err(|e| e.to_string())?
    ));

    let writer_clone = writer.clone();
    let stream = device.build_input_stream(
        &config.into(),
        move |data: &[i16], _| {
            if let Ok(mut w) = writer_clone.lock() {
                for &sample in data {
                    w.write_sample(sample).ok();
                }
            }
        },
        |err| eprintln!("Recording error: {}", err),
        None,
    ).map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;
    Ok(stream)
}
```

### 12.3. Rust Commands — Voice

```rust
// commands/voice.rs
use std::sync::Mutex;
use tauri::State;

pub struct VoiceState {
    pub stream: Mutex<Option<cpal::Stream>>,
    pub wav_path: Mutex<Option<std::path::PathBuf>>,
}

#[tauri::command]
pub fn start_recording(voice: State<'_, VoiceState>) -> Result<(), String> {
    let tmp_path = std::env::temp_dir().join("myeva_rec.wav");
    let stream = crate::voice::recorder::start_recording(tmp_path.clone())?;
    *voice.stream.lock().unwrap() = Some(stream);
    *voice.wav_path.lock().unwrap() = Some(tmp_path);
    Ok(())
}

#[tauri::command]
pub fn stop_recording(voice: State<'_, VoiceState>) -> Result<String, String> {
    // Drop stream → flush WAV file
    *voice.stream.lock().unwrap() = None;

    let path = voice.wav_path.lock().unwrap()
        .clone()
        .ok_or("Không có file recording")?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn send_audio_to_stt(
    path: String,
    server_url: String,  // ví dụ: "http://localhost:8080/transcribe"
) -> Result<String, String> {
    let file_bytes = std::fs::read(&path).map_err(|e| e.to_string())?;

    let part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;

    let form = reqwest::multipart::Form::new().part("file", part);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post(&server_url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("STT server error: {}", response.status()));
    }

    let transcript = response.text().await.map_err(|e| e.to_string())?;

    // Dọn file tạm sau khi xong
    std::fs::remove_file(&path).ok();

    Ok(transcript.trim().to_string())
}
```

### 12.4. Frontend — VoiceToggle Component

```typescript
// components/Chat/VoiceToggle.tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useChatStore } from '../../store/chatStore';

const STT_SERVER_URL = 'http://localhost:8080/transcribe'; // configurable

interface Props {
  onTranscript: (text: string) => void;
}

export default function VoiceToggle({ onTranscript }: Props) {
  const { voiceState, setVoiceState } = useChatStore();

  const handleToggle = async () => {
    if (voiceState === 'idle') {
      // Bắt đầu ghi âm
      try {
        await invoke('start_recording');
        setVoiceState('recording');
      } catch (err) {
        console.error('start_recording error:', err);
      }

    } else if (voiceState === 'recording') {
      // Dừng ghi âm → gửi STT
      try {
        const wavPath: string = await invoke('stop_recording');
        setVoiceState('processing');

        const transcript: string = await invoke('send_audio_to_stt', {
          path: wavPath,
          serverUrl: STT_SERVER_URL,
        });

        onTranscript(transcript);
      } catch (err) {
        console.error('STT error:', err);
        // TODO: hiện toast lỗi
      } finally {
        setVoiceState('idle');
      }
    }
  };

  const label = {
    idle: '🎤',
    recording: '⏹ Đang ghi...',
    processing: '⌛',
  }[voiceState];

  const bg = {
    idle: '#374151',
    recording: '#dc2626',
    processing: '#374151',
  }[voiceState];

  return (
    <button
      onClick={handleToggle}
      disabled={voiceState === 'processing'}
      style={{
        padding: '8px 12px',
        background: bg,
        color: '#fff',
        border: 'none',
        borderRadius: 4,
        cursor: voiceState === 'processing' ? 'not-allowed' : 'pointer',
        fontSize: 13,
      }}
    >
      {label}
    </button>
  );
}
```

### 12.5. Cargo.toml — Dependencies bổ sung

```toml
[dependencies]
# ... dependencies cũ giữ nguyên ...

# Voice Mode
cpal = "0.15"
hound = "3.5"
reqwest = { version = "0.12", features = ["multipart", "json"] }

# Memory Module
opener = "0.7"
```

---

## 13. Các rủi ro kỹ thuật & Giải pháp (Cập nhật)

| Rủi ro | Mô tả | Giải pháp |
|---|---|---|
| Windows process isolation | `CREATE_NO_WINDOW` cần flag đúng khi spawn | Dùng `creation_flags(0x08000000)` trong Rust Command |
| Log flood | CLI sinh log quá nhanh → UI lag | Giới hạn buffer 2000 dòng/task trong logStore |
| Process zombie | Child không thoát sạch khi app đóng | Implement `on_window_close` → kill all tracked processes |
| SQLite write contention | Nhiều process cập nhật đồng thời | sqlx pool size = 1 (SQLite single-writer) hoặc WAL mode |
| React Flow performance | Nhiều node re-render | Dùng `memo` trên AgentNode, update node data minimal |
| Git Bash path trên Windows | `claude`/`codex` không có trong PATH mặc định | Prepend Git Bash bin path khi spawn, hoặc yêu cầu user cấu hình PATH |
| memory.md path resolution | Thư mục gốc khác nhau tùy môi trường | Dùng `std::env::current_dir()`, document rõ cho user |
| Prompt Cache miss | Nội dung system block thay đổi giữa các request | Đọc file raw tại submit, không transform trước khi inject |
| Microphone permission | Windows có thể block mic access | Hướng dẫn user grant permission lần đầu |
| WAV file tạm tích lũy | File âm thanh không xóa sau crash | Xóa file tạm trong `finally` block, cả thành công lẫn lỗi |
| STT server timeout | Server CPU-only xử lý chậm | `reqwest` timeout 60s, UI hiển thị trạng thái processing rõ |
| cpal trên Windows | Driver audio khác nhau (WASAPI/ASIO) | Dùng WASAPI mặc định của cpal, không cần config thêm |