# MyEva — Task Breakdown (Full Project)

> Dựa trên PRD & TechDoc. Mỗi task có ID, mô tả, acceptance criteria, dependency, và ước tính độ phức tạp (S/M/L).

---

## Phase 0 — Scaffold & Cấu hình nền

| ID | Task | Mô tả | Depends On | Size |
|----|------|-------|------------|------|
| P0-01 | Khởi tạo Tauri 2 project | `npm create tauri-app`, chọn React + TypeScript template | — | S |
| P0-02 | Cấu hình Tailwind CSS | Cài tailwind + postcss, tích hợp vào Vite pipeline | P0-01 | S |
| P0-03 | Cấu hình Cargo.toml | Thêm dependencies: `sqlx`, `tokio`, `tauri`, `uuid`, `serde` | P0-01 | S |
| P0-04 | Cấu hình `tauri.conf.json` | Window size (1440×900), minSize, allowlist events, build paths | P0-01 | S |
| P0-05 | Thiết lập cấu trúc thư mục | Tạo đủ folders: `commands/`, `process/`, `db/`, `store/`, `components/`, `hooks/`, `types/` | P0-01 | S |
| P0-06 | Thiết lập TypeScript types | File `src/types/index.ts`: `Task`, `NodePosition`, `LogLine`, `ProcessStoppedEvent`, `CliType`, `TaskStatus` | P0-05 | S |

**AC Phase 0:** `npm run tauri dev` chạy được, hiện cửa sổ trắng không lỗi.

---

## Phase 1 — Database (SQLite)

| ID | Task | Mô tả | Depends On | Size |
|----|------|-------|------------|------|
| P1-01 | Viết migration `001_init.sql` | 3 bảng: `tasks`, `node_positions`, `edges` đúng schema trong TechDoc | P0-03 | S |
| P1-02 | Khởi tạo `sqlx::SqlitePool` trong `main.rs` | Tạo pool, chạy `migrate!()`, mount vào Tauri builder | P1-01 | S |
| P1-03 | Viết `db/models.rs` | Rust structs `Task`, `NodePosition`, `Edge` derive `FromRow`, `Serialize`, `Deserialize` | P1-02 | S |
| P1-04 | Viết `db/store.rs` — CRUD tasks | `create_task`, `get_all_tasks`, `update_task_status`, `get_task_by_id` | P1-03 | M |
| P1-05 | Viết `db/store.rs` — Node positions | `upsert_node_position`, `get_all_positions` | P1-03 | S |
| P1-06 | Viết `db/store.rs` — Edges | `create_edge`, `get_all_edges`, `delete_edge` | P1-03 | S |
| P1-07 | Bật SQLite WAL mode | Thêm `PRAGMA journal_mode=WAL` sau khi pool khởi tạo, tránh write contention | P1-02 | S |

**AC Phase 1:** Unit test tạo task, update status, upsert position đều pass. Inspect DB bằng DB Browser thấy đúng data.

---

## Phase 2 — AppState & Tauri Commands cơ bản

| ID | Task | Mô tả | Depends On | Size |
|----|------|-------|------------|------|
| P2-01 | Viết `state.rs` | `AppState` chứa `processes: Mutex<HashMap<String, ProcessEntry>>` và `db: SqlitePool` | P1-02 | S |
| P2-02 | Mount `AppState` vào Tauri builder | `manage(app_state)` trong `main.rs` | P2-01 | S |
| P2-03 | Viết command `create_task` | Nhận title, cli_type, command → INSERT vào DB → trả về Task | P1-04, P2-02 | S |
| P2-04 | Viết command `get_all_tasks` | SELECT * FROM tasks JOIN node_positions → trả về `Vec<Task>` kèm position | P1-04 | S |
| P2-05 | Viết command `get_all_edges` | SELECT * FROM edges | P1-06 | S |
| P2-06 | Viết command `update_node_position` | Nhận task_id, x, y → upsert node_positions | P1-05 | S |
| P2-07 | Đăng ký commands vào Tauri `invoke_handler` | `generate_handler![create_task, get_all_tasks, ...]` | P2-03..P2-06 | S |

