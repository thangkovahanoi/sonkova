-- KHO XPRINTER V5: nhập hàng và công nợ NCC theo ngày.
-- Cho phép chọn ngày nhập, và không cộng dồn công nợ hiển thị theo ngày.

create or replace function public.complete_purchase_v5(
  p_receipt_no text,
  p_warehouse_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_purchase_date date,
  p_discount numeric default 0,
  p_paid numeric default 0,
  p_note text default null
) returns public.purchases
language plpgsql security definer set search_path=public
as $$
declare
  pur public.purchases;
  existing public.purchases;
  item jsonb;
  product_id uuid;
  qty numeric;
  unit_cost numeric;
  line_discount numeric;
  line_total numeric;
  v_subtotal numeric := 0;
  v_final_total numeric;
  v_created_at timestamptz;
begin
  perform public.assert_operational_role(array['owner','admin','manager','warehouse']);
  if p_discount < 0 or p_paid < 0 then raise exception 'invalid money value'; end if;
  if p_purchase_date is null then raise exception 'purchase date is required'; end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then raise exception 'empty purchase'; end if;

  select * into existing from public.purchases where receipt_no = p_receipt_no;
  if found then return existing; end if;

  -- Giữ giờ hiện tại của Việt Nam nhưng ngày theo ngày nhập mà người dùng chọn.
  v_created_at := (p_purchase_date::text || ' ' ||
    to_char(now() at time zone 'Asia/Ho_Chi_Minh','HH24:MI:SS.MS') || '+07')::timestamptz;

  insert into public.purchases(receipt_no,warehouse_id,supplier_id,discount,paid,note,status,created_by,created_at)
  values(p_receipt_no,p_warehouse_id,p_supplier_id,p_discount,p_paid,p_note,'COMPLETED',auth.uid(),v_created_at)
  returning * into pur;

  for item in select * from jsonb_array_elements(p_items) loop
    product_id := (item->>'product_id')::uuid;
    qty := (item->>'quantity')::numeric;
    unit_cost := (item->>'unit_cost')::numeric;
    line_discount := coalesce((item->>'discount')::numeric,0);
    if qty <= 0 or unit_cost < 0 or line_discount < 0 then raise exception 'invalid purchase line'; end if;
    line_total := greatest(0,qty*unit_cost-line_discount);
    v_subtotal := v_subtotal + line_total;
    insert into public.purchase_items(purchase_id,product_id,quantity,unit_cost,discount,line_total)
    values(pur.id,product_id,qty,unit_cost,line_discount,line_total);
    perform public.apply_stock_movement_v5(p_warehouse_id,product_id,'IN',qty,'PURCHASE',pur.id,p_receipt_no);
  end loop;

  v_final_total := greatest(0,v_subtotal-p_discount);
  if p_paid > v_final_total then raise exception 'paid exceeds total'; end if;
  update public.purchases
    set subtotal=v_subtotal,total=v_final_total,created_at=v_created_at
  where id=pur.id returning * into pur;

  -- Đồng bộ ngày của các dòng nhập kho thuộc phiếu này.
  update public.stock_movements set created_at=v_created_at
  where reference_type='PURCHASE' and reference_id=pur.id;

  if p_paid > 0 then
    insert into public.cash_transactions(warehouse_id,supplier_id,type,direction,amount,payment_method,reference_type,reference_id,note,created_by,created_at)
    values(p_warehouse_id,p_supplier_id,'PURCHASE','OUT',p_paid,'CASH','PURCHASE',pur.id,p_receipt_no,auth.uid(),v_created_at);
  end if;

  if p_supplier_id is not null and v_final_total > p_paid then
    update public.suppliers
    set debt=debt+(v_final_total-p_paid),updated_at=now()
    where id=p_supplier_id;
  end if;

  insert into public.audit_logs(user_id,action,entity,entity_id,detail,created_at)
  values(auth.uid(),'CREATE','PURCHASE',pur.id::text,jsonb_build_object('receipt_no',p_receipt_no,'total',v_final_total,'purchase_date',p_purchase_date),v_created_at);
  return pur;
end $$;

grant execute on function public.complete_purchase_v5(text,uuid,uuid,jsonb,date,numeric,numeric,text) to authenticated;

-- Gợi ý: không cần sửa số dư suppliers.debt hiện tại.
-- Màn hình Thu chi của V5 tính "Công nợ NCC theo ngày" từ purchases của ngày được chọn,
-- nên các ngày không bị cộng dồn khi hiển thị.
