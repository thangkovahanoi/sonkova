-- =========================================================
-- KHO XPRINTER V5 - TỰ ĐỘNG SINH BARCODE
-- Chạy 1 lần trong Supabase > SQL Editor > Run
-- Không dùng V5.2 / payOS
-- =========================================================

create sequence if not exists public.product_barcode_seq
  start with 200000000001
  increment by 1
  minvalue 200000000001
  no maxvalue
  cache 1;

create or replace function public.next_product_barcode_v5()
returns text
language sql
security definer
set search_path = public
as $$
  select lpad(nextval('public.product_barcode_seq')::text, 12, '0');
$$;

grant execute on function public.next_product_barcode_v5() to authenticated;

-- Cập nhật function quản lý sản phẩm:
-- Nếu thêm sản phẩm mới hoặc sản phẩm cũ đang thiếu Barcode, hệ thống tự sinh mã 12 số.
-- Nếu người dùng nhập Barcode hợp lệ thì giữ nguyên.
create or replace function public.manage_product_v5(
  p_product_id uuid default null,
  p_sku text default null,
  p_barcode text default null,
  p_name text default null,
  p_category text default 'Khác',
  p_unit text default 'cái',
  p_cost_price numeric default 0,
  p_sale_price numeric default 0,
  p_min_stock numeric default 0,
  p_active boolean default true,
  p_warehouse_id uuid default null,
  p_location text default null
) returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
  v_sku text := nullif(trim(p_sku), '');
  v_barcode text := nullif(trim(coalesce(p_barcode,'')), '');
  v_name text := nullif(trim(p_name), '');
  v_category text := coalesce(nullif(trim(p_category),''), 'Khác');
  v_unit text := coalesce(nullif(trim(p_unit),''), 'cái');
  v_cost numeric := greatest(coalesce(p_cost_price,0),0);
  v_sale numeric := greatest(coalesce(p_sale_price,0),0);
  v_min numeric := greatest(coalesce(p_min_stock,0),0);
begin
  if not public.has_role(array['owner','admin','manager']) then
    raise exception 'permission denied';
  end if;

  if v_sku is null then
    raise exception 'SKU không được để trống';
  end if;

  if v_name is null then
    raise exception 'Tên hàng không được để trống';
  end if;

  if length(v_sku) > 80 then
    raise exception 'SKU quá dài';
  end if;

  if v_barcode is not null and length(v_barcode) > 80 then
    raise exception 'Barcode quá dài';
  end if;

  -- TỰ ĐỘNG SINH BARCODE: áp dụng cho cả sản phẩm mới và sản phẩm cũ
  -- đang bị NULL/để trống Barcode.
  -- Nếu người dùng nhập Barcode thủ công thì giữ nguyên.
  if v_barcode is null then
    v_barcode := public.next_product_barcode_v5();
  end if;

  if p_product_id is null then
    insert into public.products(
      sku, barcode, name, category, unit,
      cost_price, sale_price, min_stock, active
    )
    values(
      v_sku, v_barcode, v_name, v_category, v_unit,
      v_cost, v_sale, v_min, coalesce(p_active,true)
    )
    returning * into v_product;

    insert into public.audit_logs(
      user_id, action, entity, entity_id, detail
    )
    values(
      auth.uid(), 'CREATE', 'products', v_product.id::text,
      jsonb_build_object(
        'sku', v_product.sku,
        'barcode', v_product.barcode,
        'name', v_product.name
      )
    );
  else
    update public.products
    set
      sku = v_sku,
      barcode = v_barcode,
      name = v_name,
      category = v_category,
      unit = v_unit,
      cost_price = v_cost,
      sale_price = v_sale,
      min_stock = v_min,
      active = coalesce(p_active,true),
      updated_at = now()
    where id = p_product_id
    returning * into v_product;

    if not found then
      raise exception 'Không tìm thấy sản phẩm';
    end if;

    insert into public.audit_logs(
      user_id, action, entity, entity_id, detail
    )
    values(
      auth.uid(), 'UPDATE', 'products', v_product.id::text,
      jsonb_build_object(
        'sku', v_product.sku,
        'barcode', v_product.barcode,
        'name', v_product.name,
        'active', v_product.active
      )
    );
  end if;

  if p_warehouse_id is not null then
    insert into public.warehouse_stock(
      warehouse_id, product_id, stock_qty, location
    )
    values(
      p_warehouse_id,
      v_product.id,
      0,
      nullif(trim(coalesce(p_location,'')),'')
    )
    on conflict(warehouse_id,product_id)
    do update set location = excluded.location;
  end if;

  return v_product;

exception
  when unique_violation then
    raise exception 'SKU hoặc Barcode đã tồn tại';
end;
$$;

grant execute on function public.manage_product_v5(
  uuid,text,text,text,text,text,numeric,numeric,numeric,boolean,uuid,text
) to authenticated;

-- Kiểm tra nhanh:
-- select public.next_product_barcode_v5();
-- Không cần chạy dòng trên nếu không muốn tiêu hao một mã.


-- =========================================================
-- 3. BỔ SUNG BARCODE CHO CÁC SẢN PHẨM CŨ ĐANG BỊ TRỐNG
-- Chạy phần này sau khi tạo function ở trên.
-- =========================================================
update public.products
set barcode = public.next_product_barcode_v5(),
    updated_at = now()
where barcode is null or btrim(barcode) = '';

-- Kiểm tra các sản phẩm còn thiếu Barcode
select id, sku, name, barcode
from public.products
where barcode is null or btrim(barcode) = ''
order by sku;
