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
3. **Layer 1** ghi nhận Task vào **SQLite** $ightarrow$ UI lập tức vẽ ra một Node đại diện cho Layer 2 trên Graph ở trạng thái `Running`.
4. **Layer 1** gọi CLI của **Layer 2** (ví dụ: `codex-cli --prompt "..."`) chạy ngầm thông qua Terminal mặc định (Git Bash).
5. Người dùng click vào Node trên Graph để xem stream log real-time của riêng Node đó tại Panel phải.
6. Khi CLI kết thúc hoặc dừng lại để chờ duyệt plan thủ công, tiến trình kết thúc $ightarrow$ Ứng dụng phát hiện Exit Code hoặc ngắt kết nối $ightarrow$ Cập nhật SQLite và đổi trạng thái Node sang `Stopped`.
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
  * Tiến trình đang chạy $ightarrow$ Trạng thái `Running` (Node sáng màu).
  * Tiến trình kết thúc/ngắt (bất kể lý do) $ightarrow$ Trạng thái `Stopped` (Node tối màu).

### 3.3. Module Lưu trữ (Persistence)
* Sử dụng cấu trúc cơ sở dữ liệu nhẹ **SQLite** để lưu cục bộ trên máy.
* Lưu trữ thông tin về: Định danh Task, Lệnh CLI thực thi, Trạng thái (`Running`/`Stopped`), và vị trí/mối quan hệ của các Node trên Graph. Khi tắt/mở lại app, toàn bộ trạng thái trực quan (visual) phải được giữ nguyên.

### 3.4. Module Voice Mode (Xử lý Batch - Self-hosted)
* **Luồng tương tác (Toggle Mechanism):**
  * Sử dụng cơ chế nút bấm chuyển đổi trạng thái (Toggle) trên UI.
  * **Bật Toggle:** Ứng dụng kích hoạt bộ ghi âm local trên máy host (định dạng nhẹ như `.wav` hoặc `.mp3`).
  * **Tắt Toggle:** Ngừng ghi âm, ứng dụng lập tức đóng gói file audio và gửi qua giao thức HTTP POST tới Server Voice riêng của người dùng (chạy bằng CPU thuần thông qua public domain).
* **Trạng thái chờ (Loading State):**
  * Trong quá trình đợi Server xử lý file (Batch STT), ô nhập Prompt tại Layer 1 sẽ **hiển thị icon loading (`...`)** và **disable hoàn toàn nút Gửi prompt** để tránh xung đột dữ liệu hoặc gửi lệnh rỗng.
* **Xử lý kết quả:**
  * Sau khi nhận phản hồi từ Server, văn bản (đã nhận diện tốt cả Tiếng Việt và từ chuyên ngành Tiếng Anh - Vietglish) sẽ được điền thẳng vào ô Chat.
  * Hệ thống **không tự động gửi đi**. Người dùng có quyền chỉnh sửa, thêm bớt bằng bàn phím trước khi chủ động nhấn `Enter` hoặc click `Gửi`.
* **An ninh & Bảo mật:** Bỏ qua các lớp xác thực (Authentication/API Key) để tối giản hóa code và cấu trúc hạ tầng trong giai đoạn này.

### 3.5. Module Layer 1 Memory (File `.md` tĩnh)
* **Cơ chế vận hành (Injection Workflow):**
  * Tính năng này **chỉ áp dụng bắt buộc cho Layer 1 (Bộ điều phối)**, hoàn toàn chưa áp dụng cho các Agent thực thi ở Layer 2.
  * File `memory.md` nằm ở thư mục gốc do người dùng tự chỉnh sửa thủ công bằng tay để cấu hình các quy tắc (Custom Rules), ràng buộc kiến trúc (Constraints) hoặc danh sách công việc vĩ mô.
* **Thời điểm đọc file (File IO Trigger):**
  * Không chạy background watcher để theo dõi file liên tục. Ứng dụng chỉ thực hiện hàm đọc file (`fs.readFileSync()`) trực tiếp từ ổ đĩa **ngay tại thời điểm người dùng nhấn nút "Gửi" prompt**.
  * Nếu file `memory.md` không tồn tại hoặc bị lỗi đọc file, hệ thống sẽ tự động tạo một file trống hoặc áp dụng template mặc định để không làm gián đoạn luồng chat.
* **Cấu trúc Prompt:**
  * Với mỗi prompt được gửi đi, hệ thống sẽ tự động tiêm (inject) thêm một chỉ chỉ định cố định ở đầu bối cảnh theo cú pháp: `"Đọc file memory.md trước, sau đó... [Nội dung file memory.md] ... [Prompt của người dùng]"`.
  * Tận dụng tối đa tính năng **Prompt Caching** của LLM (Claude) để tối ưu chi phí input token lặp lại và giảm độ trễ (latency) khi file `memory.md` phình to theo thời gian.

---

## 4. Yêu cầu phi chức năng (Non-Functional Requirements)
* **Hệ điều hành:** Chạy mượt mà, tối ưu trên Windows Desktop.
* **Hiệu năng:** Xử lý render Graph mượt mà khi có nhiều Node trôi nổi; Stream log không gây treo UI chính (bằng cách tách biệt luồng xử lý I/O log).
* **Tính thực dụng (KISS Principle):** Bỏ qua các tính năng tự động rollback, tự động dọn dẹp Git, hay đồng bộ hóa File System. Mọi quyết định xử lý code sâu bên dưới thuộc về workflow cá nhân của người dùng và Agent.
