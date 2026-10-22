# Các bước tiếp theo

1. Tạo Supabase project.
2. Chạy `supabase/schema.sql`.
3. Cài dependencies của `web`.
4. Chạy web và kiểm tra dashboard.
5. Cài Xprinter N160I trên Windows bằng driver.
6. Sửa `windows-print-bridge/appsettings.json` với đúng PrinterName.
7. Chạy bridge và mở firewall TCP 9100 trong mạng LAN.
8. Test `http://IP-WINDOWS:9100/health`.
9. Bấm "Test máy in" trên web.
10. Tích hợp Xprinter iOS SDK vào `ios-printer`.
11. Sau khi Bluetooth iPhone hoạt động, nối UI web với companion app.

## Production hardening

- Không để bridge mở Internet công khai.
- Chỉ bind LAN/VPN hoặc thêm API key.
- Thêm HTTPS nếu đi qua mạng không tin cậy.
- RLS theo user/role.
- Ghi audit log.
- Dùng database function/transaction cho nhập xuất kho để tránh race condition.
- Không lưu service-role key ở frontend.