**AC Phase 2:** Gọi `invoke('get_all_tasks')` từ browser console trả về `[]` không lỗi.

---

## Phase 3 — Process Manager (Core)

| ID | Task | Mô tả | Depends On | Size |
|----|------|-------|------------|------|
| P3-01 | Viết `process/manager.rs` — `spawn_agent()` | Build `Command` theo `cli_type` (`claude`/`codex`), set `CREATE_NO_WINDOW` flag (Windows) | P2-01 | M |
| P3-02 | Stream stdout → Tauri event | `tokio::spawn` pipe stdout, emit `log-line` event với `{task_id, stream: "stdout", line}` | P3-01 | M |
| P3-03 | Stream stderr → Tauri event | Tương tự P3-02 cho stderr | P3-01 | S |
| P3-04 | Watch exit → Tauri event | `tokio::spawn` `child.wait()`, emit `process-stopped` với `{task_id, exit_code}` | P3-01 | S |
| P3-05 | Lưu `ProcessEntry` vào `AppState.processes` | Insert vào Mutex HashMap sau khi spawn thành công | P3-01, P2-01 | S |
| P3-06 | Viết command `spawn_task` | UPDATE status='running' → gọi `spawn_agent()` | P3-01..P3-05, P2-03 | M |
| P3-07 | Viết command `kill_task` | Lock processes, gọi `child.kill()` trên entry | P3-05 | S |
| P3-08 | Handle `process-stopped` ở Rust side | UPDATE `tasks SET status='stopped', exit_code=?` trong handler sau khi child thoát | P3-04, P1-04 | S |
| P3-09 | Kill all processes khi app đóng | Hook `on_window_close` → iterate HashMap → kill all children | P3-05 | M |

**AC Phase 3:** Spawn được `echo hello`, log line xuất hiện trong console Tauri, status cập nhật thành `stopped` sau khi exit.

---

## Phase 4 — Frontend: Zustand Stores & Event Hooks

| ID | Task | Mô tả | Depends On | Size |
|----|------|-------|------------|------|
| P4-01 | Viết `store/processStore.ts` | `tasks[]`, `setTasks()`, `updateTaskStatus()` | P0-06 | S |
| P4-02 | Viết `store/logStore.ts` | `logs: Record<string, string[]>`, `activeTaskId`, `appendLog()`, `setActiveTask()`. Buffer giới hạn 2000 dòng/task | P0-06 | S |
| P4-03 | Viết `store/taskStore.ts` | Store cho Task Tree (cây thư mục), CRUD local state | P0-06 | S |
| P4-04 | Viết `hooks/useTauriEvents.ts` | Listen `log-line` → `appendLog`, listen `process-stopped` → `updateTaskStatus` | P4-01, P4-02 | S |
| P4-05 | Mount `useTauriEvents` ở root `App.tsx` | Đảm bảo event listeners active suốt app lifecycle | P4-04 | S |
| P4-06 | Viết `hooks/useProcess.ts` | Helper `spawnTask(params)`, `killTask(id)` wrapping `invoke()` | P4-01 | S |

**AC Phase 4:** Khi Rust emit `log-line`, store `logStore` nhận được line và `logs[task_id]` có data.

---

## Phase 5 — Log Viewer (Right Panel)

| ID | Task | Mô tả | Depends On | Size |
|----|------|-------|------------|------|
| P5-01 | Viết `LogViewer.tsx` | Render `lines[]` từ `logStore[activeTaskId]`, monospace font, dark bg | P4-02 | M |
| P5-02 | Auto-scroll xuống cuối | `useRef` + `scrollIntoView` khi `lines.length` thay đổi | P5-01 | S |
| P5-03 | Empty state | Hiển thị "Click vào một Node để xem log." khi `activeTaskId === null` | P5-01 | S |
| P5-04 | Tách I/O khỏi UI thread | Đảm bảo log append không block render (verify qua React DevTools — không re-render toàn bộ panel) | P5-01, P4-02 | S |
| P5-05 | Phân biệt màu stdout/stderr | stdout: màu trắng, stderr: màu đỏ nhạt | P5-01 | S |

