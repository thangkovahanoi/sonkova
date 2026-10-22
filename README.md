# KHO XPRINTER V5 — STABLE CORE

V5 xử lý các điểm yếu chính của V4:

- RPC bán hàng/nhập hàng/chuyển kho idempotent hơn.
- Kiểm tra số tiền và phương thức thanh toán.
- Lock tồn kho khi cập nhật.
- RLS không còn mở `for all` cho mọi user.
- Có role owner/admin/manager/cashier/warehouse.
- Audit log.
- Kiểm kê kho và tự động điều chỉnh tồn.
- Sale payment ledger.
- Print Bridge mặc định localhost để giảm rủi ro.
- Không xóa sản phẩm: dùng `active=false`.
- Dashboard/POS/nhập/chuyển kho/kiểm kê/khách/NCC/kho/lịch sử/báo cáo/máy in.

## Cài web

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

## Supabase

Chạy `supabase/schema.sql` sau khi backup database. V5 schema có thể nâng từ V4 nhưng nên kiểm tra migration trên bản copy trước.

## In Xprinter

PC:
`Browser -> localhost:9100 -> Windows Print Bridge -> USB -> Xprinter N160I`

iPhone Bluetooth:
`iOS companion -> Xprinter SDK -> Bluetooth -> N160I`

Phần iOS SDK Bluetooth phải được build thành native iOS companion/PWA wrapper; trình duyệt Safari không nên được coi là có thể điều khiển trực tiếp mọi Xprinter Bluetooth.

## Production checklist

- Tạo owner account và kiểm tra role.
- Thay RLS baseline bằng policy phù hợp tổ chức.
- Backup Supabase.
- Test mất mạng/mất điện/in lại.
- Test barcode.
- Test encoding tiếng Việt.
- Test số tồn âm và race condition.
- Đổi Print Bridge sang LAN chỉ khi cần và thêm authentication.

## V5.1 - Quản lý sản phẩm

Bản V5.1 bổ sung quản lý sản phẩm hoàn chỉnh trong tab **Sản phẩm**: thêm, sửa, xóa sản phẩm mới chưa có giao dịch, ngừng kinh doanh/mở bán, SKU, barcode, nhóm hàng, đơn vị, giá vốn, giá bán, tồn tối thiểu, vị trí theo kho và in tem. Xem `docs/PRODUCT_MANAGEMENT_V5.md`.

Sau khi nâng cấp database V5 hiện tại, chạy `supabase/product_management_v5_patch.sql` một lần.
