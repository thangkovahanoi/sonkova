# Barcode Auto FIX

Bản này giữ nguyên KHO XPRINTER V5 + Bank QR, không dùng V5.2.

## Sửa lỗi
- Tự sinh Barcode 12 số khi tạo sản phẩm mới và để trống Barcode.
- Tự bổ sung Barcode cho sản phẩm cũ đang NULL/trống.
- Không thay đổi Barcode thủ công đã có.

## SQL
Chạy toàn bộ `supabase/barcode_auto_v5_patch.sql` trong Supabase SQL Editor.
Sau đó tải lại trang KHO XPRINTER.