**AC Phase 5:** Stream 500 dòng/giây vào log viewer, UI không lag, scroll hoạt động, stderr hiện đỏ.

---

## Phase 6 — Visual Graph (Center Panel)

| ID | Task | Mô tả | Depends On | Size |
|----|------|-------|------------|------|
| P6-01 | Cài React Flow | `npm install reactflow` | P0-01 | S |
| P6-02 | Viết `AgentNode.tsx` | Custom node: border màu theo status (pending=gray, running=green, stopped=dark), title, cli_type badge, exit_code | P4-01, P0-06 | M |
| P6-03 | Viết `GraphCanvas.tsx` | `useNodesState`, `useEdgesState`, build nodes từ `processStore.tasks`, nodeTypes map | P6-02 | M |
| P6-04 | Sync nodes khi tasks thay đổi | `useEffect` trên `tasks` → rebuild `rfNodes[]` | P6-03, P4-01 | S |
| P6-05 | Click node → switch log context | `onNodeClick` → `logStore.setActiveTask(node.id)` | P6-03, P4-02 | S |
| P6-06 | Drag node → save position | `onNodeDragStop` → `invoke('update_node_position', ...)` | P6-03, P2-06 | S |
| P6-07 | Restore positions khi khởi động | Load positions từ DB qua `get_all_tasks` (có `pos_x`, `pos_y` kèm theo) | P6-03, P2-04 | S |
| P6-08 | Render edges từ DB | Load `get_all_edges` → build `rfEdges[]`, hiển thị đường nối giữa nodes | P6-03, P2-05 | S |
| P6-09 | `<Background />` và `<Controls />` | Thêm grid background và zoom/fit controls | P6-03 | S |
| P6-10 | Memo hóa AgentNode | Bọc `React.memo`, chỉ re-render khi `task.status` hoặc `task.title` thay đổi | P6-02 | S |

**AC Phase 6:** 20 nodes hiển thị, drag-drop lưu position, click node switches log panel, running node sáng xanh lá.

---

## Phase 7 — Task Tree (Left Panel)

| ID | Task | Mô tả | Depends On | Size |
|----|------|-------|------------|------|
| P7-01 | Viết `TaskTree.tsx` | Render cây thư mục từ `taskStore`, dùng `parent_id` để build nested structure | P4-03 | M |
| P7-02 | Viết `TaskNode.tsx` | Item trong cây: icon, title, status badge nhỏ, click để focus node trên graph | P7-01 | S |
| P7-03 | Collapse/expand node cha | Toggle hiển thị children khi click vào chevron | P7-01 | S |
| P7-04 | Click task → highlight node trên graph | `setActiveTask` + center graph viewport về node đó (`reactFlowInstance.fitView` với node filter) | P7-02, P6-03 | M |
| P7-05 | Context menu (right-click) | Menu: "Kill Process", "Copy Command" | P7-02, P4-06 | M |

**AC Phase 7:** Task tree hiện đúng cây nested, click item highlights node trên graph.

---

## Phase 8 — Layer 1 Chat UI (Input)

| ID | Task | Mô tả | Depends On | Size |
|----|------|-------|------------|------|
| P8-01 | Viết `ChatInput.tsx` | Textarea nhập prompt, nút "Send", dropdown chọn `cli_type` (claude/codex) | P0-02 | M |
| P8-02 | Submit → `create_task` + `spawn_task` | Khi submit: gọi `create_task` lấy ID → gọi `spawn_task` với ID đó → node xuất hiện trên graph | P8-01, P2-03, P3-06 | M |
| P8-03 | Input cho `parent_id` (optional) | Dropdown/autocomplete chọn task cha để tạo edge | P8-01, P4-01 | M |
| P8-04 | Loading state khi spawning | Nút "Send" disabled + spinner trong khi invoke đang chạy | P8-02 | S |
| P8-05 | Error toast khi spawn thất bại | Hiển thị error message nếu invoke trả về Err | P8-02 | S |

