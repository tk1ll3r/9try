# Sprint — Hôm nay, công việc và quyền kiểm soát vị trí

## Phạm vi đã triển khai

- Home dùng cùng engine occurrence với Lịch, sắp theo thời gian, có ngày cho sự kiện cả ngày, loading/error/retry. Cửa sổ 30 ngày, tối đa 6 occurrence hiển thị.
- Exception được áp dụng trước khi lọc khoảng thời gian: occurrence dời giờ/ngày vào hoặc ra cửa sổ không bị lọc theo thời gian master cũ.
- Trong **Tôi → Việc, ghi chú & thói quen**: danh sách việc một lần (không gồm routine), gồm tương lai/không hạn/đã xong; tìm, lọc, sửa, xóa có xác nhận, hoàn thành/mở lại và Undo completion. Home có đường dẫn tới danh sách và Undo.
- Mutation task giới hạn owner + ID + `recurrence = 'none'` (schema dùng giá trị `none`, không phải NULL; đã sửa sau kiểm thử hai tài khoản). Undo chỉ xóa completion timestamp vừa tạo, không ghi đè completion đã thay đổi. Sửa tiêu đề giữ nguyên timestamp hạn nếu người dùng không đổi ngày.
- Đọc dữ liệu và continuation của mutation bị vô hiệu khi đổi owner/unmount; mutation cũ không đặt Undo hay refetch dữ liệu owner cũ vào phiên mới.
- Vị trí truy vấn lại tất cả phiên active thuộc owner qua RLS có sẵn. Reload **không tự bật GPS**. Có nút dừng từng phiên, thất bại giữ phiên để thử lại. Bắt đầu/dừng có guard đồng bộ; watcher bị thu hồi trước stop RPC; callback muộn bị bỏ qua; từ chối GPS thu hồi phiên rỗng.

## Chính sách không thay đổi

- Không đổi nghĩa routine weekly hoặc múi giờ hồ sơ.
- Không tự chia sẻ vị trí, không lưu lịch sử GPS. Rời trang dừng watcher **không đồng nghĩa thu hồi server session**: vị trí gần nhất còn được xem đến expiry hoặc stop. Điều này được ghi rõ trong UI.
- Không thêm migration, không sửa cloud, không deploy hoặc commit trong sprint. Giữ nguyên các sửa đổi đang có trước sprint.
- Không thay navigation tổng thể hay thêm tính năng social mới.

## Kiểm tra hiện tại

- `npm run typecheck`: qua.
- `npm test`: 36 tests, 6 files, qua.
- `TZ=America/Los_Angeles npm test`: qua.
- `TZ=Asia/Ho_Chi_Minh npm test`: qua.
- `npm run build`: qua; vẫn có cảnh báo bundle lớn (~2 MB JS trước gzip). Chưa lazy-load route.
- `git diff --check`: qua.
- Reviewer vòng đầu phát hiện hai P1 (exception bị lọc theo master time và continuation mutation sau đổi owner); đã sửa và thêm regression tests. Re-review kiểm tra source/wiring/tests, không còn blocker trong phạm vi sprint; reviewer không chạy các lệnh validation độc lập. Đây không phải xác nhận production/device readiness.

Tests dùng domain/controller và adapter mock; **không chứng minh RLS trên DB hoặc hành vi browser/GPS thiết bị thật**. Engine vẫn có giới hạn 500 master events/2.000 bước recurrence; truy vấn danh sách task vẫn chịu giới hạn trả dòng của Supabase.

## Checklist thủ công trước phát hành

1. Hai tài khoản: task/phiên active riêng tư; user B không đọc/sửa dữ liệu A; unfriend/block kiểm tra riêng trên DB test.
2. Home/Lịch: sự kiện lặp bị hủy hoặc dời giờ/ngày cả hai hướng, DST, all-day nhiều ngày; thứ tự và ngày hiển thị khớp.
3. Task: thêm tương lai, tìm/lọc, sửa ngày/ưu tiên, hoàn thành/Undo, hủy xác nhận xóa, lỗi mạng giữ input; đổi tài khoản khi mutation đang chờ.
4. GPS: nhiều phiên còn mở sau reload, không bật watcher tự động; stop thất bại rồi retry, hết hạn, quyền bị từ chối, reload/rời trang trong lúc start và publish đang chờ. Stop thành công phải xóa tọa độ trên database.
5. Mobile 320px + bàn phím/VoiceOver/TalkBack: labels, focus, vùng chạm, không tràn ngang. Browser/device validation chưa chạy.

## Backlog tiếp theo

Giữ route lời mời qua auth; quyết định weekly/timezone; form lịch thu gọn; trạng thái thao tác ở notes/routines/friends/groups; actionable notifications; lazy-load lịch/map/ICS; ICS chống nhập trùng; staging/E2E và CI. Không đánh dấu các mục này đã xong.
