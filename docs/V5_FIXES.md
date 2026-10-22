# V5 FIXES / V4 ISSUES

## 1. V4 RLS quá rộng
**V4:** authenticated có thể `for all` trên nhiều bảng.  
**V5:** read vẫn cho authenticated, write chính được giới hạn theo role; nghiệp vụ quan trọng chạy qua `security definer` RPC và tự kiểm role.

## 2. Bán hàng có nguy cơ dữ liệu lệch
**V4:** sale + items + stock là nhiều call từ client.  
**V5:** `complete_sale_v5()` gom vào transaction server-side.

## 3. Idempotency
V5 kiểm tra `invoice_no`, `receipt_no`, `transfer_no` trước khi tạo lại chứng từ.

## 4. Payment validation
V5 không cho:
- paid âm
- discount/tax âm
- payment method sai
- thanh toán không khớp tổng với đơn không phải DEBT
- DEBT không có khách hàng

## 5. Inventory count
Thêm snapshot kiểm kê và điều chỉnh chênh lệch bằng stock movement.

## 6. Print Bridge
V5 mặc định bind localhost, tránh vô tình expose máy in qua LAN/Internet.

## 7. UX lỗi V4
- Nút bán sản phẩm hết tồn bị disable.
- Có trạng thái in thất bại sau khi hóa đơn đã lưu.
- Có refresh.
- Có kiểm kê.
- Có xóa toàn bộ giỏ.
- Có role foundation.

## 8. Remaining deliberate scope
Bluetooth iPhone vẫn cần native Xprinter SDK/bridge tương ứng với đúng model/firmware. Đây không nên giả lập bằng một API web không tồn tại.
