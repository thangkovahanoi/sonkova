# KHO XPRINTER V5.3 – Printer + Barcode hoàn chỉnh

## Đã sửa
- N160II 80mm: cấu hình mặc định `N160II`, chế độ ESC/POS RAW.
- Máy in A4: Windows Print Spooler.
- Cài đặt → Máy in: quét danh sách máy in Windows, chọn máy in hóa đơn/phiếu, kiểu in và máy in tem.
- Print Bridge có `/health`, `/printers`, `/printer-status` và thông báo lỗi rõ ràng.
- Barcode scanner: camera nếu có; nếu không có camera hoặc bị chặn, hiển thị ô quét bằng USB scanner/nhập mã.
- Không còn hiện lỗi kỹ thuật `TypeError: Failed to fetch` nguyên bản trong giao diện; sẽ hiển thị hướng dẫn kiểm tra Bridge.

## Chạy 1 lần
Bấm `START-KHO-XPRINTER-V5.bat`.

## Máy N160II
1. Cắm USB-B → USB vào Windows.
2. Cài driver để máy xuất hiện trong Printers & scanners.
3. Vào KHO → Cài đặt → Máy in → Quét lại máy in.
4. Chọn N160II → Xprinter / ESC-POS (58/80mm) → Lưu.
5. Vào Máy in → Kiểm tra Bridge → In test.
