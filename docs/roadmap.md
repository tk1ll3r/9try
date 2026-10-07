# Lộ trình phát triển Gnouht Together

Cập nhật: 2026-10-05. Đây là kế hoạch, không phải cam kết mọi hạng mục đã triển khai. Mốc thời gian ước lượng cho một người phát triển, điều chỉnh sau mỗi vòng thử nghiệm.

## Hiện trạng và nguyên tắc

- `main` ở `ebc49a7`; bản thử nghiệm local có thay đổi **chưa commit/push**: 6 mode với icon và migrations `0011`–`0012`, nhập `.ics` cơ bản, form việc hằng ngày, bản đồ không tự kéo về mỗi 15 giây. Migrations 0011–0012 **đã chạy trên Supabase project `9try`**, nhưng chưa có trên GitHub. Giữ file migration trong Git trước khi triển khai máy khác.
- Localhost hiện nối Supabase cloud `9try` để thử trên nhiều thiết bị; Docker local chỉ dùng cho kiểm thử migration/RLS tách biệt. Frontend chưa được xác nhận deploy. Kiểm thử tự động hiện có 9 unit tests + typecheck/build và 12 SQL/pgTAP tests đã qua trên database local. Auth local gửi magic link vào Mailpit và đã smoke-test; **CI job mới chưa chạy trên GitHub**. Chưa có test trình duyệt nhiều người dùng, GPS trên thiết bị, hay thử nghiệm restore.
- Dữ liệu lịch/task/mode/vị trí riêng tư theo mặc định. Không đoán mode từ GPS, không công khai mode cho người lạ, không giữ lịch sử GPS, không đưa service-role/VAPID private key vào `VITE_*`.
- Mỗi PR: migration tương ứng nếu đổi DB, test, mô tả rủi ro dữ liệu, `npm run typecheck && npm test && npm run build` và xác nhận trên staging. Không trực tiếp sửa DB bằng tay để thay thế migration.

## P0 — Đóng gói bản thử nghiệm & ổn định nền tảng (2–4 ngày)

**Tiến độ:** [x] lockfile + `npm ci`/unit/typecheck/build local; [x] khởi tạo Supabase config, áp dụng migration 0012 và đối chiếu history trên `9try`; [x] viết SQL test cho mode và thêm job CI; [x] chạy 12 SQL test trên Docker local; [x] smoke-test Supabase Auth/Mailpit; [ ] CI GitHub; [ ] thử E2E hai tài khoản; [ ] review và đưa code/migrations vào GitHub. **Không đánh dấu P0 hoàn tất** trước khi các mục còn lại được xác minh.

1. Review diff local, chia PR nhỏ: (a) mode + migration/RLS, (b) ICS, (c) Today UX, (d) Map. Giữ `package-lock.json`, cho CI dùng `npm ci`; bảo đảm Node 24 CI và Node local cài sạch được. Tránh đưa `.env.local`/`supabase/.temp` vào Git.
2. Chạy migration từ Git trên Supabase staging sạch; đối chiếu history với project `9try`. Viết test SQL/RLS với hai bạn bè, người lạ, người bị block, mode hết hạn: SELECT chỉ thấy mode được phép; anon/khách không ghi; chỉ owner đổi/xoá; tự hết hạn. Kiểm tra giới hạn thời gian và tình huống unfriend/block ngay lúc đang bật mode.
3. Test E2E trình duyệt: magic link, kết bạn, chuyển mode, cùng nhìn thấy mode, hết hạn, thêm task/lịch, import ICS, bật/tắt chia sẻ vị trí. Xác nhận lỗi được hiển thị thay vì im lặng. Thiết lập redirect `http://127.0.0.1:5173` trong Supabase Auth cho môi trường test.
4. Bổ sung CI: unit + SQL integration + smoke E2E trên staging/test DB; không sử dụng service-role trên trình duyệt. Chặn merge khi test hoặc migration fail.

