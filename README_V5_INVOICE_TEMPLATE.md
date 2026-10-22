# KHO XPRINTER V5 – Mẫu hóa đơn 80mm

Bản này bổ sung **Admin/Cài đặt → Mẫu hóa đơn 80mm**.

## Có thể chỉnh trực tiếp trên giao diện
- Tên cửa hàng, tên hộ kinh doanh, điện thoại/Zalo
- Tiêu đề hóa đơn, chân trang
- Cỡ chữ và căn chữ
- Bật/tắt SKU, số lượng, đơn giá, tạm tính, chiết khấu, phương thức thanh toán
- Bật/tắt QR MB Bank
- Đổi thứ tự các khối hóa đơn bằng nút ↑ / ↓
- Xem trước khổ 80mm

Cấu hình được lưu trên trình duyệt bằng localStorage nên không cần sửa code hoặc chạy migration Supabase.

## In Xprinter
Windows Print Bridge đã được cập nhật để nhận mẫu hóa đơn, tổng tiền, chiết khấu và QR thanh toán.

**Lưu ý:** Máy Windows cần chạy Print Bridge phiên bản đi kèm bản ZIP này. Sau khi cập nhật source Bridge, build/run lại `windows-print-bridge`.

## Cài dependency web
Trong `web` chạy:

```bash
npm install
npm run build
```

Không sử dụng `node_modules` đóng gói sẵn từ máy Windows để deploy Vercel.

## V5.1 – Fix in hóa đơn 80mm

Bản này sửa 3 lỗi khi in thực tế trên Xprinter N160II:

1. **Font tiếng Việt:** hóa đơn không còn gửi UTF-8 trực tiếp cho đầu in. Toàn bộ hóa đơn được Windows render bằng font Unicode rồi chuyển thành ảnh đen/trắng ESC/POS, nên các chữ như `HÓA ĐƠN`, `THANH TOÁN`, `Tạm tính`, `Chiết khấu`, tên hộ kinh doanh... giữ đúng dấu.
2. **QR MB Bank:** Print Bridge lấy chính ảnh VietQR động từ `QrData` và đưa vào cùng ảnh hóa đơn, thay vì gửi URL như dữ liệu QR ESC/POS. QR in ra là QR VietQR thực tế theo số tiền + nội dung chuyển khoản.
3. **Thiếu phần cuối hóa đơn:** chiều cao hóa đơn được tính động, gồm cả QR và footer; sau đó mới feed và cắt giấy, tránh mất phần thông tin cuối.

Lưu ý: bản Print Bridge mới cần được build/chạy lại trên Windows. Không cần thay đổi Supabase.
