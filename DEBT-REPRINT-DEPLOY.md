# KHO XPRINTER V5 — Thanh toán công nợ & In lại hóa đơn

## Chức năng

- **Khách hàng → chọn khách hàng → mở hóa đơn còn nợ → Đã thanh toán / Thu công nợ.** Nhập số tiền đã nhận (một phần/toàn bộ) và phương thức thanh toán. Hóa đơn cập nhật `sales.paid`, `customers.debt`, ghi `sale_payments`, `cash_transactions` (RECEIVABLE/IN), `audit_logs`.
- **Nhà cung cấp → chọn NCC → mở phiếu nhập còn nợ → Thanh toán NCC.** Nhập số tiền đã trả, cập nhật `purchases.paid`, `suppliers.debt`, ghi `cash_transactions` (PAYABLE/OUT) và `audit_logs`.
- **Khách hàng → mở hóa đơn → In lại hóa đơn.** In từ `sales` và `sale_items` đã lưu; không gọi checkout, không sửa kho, không tạo doanh thu/công nợ mới. Sử dụng Windows Print Bridge và mẫu in V5 hiện tại.
- Mỗi lần trả nợ có thời điểm thu/chi riêng, **không sửa ngày gốc** của phiếu nhập/hóa đơn. Thu chi theo ngày ghi nhận thanh toán, không gộp vào ngày nhập cũ.

## Cài đặt bắt buộc

1. **Sao lưu Supabase MAIN** và kiểm tra tên bảng/cột/RPC với database thực tế.
2. Chạy **duy nhất** `supabase/debt_settlement_v5_patch.sql` trong Supabase SQL Editor của đúng project sau khi kiểm tra. Script tạo bảng `debt_payment_requests` và RPC `settle_debt_v5`; không chạy lại `schema.sql`, không reset dữ liệu.
3. Deploy source Vercel: Root Directory `web`, Install `npm ci`, Build `npm run build`, Output `dist`; giữ `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Test trên dữ liệu thử: hóa đơn 100.000đ còn nợ → thu 40.000đ → còn 60.000đ → thu 60.000đ → hết nợ. Thử tương tự phiếu nhập NCC. Kiểm tra ngày phát sinh trong Thu chi, thử gửi lại cùng request ID, thử thanh toán vượt dư nợ.
5. In lại cần Windows Print Bridge đang chạy trên máy tính kết nối máy in. **Vercel trên iPhone không thể dùng Windows localhost Print Bridge để in Bluetooth trực tiếp.**

## An toàn

- Không xác nhận tiền tự động: chỉ bấm xác nhận sau khi đã nhận/trả tiền thật.
- Thanh toán chỉ theo hóa đơn/phiếu nhập đã hoàn tất; RPC kiểm tra role, khóa bản ghi, ngăn trả vượt dư nợ và retry trùng qua `p_request_id`.
- Nếu `customers.debt` hoặc `suppliers.debt` đã lệch với số dư chứng từ, RPC từ chối thay vì tự ý sửa số liệu. Cần đối chiếu trước.
- Chưa kiểm chứng thực thi SQL trên Supabase thật. **Không chạy trên MAIN trước khi kiểm thử trên TEST/local.**
