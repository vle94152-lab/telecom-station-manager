# Telecom Station Manager – Giải thích nhanh cho người mới

## 1) Ứng dụng này làm gì?
Đây là app React + Firebase để:
- Quản lý danh sách trạm viễn thông (`stations`)
- Lập kế hoạch đi trạm theo ngày (`dailyPlans`)
- Ghi nhận báo cáo công việc (`reports`)
- Hiển thị bản đồ, trạng thái kiểm tra, thống kê dashboard
- Dùng AI (Gemini) cho 2 việc: kiểm tra dữ liệu tọa độ nghi ngờ và gợi ý tối ưu lộ trình

## 2) Cấu trúc chính trong code
- `src/main.tsx`: entry point, render `<App />`
- `src/App.tsx`: file trung tâm, chứa gần như toàn bộ business/UI logic
  - `App`: xử lý đăng nhập, subscribe Firestore, điều hướng tab
  - `DashboardTab`: dashboard + map tổng thể + bộ lọc + thêm trạm vào kế hoạch hôm nay
  - `StationsTab`: CRUD trạm, import CSV/XLSX, AI validation tọa độ
  - `PlannerTab`: chọn ngày, chọn trạm, AI optimize route, xem tuyến trên map, ghi báo cáo
  - `SettingsTab`: thông tin user, đăng xuất
- `src/types.ts`: kiểu dữ liệu chính (`Station`, `Report`, `DailyPlan`, ...)
- `src/firebase.ts`: khởi tạo Firebase App/Auth/Firestore
- `firestore.rules`: validation và phân quyền dữ liệu phía Firestore

## 3) Luồng dữ liệu tổng quát
1. User đăng nhập Google (`onAuthStateChanged`).
2. Khi có user, app mở realtime listeners (`onSnapshot`) cho:
   - `stations` (toàn bộ)
   - `reports` theo `userId`
   - `dailyPlans` theo `userId`
3. Mọi thao tác thêm/sửa/xóa dùng Firestore SDK (`addDoc`, `updateDoc`, `deleteDoc`).
4. UI tự cập nhật tức thời nhờ snapshot listeners.

## 4) Những điểm quan trọng cần hiểu sớm
- App hiện “all-in-one” trong `App.tsx`: nhanh làm, nhưng khó bảo trì khi lớn.
- Validation quan trọng ở **2 lớp**:
  - Frontend: kiểm tra input/parse file
  - Backend rules (`firestore.rules`): chặn dữ liệu sai và chặn truy cập sai quyền
- Route map dùng 2 nguồn:
  - OSRM public API để vẽ polyline tuyến đường
  - Gemini để đề xuất thứ tự điểm đi
- Ảnh icon trạm/avatar lưu base64, rules giới hạn kích thước (1MB)

## 5) Những thứ nên học tiếp theo (ưu tiên)
1. **React state architecture**: tách component, custom hooks, context/store
2. **Firestore data modeling + security rules**: query index, quyền đọc/ghi, field validation
3. **TypeScript nâng cao**: tránh `any`, tạo type guards cho dữ liệu import
4. **Map stack**: Leaflet + marker clustering + geometry/routing
5. **Testing**: unit test cho parser/import và logic lập lộ trình
6. **Refactor quy mô lớn**:
   - tách `App.tsx` thành modules theo feature
   - tách tầng services (firebase, ai, routing)
   - thêm error boundary + logging tập trung
