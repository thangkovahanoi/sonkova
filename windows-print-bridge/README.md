# Windows Print Bridge V5

Mục tiêu: Web/PWA trên PC gửi lệnh qua HTTP localhost tới Windows Print Bridge, sau đó in RAW ESC/POS vào Xprinter.

## Bảo mật
V5 mặc định bind `127.0.0.1:9100` để tránh mở máy in ra LAN/Internet ngoài ý muốn.
Nếu cần dùng nhiều máy trong LAN, hãy đổi ListenUrl thành IP LAN cụ thể và thêm allowlist/auth trước production.

## Endpoints
- GET /health
- POST /print/test
- POST /print/receipt
- POST /print/label
- POST /print/raw

## Chạy
```powershell
dotnet run
```

Đổi `PrinterName` trong appsettings.json theo đúng tên máy in Windows. Với máy trong ảnh của anh, nếu Windows hiển thị là `N160II` thì có thể dùng nguyên cấu hình mặc định.


## V5.1 - Xprinter + máy in A4
- `GET /printers` trả về danh sách máy in Windows và máy mặc định.
- `POST /print/receipt` nhận `printerName` và `mode` (`thermal` hoặc `a4`).
- `thermal`: gửi RAW ESC/POS, phù hợp Xprinter/POS 58-80mm.
- `a4`: dùng Windows Print Spooler/PrintDocument để in bố cục A4, phù hợp Canon/HP/Brother/Epson...
- `POST /print/test` cũng nhận `printerName` + `mode`.
- Giao diện KHO XPRINTER có mục Cài đặt → Máy in Windows để chọn máy in hóa đơn/phiếu, kiểu in và máy in tem.


## Xử lý lỗi V5
- Giao diện không còn hiển thị `TypeError: Failed to fetch` nguyên bản; sẽ hướng dẫn kiểm tra Print Bridge.
- Màn hình quét barcode tự phát hiện thiết bị camera. Nếu máy tính không có webcam hoặc camera bị chặn, có ô nhập hỗ trợ máy quét barcode USB kiểu bàn phím.
- Print Bridge mặc định chỉ cho phép origin localhost/127.0.0.1 và các origin được khai báo trong `AllowedOrigins`. Không mở cổng 9100 ra Internet.
