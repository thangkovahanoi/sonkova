-- KHO XPRINTER V5 - Product Management patch
-- Run this once in Supabase SQL Editor after the base V5 schema.

-- Tự sinh Barcode nội bộ 12 số cho sản phẩm mới.
-- Dải 200000000001+ dành riêng cho KHO XPRINTER, tránh nhầm với mã GTIN/EAN.
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
set search_path=public
as $$
  select lpad(nextval('public.product_barcode_seq')::text, 12, '0');
$$;

grant execute on function public.next_product_barcode_v5() to authenticated;

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
set search_path=public
as $$
declare
  v_product public.products;
  v_sku text := nullif(trim(p_sku), '');
  v_barcode text := nullif(trim(coalesce(p_barcode,'')), '');
  v_generated_barcode text;
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
  if v_sku is null then raise exception 'SKU không được để trống'; end if;
  if p_product_id is null and v_barcode is null then
    v_generated_barcode := public.next_product_barcode_v5();
    v_barcode := v_generated_barcode;
  end if;
  if v_name is null then raise exception 'Tên hàng không được để trống'; end if;
  if length(v_sku) > 80 then raise exception 'SKU quá dài'; end if;
  if v_barcode is not null and length(v_barcode) > 80 then raise exception 'Barcode quá dài'; end if;

  if p_product_id is null then
    insert into public.products(sku,barcode,name,category,unit,cost_price,sale_price,min_stock,active)
    values(v_sku,v_barcode,v_name,v_category,v_unit,v_cost,v_sale,v_min,coalesce(p_active,true))
    returning * into v_product;
    insert into public.audit_logs(user_id,action,entity,entity_id,detail)
    values(auth.uid(),'CREATE','products',v_product.id::text,jsonb_build_object('sku',v_product.sku,'name',v_product.name));
  else
    update public.products
    set sku=v_sku, barcode=v_barcode, name=v_name, category=v_category, unit=v_unit,
        cost_price=v_cost, sale_price=v_sale, min_stock=v_min, active=coalesce(p_active,true)
    where id=p_product_id
    returning * into v_product;
    if not found then raise exception 'Không tìm thấy sản phẩm'; end if;
    insert into public.audit_logs(user_id,action,entity,entity_id,detail)
    values(auth.uid(),'UPDATE','products',v_product.id::text,jsonb_build_object('sku',v_product.sku,'name',v_product.name,'active',v_product.active));
  end if;

  if p_warehouse_id is not null then
    insert into public.warehouse_stock(warehouse_id,product_id,stock_qty,location)
    values(p_warehouse_id,v_product.id,0,nullif(trim(coalesce(p_location,'')),''))
    on conflict(warehouse_id,product_id) do update
      set location=excluded.location;
  end if;

  return v_product;
exception
  when unique_violation then
    raise exception 'SKU hoặc Barcode đã tồn tại';
end;
$$;

grant execute on function public.manage_product_v5(uuid,text,text,text,text,text,numeric,numeric,numeric,boolean,uuid,text) to authenticated;

create or replace function public.set_product_active_v5(
  p_product_id uuid,
  p_active boolean
) returns public.products
language plpgsql
security definer
set search_path=public
as $$
declare v_product public.products;
begin
  if not public.has_role(array['owner','admin','manager']) then raise exception 'permission denied'; end if;
  update public.products set active=p_active where id=p_product_id returning * into v_product;
  if not found then raise exception 'Không tìm thấy sản phẩm'; end if;
  insert into public.audit_logs(user_id,action,entity,entity_id,detail)
  values(auth.uid(),case when p_active then 'ACTIVATE' else 'DEACTIVATE' end,'products',v_product.id::text,jsonb_build_object('sku',v_product.sku,'active',p_active));
  return v_product;
end;
$$;

grant execute on function public.set_product_active_v5(uuid,boolean) to authenticated;

create or replace function public.delete_product_v5(
  p_product_id uuid
) returns public.products
language plpgsql
security definer
set search_path=public
as $$
declare v_product public.products;
  v_has_history boolean;
begin
  if not public.has_role(array['owner','admin','manager']) then raise exception 'permission denied'; end if;
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'Không tìm thấy sản phẩm'; end if;

  select exists(select 1 from public.stock_movements where product_id=p_product_id)
      or exists(select 1 from public.sale_items where product_id=p_product_id)
      or exists(select 1 from public.purchase_items where product_id=p_product_id)
      or exists(select 1 from public.stock_transfer_items where product_id=p_product_id)
      or exists(select 1 from public.inventory_count_items where product_id=p_product_id)
    into v_has_history;

  if v_has_history then
    raise exception 'Không thể xóa sản phẩm đã phát sinh giao dịch. Hãy chọn Ngừng kinh doanh.';
  end if;
  if exists(select 1 from public.warehouse_stock where product_id=p_product_id and stock_qty <> 0) then
    raise exception 'Không thể xóa sản phẩm còn tồn kho. Hãy đưa tồn về 0 hoặc dùng Ngừng kinh doanh.';
  end if;

  delete from public.warehouse_stock where product_id=p_product_id;
  delete from public.products where id=p_product_id;
  insert into public.audit_logs(user_id,action,entity,entity_id,detail)
  values(auth.uid(),'DELETE','products',p_product_id::text,jsonb_build_object('sku',v_product.sku,'name',v_product.name));
  return v_product;
end;
$$;

grant execute on function public.delete_product_v5(uuid) to authenticated;
