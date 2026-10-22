# KHO XPRINTER V5 - Vercel Deploy

Bản này giữ nguyên source code V5 từ `khosonkova(3).zip`. Chỉ loại bỏ các thư mục/file không nên đưa lên Vercel: `web/node_modules`, `web/dist`, `web/.env.local`, `windows-print-bridge/bin`, `windows-print-bridge/obj`.

## Vercel
- Root Directory: `web`
- Framework Preset: Vite
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `dist`

## Environment Variables
Thiết lập trên Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Không upload `.env.local`.

## Quan trọng
Không chỉnh sửa `src/` giữa bản Windows và bản Vercel. Hai môi trường dùng cùng source code; chỉ khác cách chạy/deploy.
