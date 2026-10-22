-- KHO XPRINTER V5
-- Hardened schema: role-based RLS, idempotent transaction RPCs, payments,
-- inventory count, soft-delete, reports, audit and print queue.

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'cashier' check (role in ('owner','admin','manager','cashier','warehouse')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  phone text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  phone text,
  address text,
  debt numeric(14,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  phone text,
  address text,
  debt numeric(14,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  barcode text unique,
  name text not null,
  category text not null default 'Khác',
  unit text not null default 'cái',
  cost_price numeric(14,2) not null default 0,
  sale_price numeric(14,2) not null default 0,
  min_stock numeric(14,3) not null default 0,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouse_stock (
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  stock_qty numeric(14,3) not null default 0,
  location text,
  primary key (warehouse_id, product_id),
  check (stock_qty >= 0)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  product_id uuid not null references public.products(id),
  movement_type text not null check (movement_type in ('IN','OUT','ADJUST','TRANSFER_IN','TRANSFER_OUT')),
  quantity numeric(14,3) not null check (quantity > 0),
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  warehouse_id uuid not null references public.warehouses(id),
  customer_id uuid references public.customers(id),
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  payment_method text not null default 'CASH' check (payment_method in ('CASH','TRANSFER','CARD','DEBT')),
  status text not null default 'COMPLETED' check (status in ('DRAFT','COMPLETED','CANCELLED')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0
);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('CASH','TRANSFER','CARD')),
  reference_no text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  warehouse_id uuid not null references public.warehouses(id),
  supplier_id uuid references public.suppliers(id),
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  status text not null default 'COMPLETED' check (status in ('DRAFT','COMPLETED','CANCELLED')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0
);

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_no text not null unique,
  from_warehouse uuid not null references public.warehouses(id),
  to_warehouse uuid not null references public.warehouses(id),
  note text,
  status text not null default 'COMPLETED' check (status in ('DRAFT','COMPLETED','CANCELLED')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (from_warehouse <> to_warehouse)
);

create table if not exists public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(14,3) not null check (quantity > 0)
);

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid references public.warehouses(id),
  customer_id uuid references public.customers(id),
  supplier_id uuid references public.suppliers(id),
  type text not null check (type in ('SALE','PURCHASE','RECEIVABLE','PAYABLE','EXPENSE','OTHER')),
  direction text not null check (direction in ('IN','OUT')),
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null default 'CASH',
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  printer_name text not null,
  connection_type text not null check (connection_type in ('BLUETOOTH','USB_BRIDGE','LAN')),
  job_type text not null check (job_type in ('TEST','RECEIPT','LABEL')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'QUEUED' check (status in ('QUEUED','PRINTED','FAILED')),
  attempts integer not null default 0,
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  printed_at timestamptz
);

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  count_no text not null unique,
  warehouse_id uuid not null references public.warehouses(id),
  status text not null default 'DRAFT' check (status in ('DRAFT','COMPLETED','CANCELLED')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.inventory_counts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  system_qty numeric(14,3) not null default 0,
  counted_qty numeric(14,3) not null default 0,
  difference_qty numeric(14,3) not null default 0,
  unique(count_id,product_id)
);

create index if not exists products_name_idx on public.products using gin (to_tsvector('simple', name));
create index if not exists products_barcode_idx on public.products(barcode);
create index if not exists stock_movement_created_idx on public.stock_movements(created_at desc);
create index if not exists sales_created_idx on public.sales(created_at desc);
create index if not exists purchases_created_idx on public.purchases(created_at desc);
create index if not exists cash_created_idx on public.cash_transactions(created_at desc);
create index if not exists audit_created_idx on public.audit_logs(created_at desc);
create index if not exists print_jobs_status_idx on public.print_jobs(status,created_at);
create index if not exists inventory_count_created_idx on public.inventory_counts(created_at desc);

-- Helper: current role
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path=public
as $$
  select coalesce((select role from public.user_profiles where user_id=auth.uid() and active), 'cashier');
$$;

-- Helper: role check
create or replace function public.has_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.current_user_role() = any(required_roles);
$$;

-- Auto profile for new auth users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.user_profiles(user_id,full_name,role)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email),'cashier')
  on conflict(user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Updated-at helper
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute procedure public.touch_updated_at();
drop trigger if exists customers_touch on public.customers;
create trigger customers_touch before update on public.customers for each row execute procedure public.touch_updated_at();
drop trigger if exists suppliers_touch on public.suppliers;
create trigger suppliers_touch before update on public.suppliers for each row execute procedure public.touch_updated_at();
drop trigger if exists warehouses_touch on public.warehouses;
create trigger warehouses_touch before update on public.warehouses for each row execute procedure public.touch_updated_at();
drop trigger if exists profiles_touch on public.user_profiles;
create trigger profiles_touch before update on public.user_profiles for each row execute procedure public.touch_updated_at();

-- RLS
do $$
declare t text;
begin
  foreach t in array array[
    'user_profiles','warehouses','customers','suppliers','products','warehouse_stock',
    'stock_movements','sales','sale_items','sale_payments','purchases','purchase_items',
    'stock_transfers','stock_transfer_items','cash_transactions','audit_logs','print_jobs',
    'inventory_counts','inventory_count_items'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Drop broad V4 policies if present.
do $$
declare t text;
begin
  foreach t in array array[
    'user_profiles','warehouses','customers','suppliers','products','warehouse_stock',
    'stock_movements','sales','sale_items','sale_payments','purchases','purchase_items',
    'stock_transfers','stock_transfer_items','cash_transactions','audit_logs','print_jobs',
    'inventory_counts','inventory_count_items'
  ] loop
    execute format('drop policy if exists "authenticated access" on public.%I',t);
    execute format('drop policy if exists "v5 read" on public.%I',t);
    execute format('drop policy if exists "v5 write" on public.%I',t);
  end loop;
end $$;

-- Read access for all authenticated users.
do $$
declare t text;
begin
  foreach t in array array[
    'user_profiles','warehouses','customers','suppliers','products','warehouse_stock',
    'stock_movements','sales','sale_items','sale_payments','purchases','purchase_items',
    'stock_transfers','stock_transfer_items','cash_transactions','audit_logs','print_jobs',
    'inventory_counts','inventory_count_items'
  ] loop
    execute format('create policy "v5 read" on public.%I for select to authenticated using (true)',t);
  end loop;
end $$;

-- Write access according to role.
create policy "v5 write profiles" on public.user_profiles for update to authenticated
using (user_id=auth.uid() or public.has_role(array['owner','admin']))
with check (user_id=auth.uid() or public.has_role(array['owner','admin']));

create policy "v5 write products" on public.products for insert to authenticated
with check (public.has_role(array['owner','admin','manager']));
create policy "v5 update products" on public.products for update to authenticated
using (public.has_role(array['owner','admin','manager']))
with check (public.has_role(array['owner','admin','manager']));

create policy "v5 write masters" on public.customers for insert to authenticated with check (public.has_role(array['owner','admin','manager','cashier']));
create policy "v5 update masters" on public.customers for update to authenticated using (public.has_role(array['owner','admin','manager','cashier'])) with check (public.has_role(array['owner','admin','manager','cashier']));
create policy "v5 write suppliers" on public.suppliers for insert to authenticated with check (public.has_role(array['owner','admin','manager','warehouse']));
create policy "v5 update suppliers" on public.suppliers for update to authenticated using (public.has_role(array['owner','admin','manager','warehouse'])) with check (public.has_role(array['owner','admin','manager','warehouse']));

create policy "v5 write warehouses" on public.warehouses for insert to authenticated with check (public.has_role(array['owner','admin','manager']));
create policy "v5 update warehouses" on public.warehouses for update to authenticated using (public.has_role(array['owner','admin','manager'])) with check (public.has_role(array['owner','admin','manager']));

create policy "v5 write print jobs" on public.print_jobs for insert to authenticated with check (true);
create policy "v5 update print jobs" on public.print_jobs for update to authenticated using (public.has_role(array['owner','admin','manager','cashier'])) with check (true);

-- Transaction functions do their own authorization.
create or replace function public.assert_operational_role(allowed text[])
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.has_role(allowed) then raise exception 'permission denied'; end if;
end $$;

-- Stock movement with row lock.
create or replace function public.apply_stock_movement_v5(
  p_warehouse_id uuid,p_product_id uuid,p_movement_type text,p_quantity numeric,
  p_reference_type text default null,p_reference_id uuid default null,p_note text default null
) returns public.warehouse_stock
language plpgsql security definer set search_path=public
as $$
declare s public.warehouse_stock; next_qty numeric;
begin
  perform public.assert_operational_role(array['owner','admin','manager','warehouse','cashier']);
  if p_quantity<=0 then raise exception 'quantity must be > 0'; end if;
  if p_movement_type not in ('IN','OUT','ADJUST') then raise exception 'invalid movement_type'; end if;

  select * into s from public.warehouse_stock
  where warehouse_id=p_warehouse_id and product_id=p_product_id for update;

  if not found then
    insert into public.warehouse_stock(warehouse_id,product_id,stock_qty)
    values(p_warehouse_id,p_product_id,0) returning * into s;
  end if;

  if p_movement_type='IN' then next_qty=s.stock_qty+p_quantity;
  elsif p_movement_type='OUT' then
    next_qty=s.stock_qty-p_quantity;
    if next_qty<0 then raise exception 'not enough stock'; end if;
  else next_qty=p_quantity; end if;

  update public.warehouse_stock set stock_qty=next_qty
  where warehouse_id=p_warehouse_id and product_id=p_product_id
  returning * into s;

  insert into public.stock_movements(warehouse_id,product_id,movement_type,quantity,reference_type,reference_id,note,created_by)
  values(p_warehouse_id,p_product_id,p_movement_type,p_quantity,p_reference_type,p_reference_id,p_note,auth.uid());

  return s;
end $$;
grant execute on function public.apply_stock_movement_v5(uuid,uuid,text,numeric,text,uuid,text) to authenticated;

-- Complete sale, with strict payment validation and idempotent invoice number.
create or replace function public.complete_sale_v5(
  p_invoice_no text,p_warehouse_id uuid,p_customer_id uuid,p_items jsonb,
  p_discount numeric default 0,p_tax numeric default 0,p_paid numeric default 0,
  p_payment_method text default 'CASH',p_note text default null
) returns public.sales
language plpgsql security definer set search_path=public
as $$
declare
  sale public.sales; existing public.sales; item jsonb; product_id uuid; qty numeric;
  unit_price numeric; line_discount numeric; line_total numeric; subtotal numeric:=0; final_total numeric;
begin
  perform public.assert_operational_role(array['owner','admin','manager','cashier']);
  if p_discount<0 or p_tax<0 or p_paid<0 then raise exception 'invalid money value'; end if;
  if p_payment_method not in ('CASH','TRANSFER','CARD','DEBT') then raise exception 'invalid payment method'; end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'empty cart'; end if;

  select * into existing from public.sales where invoice_no=p_invoice_no;
  if found then return existing; end if;

  insert into public.sales(invoice_no,warehouse_id,customer_id,discount,tax,paid,payment_method,note,status,created_by)
  values(p_invoice_no,p_warehouse_id,p_customer_id,p_discount,p_tax,p_paid,p_payment_method,p_note,'COMPLETED',auth.uid())
  returning * into sale;

  for item in select * from jsonb_array_elements(p_items) loop
    product_id:=(item->>'product_id')::uuid;
    qty:=(item->>'quantity')::numeric;
    unit_price:=(item->>'unit_price')::numeric;
    line_discount:=coalesce((item->>'discount')::numeric,0);
    if qty<=0 or unit_price<0 or line_discount<0 then raise exception 'invalid line'; end if;
    line_total:=greatest(0,qty*unit_price-line_discount);
    subtotal:=subtotal+line_total;

    insert into public.sale_items(sale_id,product_id,quantity,unit_price,discount,line_total)
    values(sale.id,product_id,qty,unit_price,line_discount,line_total);

    perform public.apply_stock_movement_v5(p_warehouse_id,product_id,'OUT',qty,'SALE',sale.id,p_invoice_no);
  end loop;

  final_total:=greatest(0,subtotal-p_discount+p_tax);
  if p_payment_method='DEBT' and p_customer_id is null then raise exception 'DEBT requires customer'; end if;
  if p_payment_method<>'DEBT' and p_paid<>final_total then raise exception 'paid amount must equal total'; end if;
  if p_payment_method='DEBT' and p_paid>final_total then raise exception 'invalid debt payment'; end if;

  update public.sales set subtotal=subtotal,total=final_total where id=sale.id returning * into sale;

  if p_paid>0 then
    insert into public.sale_payments(sale_id,amount,method,created_by)
    values(sale.id,p_paid,case when p_payment_method='DEBT' then 'CASH' else p_payment_method end,auth.uid());
    insert into public.cash_transactions(warehouse_id,customer_id,type,direction,amount,payment_method,reference_type,reference_id,note,created_by)
    values(p_warehouse_id,p_customer_id,'SALE','IN',p_paid,p_payment_method,'SALE',sale.id,p_invoice_no,auth.uid());
  end if;

  if p_customer_id is not null and final_total>p_paid then
    update public.customers set debt=debt+(final_total-p_paid),updated_at=now() where id=p_customer_id;
  end if;

  insert into public.audit_logs(user_id,action,entity,entity_id,detail)
  values(auth.uid(),'CREATE','SALE',sale.id::text,jsonb_build_object('invoice_no',p_invoice_no,'total',final_total));

  return sale;
end $$;
grant execute on function public.complete_sale_v5(text,uuid,uuid,jsonb,numeric,numeric,numeric,text,text) to authenticated;

-- Complete purchase.
create or replace function public.complete_purchase_v5(
  p_receipt_no text,p_warehouse_id uuid,p_supplier_id uuid,p_items jsonb,
  p_discount numeric default 0,p_paid numeric default 0,p_note text default null
) returns public.purchases
language plpgsql security definer set search_path=public
as $$
declare pur public.purchases; existing public.purchases; item jsonb; product_id uuid; qty numeric;
unit_cost numeric; line_discount numeric; line_total numeric; subtotal numeric:=0; final_total numeric;
begin
  perform public.assert_operational_role(array['owner','admin','manager','warehouse']);
  if p_discount<0 or p_paid<0 then raise exception 'invalid money value'; end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'empty purchase'; end if;
  select * into existing from public.purchases where receipt_no=p_receipt_no;
  if found then return existing; end if;

  insert into public.purchases(receipt_no,warehouse_id,supplier_id,discount,paid,note,status,created_by)
  values(p_receipt_no,p_warehouse_id,p_supplier_id,p_discount,p_paid,p_note,'COMPLETED',auth.uid())
  returning * into pur;

  for item in select * from jsonb_array_elements(p_items) loop
    product_id:=(item->>'product_id')::uuid; qty:=(item->>'quantity')::numeric;
    unit_cost:=(item->>'unit_cost')::numeric; line_discount:=coalesce((item->>'discount')::numeric,0);
    if qty<=0 or unit_cost<0 or line_discount<0 then raise exception 'invalid purchase line'; end if;
    line_total:=greatest(0,qty*unit_cost-line_discount); subtotal:=subtotal+line_total;
    insert into public.purchase_items(purchase_id,product_id,quantity,unit_cost,discount,line_total)
    values(pur.id,product_id,qty,unit_cost,line_discount,line_total);
    perform public.apply_stock_movement_v5(p_warehouse_id,product_id,'IN',qty,'PURCHASE',pur.id,p_receipt_no);
  end loop;

  final_total:=greatest(0,subtotal-p_discount);
  if p_paid>final_total then raise exception 'paid exceeds total'; end if;
  update public.purchases set subtotal=subtotal,total=final_total where id=pur.id returning * into pur;

  if p_paid>0 then
    insert into public.cash_transactions(warehouse_id,supplier_id,type,direction,amount,payment_method,reference_type,reference_id,note,created_by)
    values(p_warehouse_id,p_supplier_id,'PURCHASE','OUT',p_paid,'CASH','PURCHASE',pur.id,p_receipt_no,auth.uid());
  end if;
  if p_supplier_id is not null and final_total>p_paid then
    update public.suppliers set debt=debt+(final_total-p_paid),updated_at=now() where id=p_supplier_id;
  end if;

  insert into public.audit_logs(user_id,action,entity,entity_id,detail)
  values(auth.uid(),'CREATE','PURCHASE',pur.id::text,jsonb_build_object('receipt_no',p_receipt_no,'total',final_total));
  return pur;
end $$;
grant execute on function public.complete_purchase_v5(text,uuid,uuid,jsonb,numeric,numeric,text) to authenticated;

-- Transfer
create or replace function public.complete_transfer_v5(
  p_transfer_no text,p_from_warehouse uuid,p_to_warehouse uuid,p_items jsonb,p_note text default null
) returns public.stock_transfers
language plpgsql security definer set search_path=public
as $$
declare tr public.stock_transfers; existing public.stock_transfers; item jsonb; product_id uuid; qty numeric;
begin
  perform public.assert_operational_role(array['owner','admin','manager','warehouse']);
  if p_from_warehouse=p_to_warehouse then raise exception 'warehouses must differ'; end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'empty transfer'; end if;
  select * into existing from public.stock_transfers where transfer_no=p_transfer_no;
  if found then return existing; end if;

  insert into public.stock_transfers(transfer_no,from_warehouse,to_warehouse,note,status,created_by)
  values(p_transfer_no,p_from_warehouse,p_to_warehouse,p_note,'COMPLETED',auth.uid())
  returning * into tr;

  for item in select * from jsonb_array_elements(p_items) loop
    product_id:=(item->>'product_id')::uuid; qty:=(item->>'quantity')::numeric;
    if qty<=0 then raise exception 'invalid transfer quantity'; end if;
    insert into public.stock_transfer_items(transfer_id,product_id,quantity) values(tr.id,product_id,qty);
    perform public.apply_stock_movement_v5(p_from_warehouse,product_id,'OUT',qty,'TRANSFER',tr.id,p_transfer_no);
    perform public.apply_stock_movement_v5(p_to_warehouse,product_id,'IN',qty,'TRANSFER',tr.id,p_transfer_no);
  end loop;

  insert into public.audit_logs(user_id,action,entity,entity_id,detail)
  values(auth.uid(),'CREATE','TRANSFER',tr.id::text,jsonb_build_object('transfer_no',p_transfer_no));
  return tr;
end $$;
grant execute on function public.complete_transfer_v5(text,uuid,uuid,jsonb,text) to authenticated;

-- Inventory count: creates snapshot, then completion applies differences.
create or replace function public.start_inventory_count_v5(p_count_no text,p_warehouse_id uuid,p_note text default null)
returns public.inventory_counts
language plpgsql security definer set search_path=public
as $$
declare c public.inventory_counts; p record;
begin
  perform public.assert_operational_role(array['owner','admin','manager','warehouse']);
  insert into public.inventory_counts(count_no,warehouse_id,note,created_by)
  values(p_count_no,p_warehouse_id,p_note,auth.uid()) returning * into c;
  for p in select product_id,stock_qty from public.warehouse_stock where warehouse_id=p_warehouse_id loop
    insert into public.inventory_count_items(count_id,product_id,system_qty,counted_qty,difference_qty)
    values(c.id,p.product_id,p.stock_qty,p.stock_qty,0);
  end loop;
  return c;
end $$;
grant execute on function public.start_inventory_count_v5(text,uuid,text) to authenticated;

create or replace function public.complete_inventory_count_v5(p_count_id uuid)
returns public.inventory_counts
language plpgsql security definer set search_path=public
as $$
declare c public.inventory_counts; i record; delta numeric;
begin
  perform public.assert_operational_role(array['owner','admin','manager','warehouse']);
  select * into c from public.inventory_counts where id=p_count_id for update;
  if not found then raise exception 'count not found'; end if;
  if c.status<>'DRAFT' then return c; end if;

  for i in select * from public.inventory_count_items where count_id=p_count_id loop
    delta:=i.counted_qty-i.system_qty;
    if delta>0 then
      perform public.apply_stock_movement_v5(c.warehouse_id,i.product_id,'IN',delta,'INVENTORY_COUNT',c.id,c.count_no);
    elsif delta<0 then
      perform public.apply_stock_movement_v5(c.warehouse_id,i.product_id,'OUT',abs(delta),'INVENTORY_COUNT',c.id,c.count_no);
    end if;
    update public.inventory_count_items set difference_qty=delta where id=i.id;
  end loop;
  update public.inventory_counts set status='COMPLETED',completed_at=now() where id=c.id returning * into c;
  insert into public.audit_logs(user_id,action,entity,entity_id,detail)
  values(auth.uid(),'COMPLETE','INVENTORY_COUNT',c.id::text,jsonb_build_object('count_no',c.count_no));
  return c;
end $$;
grant execute on function public.complete_inventory_count_v5(uuid) to authenticated;

-- Reports
create or replace view public.daily_sales_report as
select date_trunc('day',created_at)::date as sales_day,
count(*) filter(where status='COMPLETED') invoices,
coalesce(sum(total) filter(where status='COMPLETED'),0) revenue,
coalesce(sum(paid) filter(where status='COMPLETED'),0) paid
from public.sales group by 1 order by 1 desc;

create or replace view public.product_sales_report as
select si.product_id,p.sku,p.name,sum(si.quantity) qty_sold,sum(si.line_total) revenue
from public.sale_items si join public.sales s on s.id=si.sale_id and s.status='COMPLETED'
join public.products p on p.id=si.product_id group by si.product_id,p.sku,p.name order by qty_sold desc;

create or replace view public.inventory_value_report as
select w.id warehouse_id,w.code warehouse_code,w.name warehouse_name,
coalesce(sum(ws.stock_qty),0) total_units,
coalesce(sum(ws.stock_qty*p.cost_price),0) inventory_cost
from public.warehouses w
left join public.warehouse_stock ws on ws.warehouse_id=w.id
left join public.products p on p.id=ws.product_id
group by w.id,w.code,w.name;

grant select on public.daily_sales_report,public.product_sales_report,public.inventory_value_report to authenticated;

-- Seed
insert into public.warehouses(code,name,address,is_default) values('KHO-01','Kho chính','Việt Nam',true)
on conflict(code) do nothing;
insert into public.customers(code,name) values('KH-LE','Khách lẻ') on conflict(code) do nothing;
insert into public.suppliers(code,name) values('NCC-DEFAULT','Nhà cung cấp mặc định') on conflict(code) do nothing;
insert into public.products(sku,barcode,name,category,unit,cost_price,sale_price,min_stock)
values
('KOVA-KV551OW','893000000001','Sơn KOVA KV551OW','Sơn KOVA','thùng',420000,480000,5),
('KOVA-CT04T','893000000002','KOVA CT04T Gold 20kg','Sơn KOVA','thùng',390000,450000,8),
('KOVA-K360','893000000003','KOVA K360 Gold 20kg','Sơn KOVA','thùng',410000,470000,5)
on conflict(sku) do nothing;

insert into public.warehouse_stock(warehouse_id,product_id,stock_qty,location)
select w.id,p.id,
case p.sku when 'KOVA-KV551OW' then 24 when 'KOVA-CT04T' then 7 else 16 end,
case p.sku when 'KOVA-KV551OW' then 'Kệ A1' when 'KOVA-CT04T' then 'Kệ A2' else 'Kệ A3' end
from public.warehouses w cross join public.products p where w.code='KHO-01'
on conflict(warehouse_id,product_id) do nothing;
-- KHO XPRINTER V5 - Product Management patch
-- Run this once in Supabase SQL Editor after the base V5 schema.

-- KHO XPRINTER V5 - tự sinh Barcode nội bộ cho sản phẩm mới
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
  if v_barcode is null then
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