**Hoàn thành khi:** clone sạch → cài deps → chạy test/build; schema + mã khớp; hai tài khoản có thể thử hành trình chính; không có quyền xem mode/lịch/vị trí trái phép.

## P1 — Hoạt động/mode hữu ích hơn (3–5 ngày)

- Hoàn thiện 6 mode: Học bài, Đi học, Chơi game, Chơi Bi a, Nhậu, Ngủ. Một mode/người; bật/tắt một chạm, hẹn giờ 30 phút–8 giờ, trạng thái hết hạn tự biến mất. Icon Lucide nhất quán, tương phản tốt trên nền sáng/tối, vùng chạm ≥44px, hỗ trợ screen reader.
- Thêm chọn người được xem (mặc định chỉ bạn bè đã kết nối; nếu thêm nhóm/danh sách cụ thể cần RLS tương ứng), cân nhắc tùy chọn “không làm phiền” và cho phép bạn bè gửi lời mời phù hợp mode. Không hiển thị lịch sử mode hoặc suy ra vị trí.
- Đặt shortcut mode trên trang Hôm nay; đồng bộ thay đổi qua realtime hoặc refresh chủ động, dừng subscription khi logout; giữ polling fallback. Cân nhắc thông báo lời mời có chống spam; không gửi push mỗi lần bạn đổi mode.

**Hoàn thành khi:** hai người dùng đổi mode và quan sát cập nhật trong vài giây; block/unfriend thu hồi quyền ngay; mode tự hết hạn khi không mở app.

## P1 — Lịch `.ics` đúng múi giờ và tránh trùng (3–6 ngày)

- Bản đầu chỉ nhập VEVENT đơn, tối đa 100/file, preview, private-by-default. Kiểm thử thêm UTF-8, folded lines, UTC, floating time, TZID + DST, all-day DTEND exclusive, DURATION, sự kiện hủy, file lỗi và upload lớn.
- Thêm UID nguồn + tên file/import batch dưới quyền owner để phát hiện import lặp; cho người dùng chọn bỏ qua/cập nhật/trùng lặp. Nhập theo batch có báo tiến độ và cách khôi phục khi lỗi giữa chừng; không upload file ICS thô lên server.
- Sau khi test đủ, hỗ trợ RRULE/EXDATE/RECURRENCE-ID (hoặc nêu rõ là chưa hỗ trợ). Không âm thầm biến chuỗi lặp thành một lần. Thêm export `.ics` của lịch riêng và cảnh báo trước khi chia sẻ công khai.

**Hoàn thành khi:** import 2 lần không nhân đôi ngoài ý muốn, DST và all-day đúng ngày, lỗi một event không làm người dùng hiểu nhầm tất cả đã nhập.

## P1 — Việc hôm nay & UX trên điện thoại (3–5 ngày)

- Quick-add trên trang Hôm nay: tiêu đề, ngày, ưu tiên, thêm bằng Enter; phân nhóm Quá hạn/Hôm nay/Không hạn; thông báo hoàn tất có Undo. Sau đó thêm chỉnh sửa/xóa, lọc và tìm task; việc tương lai cần xem được trong một màn hình danh sách, không chỉ “biến mất” tới ngày đến hạn.
- Cùng một nguồn dữ liệu `personal_tasks` cho Home và Organizer; quy định rõ task một lần vs thói quen lặp, múi giờ người dùng, biên ngày và hoàn thành. Đảm bảo không hiển thị task riêng cho người khác.
- Rút gọn form lịch trên mobile; bấm ô ngày/giờ trên lịch để điền sẵn sự kiện, nút thêm nổi nếu cần, trạng thái loading/error/success rõ ràng; test bàn phím, tab, VoiceOver/TalkBack.

**Hoàn thành khi:** từ Home thêm việc ≤3 thao tác, nhìn thấy việc hôm nay/quá hạn, sửa/hoàn tất được, không trùng với thói quen hằng ngày.

## P1 — Vị trí/bản đồ chính xác và an toàn (3–6 ngày)

