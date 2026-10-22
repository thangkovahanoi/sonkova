# KHO XPRINTER V5 — Trả hàng khách mua

Nguồn gốc: `khosonkova(5).zip` (bản Windows người dùng cung cấp). Các phần mềm Windows Print Bridge, Supabase, bán hàng, nhập hàng, công nợ, lịch sử và mẫu hóa đơn vẫn được giữ nguyên.

## Cài đặt (bắt buộc trước khi mở tính năng)
1. Sao lưu Supabase MAIN và chạy thử trên database TEST có cùng schema, dữ liệu mẫu.
2. Kiểm tra đã áp dụng `supabase/debt_settlement_v5_patch.sql`.
3. Mở Supabase SQL Editor, chạy **duy nhất** `supabase/sales_returns_v5_patch.sql` trên TEST, kiểm thử đầy đủ rồi mới chạy trên MAIN. Patch này tạo 2 bảng trả hàng, cột `sales.returned_amount` và cập nhật RPC thanh toán nợ để trừ các phiếu trả.
4. Triển khai source `web/` như trước. Vercel: root `web`, `npm ci`, `npm run build`, output `dist`; giữ 2 biến `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Windows: giữ `web/.env.local` cũ trên máy, chạy `npm ci`, `npm run dev` và Windows Print Bridge như trước.

## Luồng nghiệp vụ
- Menu **Trả hàng**: tìm hóa đơn, chọn dòng sản phẩm, nhập số lượng, tình trạng (nguyên/đã mở), lý do, phương thức hoàn tiền, xác nhận.
- Trong **Khách hàng → Chi tiết hóa đơn** có nút **Trả hàng** chuyển sang menu mới và chọn hóa đơn.
- Hàng nguyên: nhập lại kho gốc qua `apply_stock_movement_v5`. Hàng đã mở/hỏng: ghi nhận trả nhưng không cộng tồn kho bán.
- Giá trị hoàn dựa trên giá bán gốc và chiết khấu phân bổ. Nếu hóa đơn còn nợ, giảm nợ trước; phần còn lại mới ghi **Thu chi OUT** theo ngày thực tế trả tiền. Không thay đổi số hóa đơn, `sales.total`, `sales.paid`, hay lịch sử giao dịch gốc. `returned_amount` ghi giá trị đã trả để tính số nợ còn lại.
- Lịch sử trả hàng, in phiếu trả hàng 80mm qua Windows Print Bridge.
- Chống trả vượt số đã bán, kiểm tra quyền, ghi nhận giao dịch atomically và idempotency theo request UUID.

## Giới hạn / kiểm thử cần thiết
- Chưa chạy SQL trên Supabase của bạn; chưa kiểm thử end-to-end trên dữ liệu thực. **Không áp dụng trực tiếp lên MAIN khi chưa thử TEST.**
- TypeScript `tsc -b`: PASS. Vite production build tại môi trường này bị chặn do `node_modules` gốc Windows thiếu native Rollup Linux; hãy kiểm tra `npm ci && npm run build` trên Windows/Vercel.
- In phiếu trả hàng cần Windows Print Bridge; iPhone không tự kết nối Bluetooth máy in từ Safari.
- Danh sách chọn hóa đơn hiện lấy 250 hóa đơn mới nhất; cần mở rộng tìm kiếm phân trang trên server nếu dữ liệu lớn.
- Hệ thống ghi nhận số tiền hoàn trong Thu chi, nhưng **không tự chuyển tiền ngân hàng hoặc xuất tiền mặt**. Nhân viên phải thực hiện thanh toán thực tế.
- Phiếu trả hàng chưa có quy trình duyệt riêng hoặc chứng từ thuế/hóa đơn điều chỉnh; nếu cần hóa đơn điện tử phải xử lý theo quy định riêng.

## Kịch bản kiểm thử
1. Hóa đơn trả đủ tiền, trả 1/2 sản phẩm nguyên: tồn kho tăng, Thu chi OUT, không phát sinh công nợ.
2. Hóa đơn đang nợ, trả hàng: trừ nợ trước; không hoàn tiền vượt phần khách đã trả.
3. Hàng đã mở: không tăng tồn kho.
4. Trả lần 2 vượt số lượng còn lại: RPC từ chối.
5. Thử thanh toán công nợ sau khi trả: số tiền còn nợ phải trừ `returned_amount`.
6. Gửi lại request_id: không phát sinh trả hàng, tồn kho, tiền hoàn lần thứ hai.
7. Kiểm tra báo cáo Thu chi theo ngày hoàn tiền và phiếu in trả hàng.
