# Thiết kế trạng thái kiểm tra và nhiều lần ghé trạm

## Bài toán
- Một trạm có 3 trạng thái nghiệp vụ:
  - `not_checked` (chưa kiểm tra)
  - `in_progress` (đang kiểm tra)
  - `checked` (đã kiểm tra)
- Một trạm có thể được ghé nhiều lần để làm các công việc khác nhau (không giới hạn theo ngày).

## Nguyên tắc thiết kế
Không lưu trạng thái theo kiểu “cứng” trên `station.status` như dữ liệu gốc, mà coi trạng thái là **kết quả tổng hợp từ các lượt ghé trạm (visits)**.

## Mô hình dữ liệu đề xuất

### 1) stations
```ts
{
  id: string,
  name: string,
  ...,
  // optional cache để render nhanh
  currentStatus?: 'not_checked' | 'in_progress' | 'checked',
  lastVisitAt?: string,
}
```

### 2) visits (collection mới)
Mỗi bản ghi là một lần ghé trạm.

```ts
{
  id: string,
  stationId: string,
  userId: string,
  workType: string,          // ví dụ: bảo trì, thay pin, đo kiểm...
  workScope?: string,        // phạm vi hạng mục
  note?: string,
  startedAt: string,         // ISO datetime
  endedAt?: string,          // khi hoàn thành
  status: 'in_progress' | 'checked',
  date: string,              // YYYY-MM-DD để lọc theo ngày
  createdAt: string,
  updatedAt: string,
}
```

### 3) reports
Giữ vai trò báo cáo chi tiết cho từng `visitId` (1-n phiên bản chỉnh sửa nội dung):

```ts
{
  id: string,
  visitId: string,
  stationId: string,
  userId: string,
  content: string,
  createdAt: string,
  updatedAt: string,
  history: Array<{ userId: string; userName: string; timestamp: string; content: string }>
}
```

## Quy tắc tính trạng thái trạm
Với mỗi trạm:
1. Không có visit nào => `not_checked`.
2. Có ít nhất 1 visit `in_progress` chưa `endedAt` => `in_progress`.
3. Không còn visit `in_progress`, nhưng có visit `checked` => `checked`.

> Ưu tiên hiển thị: `in_progress` > `checked` > `not_checked`.

## Luồng nghiệp vụ
1. Người dùng chọn trạm + chọn `workType` => tạo `visit` với `status=in_progress`.
2. Trong lúc làm việc: cập nhật ghi chú/report theo `visitId`.
3. Khi hoàn tất: set `visit.status=checked`, `endedAt=now`.
4. Dashboard tổng hợp từ visits gần nhất để hiển thị trạng thái trạm.

## Chỉ mục Firestore nên có
- `visits`: `(stationId, date desc)`
- `visits`: `(userId, date desc)`
- `visits`: `(status, updatedAt desc)`
- `reports`: `(visitId, updatedAt desc)`

## Migration từ dữ liệu hiện tại
1. Thêm collection `visits`.
2. Với mỗi report cũ (`stationId`, `date`, `content`): tạo 1 visit `checked` tương ứng (workType mặc định: `general`).
3. `station.status` cũ map sang:
   - `unchecked` -> `not_checked`
   - `checked` -> `checked`
4. UI dần chuyển sang đọc `currentStatus` tổng hợp từ visits.

## Thay đổi UI cần làm
- Form Planner:
  - Thêm field `Loại công việc` (workType).
  - Nút `Bắt đầu` tạo visit `in_progress`.
  - Nút `Hoàn tất` chuyển sang `checked`.
- Dashboard:
  - Hiển thị 3 nhóm trạng thái thay vì 2.
  - Thêm lịch sử nhiều lần ghé theo từng trạm.

## Lợi ích
- Hỗ trợ đúng nghiệp vụ nhiều lần ghé trạm.
- Không mất lịch sử theo từng công việc.
- Trạng thái trạm phản ánh realtime hơn (đang làm dở / đã xong / chưa làm).

## Nhận biết người dùng đã kết thúc công việc (để chốt báo cáo)

Ý tưởng của bạn là đúng hướng. Đề xuất áp dụng cơ chế **2 bước** để tránh bấm nhầm:

1. Người dùng bấm **Hoàn tất công việc**.
2. Hệ thống mở form xác nhận, chỉ cho chốt khi đủ điều kiện bắt buộc.

### Điều kiện chốt công việc (gợi ý)
- Có `workGroup` (Nhóm công việc).
- Có `workItem` (Nội dung công việc) thuộc đúng nhóm.
- Có `workDetail` (Chi tiết công việc) không rỗng.
- (Khuyến nghị) Có ít nhất 1 bằng chứng: ảnh hiện trường hoặc checklist.
- (Khuyến nghị) Nếu visit đang `in_progress` quá ngắn (ví dụ < 2 phút), hỏi xác nhận lại để tránh bấm nhầm.

### Tín hiệu hệ thống có thể dùng thêm
- Manual: bấm nút **Bắt đầu** / **Tạm dừng** / **Tiếp tục** / **Hoàn tất**.
- Context: vị trí GPS trong bán kính trạm (geofence nhẹ) để tăng độ tin cậy.
- Time: ghi nhận `startedAt`, `endedAt`, tổng thời lượng xử lý.

> Nên ưu tiên manual action làm nguồn sự thật chính; GPS và thời gian dùng để cảnh báo/chống nhầm, không khóa cứng nghiệp vụ.

## Mẫu form báo cáo chuẩn hóa (rất phù hợp)

Form bạn đề xuất rất hợp lý. Nên chuẩn hóa theo cấu trúc:

```ts
{
  workGroupId: string,        // Nhóm công việc (cấu hình sẵn)
  workItemId: string,         // Nội dung công việc (cấu hình sẵn theo group)
  workDetail: string,         // Nhập tự do theo thực tế
  result?: 'ok' | 'warning' | 'fail',
  attachments?: string[],     // ảnh/biên bản
}
```

### Cấu hình master data
- `work_groups`:
  - id, name, sortOrder, isActive
- `work_items`:
  - id, groupId, name, requiresAttachment, requiresChecklist, isActive

Khi user chọn `workGroup`, UI chỉ hiển thị `workItem` thuộc group đó.

## Đề xuất thêm (hay hơn ở mức vận hành)
1. **Nhiều bản ghi công việc trong 1 lần ghé**: 1 visit có thể có mảng `tasks[]` thay vì chỉ 1 nội dung.
2. **Template theo loại trạm**: indoor/outdoor/nguồn điện có bộ `workItem` khác nhau.
3. **Checklist động** theo `workItem` để giảm nhập tay và chuẩn hóa chất lượng.
4. **Auto draft** mỗi 15-30 giây để chống mất dữ liệu khi mạng yếu.
5. **SLA cảnh báo**: visit `in_progress` quá X giờ thì đẩy cảnh báo cho quản lý.

## Trạng thái visit khuyến nghị
- `in_progress`
- `paused`
- `completed`
- `canceled`

Khi `completed`, bắt buộc khóa snapshot báo cáo (không cho sửa trực tiếp), nếu cần sửa thì tạo bản revision mới để truy vết.