**AC Phase 8:** Nhập prompt, chọn cli_type, submit → node mới xuất hiện trên graph trạng thái Running, log bắt đầu stream.

---

## Phase 9 — Layout & Polish

| ID | Task | Mô tả | Depends On | Size |
|----|------|-------|------------|------|
| P9-01 | Layout 3-panel cố định | CSS grid/flex: Left 240px | Center flex-grow | Right 320px, height 100vh | P0-02 | M |
| P9-02 | Resizable panels | Kéo divider giữa các panel để resize | P9-01 | M |
| P9-03 | Dark theme toàn app | Tailwind dark mode, màu nền `#111827`, text `#f3f4f6` | P0-02 | S |
| P9-04 | Restore full state khi restart app | `onMount` ở App.tsx: load tasks + positions + edges từ DB → populate stores | P2-04, P2-05, P4-01 | M |
| P9-05 | Node status live update | Khi nhận `process-stopped` event → node đổi màu tức thì không cần reload | P4-04, P6-03 | S |
| P9-06 | Window title "MyEva" | Cấu hình trong `tauri.conf.json` | P0-04 | S |
| P9-07 | Git Bash PATH resolution | Khi spawn command, prepend Git Bash bin path hoặc doc hướng dẫn user set PATH | P3-01 | S |

**AC Phase 9:** App khởi động lại giữ nguyên toàn bộ graph layout + task list. Không có node bị chồng lên nhau.

---

## Phase 10 — Testing & Hardening

| ID | Task | Mô tả | Depends On | Size |
|----|------|-------|------------|------|
| P10-01 | Test process zombie scenario | Đóng app đột ngột → mở lại → confirm không còn orphan process | P3-09 | M |
| P10-02 | Test log flood | Spawn process sinh 10k dòng/giây → verify UI không freeze, buffer cắt đúng 2000 dòng | P5-04 | M |
| P10-03 | Test concurrent spawn | Spawn 5 processes cùng lúc → verify tất cả nodes Running, logs độc lập | P3-06 | M |
| P10-04 | Test SQLite write contention | 5 processes cùng update status → verify không deadlock (WAL mode) | P1-07 | M |
| P10-05 | Test kill_task | Kill 1 trong 5 processes → verify chỉ node đó đổi Stopped | P3-07 | S |
| P10-06 | Test restore positions | Drag nodes → đóng app → mở lại → positions giống hệt | P9-04 | S |

---

## Tóm tắt theo Phase

| Phase | Tên | Số tasks | Size tổng |
|-------|-----|----------|-----------|
| 0 | Scaffold | 6 | S×6 |
| 1 | Database | 7 | ~M |
| 2 | AppState & Commands | 7 | ~M |
| 3 | Process Manager | 9 | L |
| 4 | Zustand & Events | 6 | ~M |
| 5 | Log Viewer | 5 | ~M |
| 6 | Visual Graph | 10 | L |
| 7 | Task Tree | 5 | M |
| 8 | Chat Input | 5 | M |
| 9 | Layout & Polish | 7 | M |
| 10 | Testing | 6 | M |
| **Total** | | **73 tasks** | |

---

## Thứ tự triển khai khuyến nghị

```
P0 → P1 → P2 → P3 → P4 → P5   (core pipeline — chạy được process + xem log)
                              ↓
                         P6 → P7 → P8   (UI hoàn chỉnh)
                                        ↓
                                   P9 → P10   (polish + hardening)
```

> **Note:** P3 (Process Manager) là critical path. Không nên song song hoá với P6 trở đi trước khi P3 hoạt động ổn định.
