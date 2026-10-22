# V5 - Chi tiết khách hàng / Lịch sử mua hàng

- Vào **Khách hàng** và chạm vào tên khách hàng để mở lịch sử hóa đơn.
- Danh sách hóa đơn đã hoàn tất của đúng khách hàng, mới nhất trước; mở từng hóa đơn để xem mặt hàng, SKU, đơn vị, số lượng, đơn giá, thành tiền.
- Tổng hợp công nợ hiện tại, số hóa đơn đã tải, tổng giá trị và số lượng sản phẩm của các hóa đơn đã tải.
- Tìm khách hàng theo tên, mã, số điện thoại; tải thêm từng 50 hóa đơn.
- Dữ liệu đọc từ các bảng Supabase hiện có: customers, sales, sale_items, products. Không cần SQL migration mới.
- Không thay đổi luồng thanh toán, kho hoặc in hóa đơn.

## Deploy Vercel
Root Directory: `web` | Install: `npm ci` | Build: `npm run build` | Output: `dist`.
Giữ nguyên `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY` trong Environment Variables.

## Lưu ý kiểm thử
Môi trường đóng gói hiện tại có `node_modules` không đầy đủ, nên `npm run build` báo thiếu type definitions của React/Babel; chưa xác nhận production build thành công. Chạy `npm ci && npm run build` trong môi trường có mạng hoặc trên Vercel để xác nhận.
