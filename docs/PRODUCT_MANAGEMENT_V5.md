# V5 - Quản lý sản phẩm

V5 bổ sung module **Sản phẩm → Quản lý sản phẩm**.

## Chức năng
- Thêm sản phẩm
- Sửa sản phẩm
- Xóa sản phẩm chỉ khi chưa phát sinh giao dịch
- Ngừng kinh doanh / mở bán
- SKU, Barcode, tên hàng, nhóm hàng, đơn vị tính
- Giá vốn, giá bán, tồn tối thiểu
- Vị trí theo kho đang làm việc
- In tem bằng Print Bridge
- Hiện/ẩn sản phẩm ngừng kinh doanh

## Database patch
Chạy `supabase/product_management_v5_patch.sql` một lần trong Supabase SQL Editor sau schema V5 hiện tại.

Ba RPC được thêm:
- `manage_product_v5`
- `set_product_active_v5`
- `delete_product_v5`

`delete_product_v5` kiểm tra lịch sử trong stock movements, sales, purchases, transfers và inventory counts. Nếu đã phát sinh giao dịch, hệ thống từ chối xóa và yêu cầu dùng **Ngừng kinh doanh**.

## Barcode tự động - V5

- Sản phẩm mới để trống Barcode sẽ được database tự sinh mã nội bộ 12 số từ dải `200000000001+`.
- Barcode được sinh tại database bằng sequence, nên không bị trùng khi nhiều người cùng thêm sản phẩm.
- Nếu sửa sản phẩm cũ, Barcode hiện có được giữ nguyên.
- Có thể nhập Barcode thủ công nếu sản phẩm đã có mã của nhà sản xuất.
- Dùng file `supabase/barcode_auto_v5_patch.sql` để cập nhật database.
