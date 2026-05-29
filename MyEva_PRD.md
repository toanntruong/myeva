# TÀI LIỆU YÊU CẦU SẢN PHẨM (PRD)
## Tên dự án: MyEva - Desktop Task & Multi-Agent Management Tool

---

## 1. Tổng quan sản phẩm (Product Overview)
### 1.1. Vấn đề giải quyết
Khi làm việc với các hệ thống Multi-Agent hoặc các công cụ CLI mạnh (như Claude Code), người dùng (Architect/Product Owner) dễ bị cuốn vào chi tiết viết prompt vụn vặt, dẫn đến mất góc nhìn toàn cảnh (High-level) và mất kiểm soát bối cảnh (Context Drift). 

### 1.2. Giải pháp
Một ứng dụng Windows Desktop quản lý task theo mô hình **Layer-hóa quy trình**. Người dùng chỉ tương tác ở tầng cao với Bộ điều phối (Layer 1). Bộ điều phối này sẽ tự động phân tích yêu cầu, chuẩn bị môi trường (Git, worktree, branch) và kích hoạt các Agent thực thi (Layer 2) chạy ngầm song song. Hệ thống tập trung vào việc **Trực quan hóa trạng thái Sống/Chết (Observability)** của các tiến trình thay vì can thiệp quá sâu vào code.

---

## 2. Kiến trúc Hệ thống & Luồng Vận hành (Workflow)

```
[Người dùng] ──(Nhập lệnh)──> [Layer 1: Orchestrator]
                                      │
                         (Tính toán & sinh câu lệnh CLI)
                                      │
                                      ▼
                      [Kích hoạt Layer 2 chạy song song]
                        (Qua Git Bash / Windows Host)
                                      │
             ┌────────────────────────┴────────────────────────┐
             ▼                                                 ▼
   [Layer 2 - Node A]                                [Layer 2 - Node B]
(Trạng thái: Running/Stopped)                     (Trạng thái: Running/Stopped)
             │                                                 │
      (Stream Log)                                      (Stream Log)
             └────────────────────────┬────────────────────────┘
                                      ▼
                           [SQLite DB & UI Graph]
```

### 2.1. Luồng vận hành chuẩn (Happy Path)
1. Người dùng nhập yêu cầu vĩ mô vào ô Chat của **Layer 1**.
2. **Layer 1** (LLM) xử lý bối cảnh, tự động tính toán tên thư mục/branch độc lập để tránh xung đột file system.
3. **Layer 1** ghi nhận Task vào **SQLite** $\rightarrow$ UI lập tức vẽ ra một Node đại diện cho Layer 2 trên Graph ở trạng thái `Running`.
4. **Layer 1** gọi CLI của **Layer 2** (ví dụ: `codex-cli --prompt "..."`) chạy ngầm thông qua Terminal mặc định (Git Bash).
5. Người dùng click vào Node trên Graph để xem stream log real-time của riêng Node đó tại Panel phải.
6. Khi CLI kết thúc hoặc dừng lại để chờ duyệt plan thủ công, tiến trình kết thúc $\rightarrow$ Ứng dụng phát hiện Exit Code hoặc ngắt kết nối $\rightarrow$ Cập nhật SQLite và đổi trạng thái Node sang `Stopped`.
7. Người dùng tự kiểm tra "chiến địa", duyệt plan thủ công và ra lệnh tiếp.

---

## 3. Yêu cầu tính năng chi tiết (Functional Requirements)

### 3.1. Module Giao diện (UI/UX)
* **Left Panel (Task Tree):** Hiển thị danh sách các tác vụ theo dạng cây thư mục (tương tự VSCode) để quản lý danh mục công việc.
* **Center Panel (Visual Graph):**
  * Hiển thị các Node (Task/Layer 2) trôi nổi tự do (mối quan hệ mạng lưới mạng, không ép buộc phân cấp).
  * Các đường nối (Edges) thể hiện luồng chuyển giao dữ liệu/kích hoạt từ Layer 1 sang Layer 2.
  * Tự động sắp xếp vị trí các nút để tránh đè lên nhau.
* **Right Panel (Single Log Panel):**
  * Chỉ có một ô hiển thị Log duy nhất trên màn hình.
  * Khi người dùng click vào một Node trên Graph, panel này sẽ lập tức switch bối cảnh để hiển thị luồng text stdout/stderr real-time của Node đó.

### 3.2. Module Quản lý Tiến trình (Process Orchestration)
* **Parallel Execution:** Hỗ trợ chạy song song nhiều tiến trình con (Child Process) cùng lúc. Layer 1 có thể liên tục nhận lệnh mới và sinh ra các Layer 2 mới mà không cần chờ tiến trình cũ kết thúc.
* **Process Detection:** Ứng dụng Desktop chạy ngầm lệnh trên Git Bash máy host, có nhiệm vụ bắt được sự kiện vòng đời tiến trình để cập nhật trạng thái:
  * Tiến trình đang chạy $\rightarrow$ Trạng thái `Running` (Node sáng màu).
  * Tiến trình kết thúc/ngắt (bất kể lý do) $\rightarrow$ Trạng thái `Stopped` (Node tối màu).

### 3.3. Module Lưu trữ (Persistence)
* Sử dụng cấu trúc cơ sở dữ liệu nhẹ **SQLite** để lưu cục bộ trên máy.
* Lưu trữ thông tin về: Định danh Task, Lệnh CLI thực thi, Trạng thái (`Running`/`Stopped`), và vị trí/mối quan hệ của các Node trên Graph. Khi tắt/mở lại app, toàn bộ trạng thái trực quan (visual) phải được giữ nguyên.

---

## 4. Yêu cầu phi chức năng (Non-Functional Requirements)
* **Hệ điều hành:** Chạy mượt mà, tối ưu trên Windows Desktop.
* **Hiệu năng:** Xử lý render Graph mượt mà khi có nhiều Node trôi nổi; Stream log không gây treo UI chính (bằng cách tách biệt luồng xử lý I/O log).
* **Tính thực dụng (KISS Principle):** Bỏ qua các tính năng tự động rollback, tự động dọn dẹp Git, hay đồng bộ hóa File System. Mọi quyết định xử lý code sâu bên dưới thuộc về workflow cá nhân của người dùng và Agent.
