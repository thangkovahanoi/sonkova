# KHO XPRINTER V5 - Bank QR

## Đã cấu hình
- Ngân hàng: MB Bank
- BIN: 970422
- Số tài khoản: 1313138888
- Chủ tài khoản: HO KINH DOANH SON & CHONG THAM KOVA THANG NGA

## Luồng thanh toán
1. POS chọn `Chuyển khoản`.
2. Bấm `Thanh toán & In hóa đơn`.
3. V5 tạo mã VietQR động theo đúng tổng tiền và mã hóa đơn.
4. QR hiện lớn trên màn hình.
5. Nhân viên kiểm tra giao dịch thực tế trên MB Bank.
6. Chỉ sau khi xác nhận tiền đã vào, bấm `Đã nhận tiền & hoàn tất`.
7. V5 mới gọi `complete_sale_v5` và sau đó gửi lệnh in hóa đơn.

## In hóa đơn
Hóa đơn Xprinter được bổ sung thông tin phương thức chuyển khoản, ngân hàng, số tài khoản, chủ tài khoản và nội dung tham chiếu.

## Lưu ý
- Bản này dùng VietQR Quick Link để hiển thị QR, không cần API key VietQR.
- Chưa có đối soát giao dịch ngân hàng tự động. Nhân viên vẫn phải kiểm tra tiền vào MB Bank trước khi xác nhận.
- Nếu cần tự động xác nhận tiền vào, bước tiếp theo là tích hợp Payment Confirmation/Open Banking (ví dụ payOS) qua backend/Edge Function; không đặt API secret ở frontend.


## Chiết khấu theo tỷ lệ (%)

Tại POS, trường Giảm giá được thay bằng **Chiết khấu (%)**. Hỗ trợ 0–100%, số thập phân; hệ thống tự tính số tiền chiết khấu và gửi số tiền giảm thực tế vào `complete_sale_v5`.
