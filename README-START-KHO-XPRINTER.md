# KHO XPRINTER V5 - Khởi động 1 lần bấm

## 1. Chạy thủ công bằng 1 lần bấm
Bấm đúp:
`START-KHO-XPRINTER-V5.bat`

File này sẽ:
- Kiểm tra Node.js/npm và dotnet.
- Mở Windows Print Bridge bằng `dotnet run`.
- Mở Vite bằng `npm run dev`.
- Mở trình duyệt tại `http://localhost:5173`.
- Không khởi động trùng nếu cổng 9100 hoặc 5173 đã được dùng.

## 2. Tự động chạy mỗi khi mở Windows
Bấm đúp:
`INSTALL-KHO-XPRINTER-AUTO-START.bat`

Từ lần đăng nhập Windows tiếp theo, hệ thống sẽ tự chạy KHO XPRINTER V5.

## 3. Tắt tự động khởi động
Bấm đúp:
`UNINSTALL-KHO-XPRINTER-AUTO-START.bat`

## Yêu cầu
- Windows 10/11
- Node.js + npm
- .NET SDK tương thích với project `net8.0-windows`
- Đã cài dependencies cho `web` (`npm install` trong thư mục `web` nếu cần)
- Máy in Windows đã được cài driver

## Lưu ý
Print Bridge chỉ lắng nghe `127.0.0.1:9100`, không mở cổng này ra Internet.