- Test ngoài trời trên **2 thiết bị thật** và 2 tài khoản: cấp/từ chối quyền, GPS kém, vị trí gần đúng, map tile lỗi, pan/zoom, app nền, hết hạn, dừng/đăng xuất, mất mạng rồi kết nối lại. Trình duyệt/PWA không đảm bảo tracking nền; đừng quảng cáo theo dõi nền đáng tin cậy.
- Hiển thị người nhận, thời điểm cập nhật, ±m, expiry; popup marker dùng text thay vì HTML. Thêm nút định vị từng người và “xem tất cả” fitBounds, không tự reset camera khi polling. Kiểm tra style OpenFreeMap đang trả HTTP 200, nguồn tile thực tế và quota/attribution theo chính sách nhà cung cấp.
- Phục hồi phiên còn mở sau reload để có thể dừng; nếu từ chối GPS thì hủy phiên rỗng; ngừng watcher khi logout. Giới hạn write/thời gian/toạ độ ở **server** (client throttle không là bảo mật), xóa toạ độ ngay khi dừng; test RLS người nhận và trường hợp block.

**Hoàn thành khi:** stop/revoke không còn tọa độ sau refresh; hai máy thấy marker đúng sai số GPS, stale-state đúng; pan/zoom không bị polling chiếm lại.

## P2 — Chất lượng, vận hành và ra mắt thử (1–2 tuần)

- Deploy `process-reminders`, `delete-account` với server-only secrets, cron và VAPID; thử push trên Android/iOS thật, quiet hours, retry/dedupe. Bảo đảm in-app notifications vẫn là nguồn tin cậy khi push thất bại.
- Backup/PITR + diễn tập restore; log/alert cho Edge Functions và migration, giới hạn chi phí map/DB/push, kiểm tra accessibility và hiệu năng (JS bundle hiện >500 KB; lazy-load lịch/map/ICAL).
- Hoàn tất staging acceptance checklist `docs/deployment.md`, rồi mới cấu hình Cloudflare domain `gnouht.space`; **không sửa** DNS/tunnel/Access của `mcp.gnouht.space`. Có rollback (deploy frontend cũ và migration tương thích ngược).

**Hoàn thành khi:** CI xanh, checklist nhiều tài khoản đạt, backup restore thành công, deploy/rollback lặp lại được, không cần laptop cá nhân bật để app online.

## P3 — Mode từ màn hình chờ/màn hình khóa (nghiên cứu sau bản web ổn định)

- Trước mắt: tối ưu PWA cho thao tác 1–2 chạm từ Home Screen và shortcut trong app. PWA web **không** cung cấp widget màn hình khóa tương đương trên mọi iPhone/Android; không hứa tính năng này chỉ bằng HTML/PWA.
- Nếu cần widget/Lock Screen trên iOS hoặc widget/Quick Settings trên Android: làm native companion/bridge theo nền tảng; endpoint xác thực riêng để set mode với phiên ngắn, revoke, rate limit và xác nhận thao tác. Đánh giá chi phí phát triển và phân phối trước khi bắt đầu.

## Gợi ý sản phẩm nên thử với người dùng

1. **"Rảnh lúc nào?"** kết hợp free/busy đã được chia sẻ (không lộ chi tiết lịch), gợi ý giờ gặp cho nhóm.
2. **Lời mời theo mode**: chỉ mời chơi game/bi a khi bạn đang chia sẻ mode phù hợp và cho phép mời; không spam khi ngủ/học.
3. **Daily digest riêng tư**: việc hôm nay + lịch + lời mời chưa trả lời, không chia sẻ ra ngoài.
4. **Tự động hóa nhẹ** (sau khi có quyền rõ ràng): nhắc tắt mode lâu ngày, gợi ý tạo task từ cuộc hẹn; không tự đăng mode hay chia sẻ vị trí.

Ưu tiên nghiên cứu với 3–5 người dùng trước khi xây nhiều tính năng; đo thời gian hoàn thành tác vụ, tỷ lệ lỗi, mức hiểu quyền riêng tư, không chỉ số lượt bấm.
