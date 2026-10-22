-- KHO XPRINTER V5 - Customer returns. Apply AFTER debt_settlement_v5_patch.sql.
-- Backup and test in Supabase TEST first. No historical rows are deleted.
BEGIN;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS returned_amount numeric(14,2) NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.sales_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE,
 return_no text NOT NULL UNIQUE,
 sale_id uuid NOT NULL REFERENCES public.sales(id),
 warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
 customer_id uuid REFERENCES public.customers(id),
 amount numeric(14,2) NOT NULL CHECK(amount>0),
 debt_offset numeric(14,2) NOT NULL DEFAULT 0 CHECK(debt_offset>=0),
 refund_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(refund_amount>=0),
 refund_method text NOT NULL CHECK(refund_method IN ('CASH','TRANSFER')),
 note text,
 created_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(amount=debt_offset+refund_amount)
);
CREATE TABLE IF NOT EXISTS public.sales_return_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 return_id uuid NOT NULL REFERENCES public.sales_returns(id),
 sale_item_id uuid NOT NULL REFERENCES public.sale_items(id),
 product_id uuid NOT NULL REFERENCES public.products(id),
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 amount numeric(14,2) NOT NULL CHECK(amount>=0),
 restock boolean NOT NULL,
 UNIQUE(return_id,sale_item_id)
);
CREATE INDEX IF NOT EXISTS sales_returns_sale_idx ON public.sales_returns(sale_id,created_at DESC);
CREATE INDEX IF NOT EXISTS sales_return_items_sale_item_idx ON public.sales_return_items(sale_item_id);
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "returns read" ON public.sales_returns;
DROP POLICY IF EXISTS "return items read" ON public.sales_return_items;
CREATE POLICY "returns read" ON public.sales_returns FOR SELECT TO authenticated USING (public.has_role(array['owner','admin','manager','cashier','warehouse']));
CREATE POLICY "return items read" ON public.sales_return_items FOR SELECT TO authenticated USING (public.has_role(array['owner','admin','manager','cashier','warehouse']));
REVOKE INSERT,UPDATE,DELETE ON public.sales_returns,public.sales_return_items FROM anon,authenticated;
GRANT SELECT ON public.sales_returns,public.sales_return_items TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_sales_return_v5(
 p_request_id uuid,p_return_no text,p_sale_id uuid,p_items jsonb,
 p_refund_method text DEFAULT 'CASH',p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_sale public.sales%rowtype;
 v_existing public.sales_returns%rowtype;
 v_return public.sales_returns%rowtype;
 v_line public.sale_items%rowtype;
 v_customer public.customers%rowtype;
 v_item jsonb;
 v_item_id uuid;
 v_qty numeric;
 v_prior_qty numeric;
 v_base numeric;
 v_amount numeric;
 v_total numeric := 0;
 v_debt numeric;
 v_credit numeric;
 v_refund numeric;
 v_count integer := 0;
 v_stock boolean;
 v_lines jsonb := '[]'::jsonb;
 v_line_total numeric;
BEGIN
 PERFORM public.assert_operational_role(array['owner','admin','manager','cashier']);
 IF p_request_id IS NULL OR p_sale_id IS NULL OR nullif(trim(p_return_no),'') IS NULL THEN RAISE EXCEPTION 'Thiếu mã phiếu trả hàng'; END IF;
 IF p_refund_method NOT IN ('CASH','TRANSFER') THEN RAISE EXCEPTION 'Chọn tiền mặt hoặc chuyển khoản'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Chưa chọn hàng trả'; END IF;
 IF jsonb_array_length(p_items)>100 THEN RAISE EXCEPTION 'Quá nhiều dòng hàng'; END IF;
 -- Lock invoice first: serializes returns and debt payments.
 SELECT * INTO v_sale FROM public.sales WHERE id=p_sale_id FOR UPDATE;
 IF NOT FOUND OR v_sale.status<>'COMPLETED' THEN RAISE EXCEPTION 'Không tìm thấy hóa đơn hoàn tất'; END IF;
 SELECT * INTO v_existing FROM public.sales_returns WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_existing.sale_id<>p_sale_id OR v_existing.return_no<>p_return_no THEN RAISE EXCEPTION 'Mã yêu cầu đã được sử dụng'; END IF;
   RETURN jsonb_build_object('already_processed',true,'return_id',v_existing.id,'return_no',v_existing.return_no,'amount',v_existing.amount,'debt_offset',v_existing.debt_offset,'refund_amount',v_existing.refund_amount);
 END IF;
 IF EXISTS(SELECT 1 FROM public.sales_returns WHERE return_no=p_return_no) THEN RAISE EXCEPTION 'Số phiếu trả hàng đã tồn tại'; END IF;
 SELECT coalesce(sum(line_total),0) INTO v_base FROM public.sale_items WHERE sale_id=p_sale_id;
 IF v_base<=0 THEN RAISE EXCEPTION 'Hóa đơn không có giá trị hàng hóa hợp lệ'; END IF;
 -- Stage/validate lines first; do not mutate stock until every line passes.
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   v_count:=v_count+1;
   IF v_item->>'sale_item_id' IS NULL OR v_item->>'quantity' IS NULL OR v_item->>'restock' IS NULL THEN RAISE EXCEPTION 'Thiếu dữ liệu dòng hàng'; END IF;
   v_item_id:=(v_item->>'sale_item_id')::uuid;
   v_qty:=(v_item->>'quantity')::numeric;
   IF jsonb_typeof(v_item->'restock')<>'boolean' THEN RAISE EXCEPTION 'Tình trạng hàng không hợp lệ'; END IF;
   v_stock:=(v_item->>'restock')::boolean;
   IF v_qty<=0 OR v_qty<>round(v_qty,3) THEN RAISE EXCEPTION 'Số lượng trả không hợp lệ'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_lines) l WHERE (l->>'sale_item_id')::uuid=v_item_id) THEN RAISE EXCEPTION 'Sản phẩm trả bị trùng'; END IF;
   SELECT * INTO v_line FROM public.sale_items WHERE id=v_item_id AND sale_id=p_sale_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Dòng hàng không thuộc hóa đơn'; END IF;
   SELECT coalesce(sum(quantity),0) INTO v_prior_qty FROM public.sales_return_items WHERE sale_item_id=v_item_id;
   IF v_qty>v_line.quantity-v_prior_qty THEN RAISE EXCEPTION 'Số lượng trả vượt quá đã bán'; END IF;
   v_amount:=round(v_line.line_total*v_sale.total/v_base*v_qty/v_line.quantity,2);
   IF v_amount<=0 THEN RAISE EXCEPTION 'Dòng hàng không có giá trị hoàn trả'; END IF;
   v_total:=v_total+v_amount;
   v_lines:=v_lines||jsonb_build_array(jsonb_build_object('sale_item_id',v_item_id,'product_id',v_line.product_id,'quantity',v_qty,'amount',v_amount,'restock',v_stock));
 END LOOP;
 IF v_total>v_sale.total-v_sale.returned_amount THEN RAISE EXCEPTION 'Số tiền trả vượt giá trị hóa đơn còn lại'; END IF;
 -- Refund must first offset any unpaid portion of the original invoice.
 v_debt:=greatest(0,v_sale.total-v_sale.paid-v_sale.returned_amount);
 v_credit:=least(v_total,v_debt);
 v_refund:=v_total-v_credit;
 IF v_credit>0 THEN
   IF v_sale.customer_id IS NULL THEN RAISE EXCEPTION 'Hóa đơn nợ thiếu khách hàng'; END IF;
   SELECT * INTO v_customer FROM public.customers WHERE id=v_sale.customer_id FOR UPDATE;
   IF NOT FOUND OR v_customer.debt<v_credit THEN RAISE EXCEPTION 'Công nợ khách hàng không khớp, cần đối soát'; END IF;
   UPDATE public.customers SET debt=debt-v_credit,updated_at=now() WHERE id=v_customer.id;
 END IF;
 INSERT INTO public.sales_returns(request_id,return_no,sale_id,warehouse_id,customer_id,amount,debt_offset,refund_amount,refund_method,note,created_by)
 VALUES(p_request_id,p_return_no,p_sale_id,v_sale.warehouse_id,v_sale.customer_id,v_total,v_credit,v_refund,p_refund_method,p_note,auth.uid()) RETURNING * INTO v_return;
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
   INSERT INTO public.sales_return_items(return_id,sale_item_id,product_id,quantity,amount,restock)
   VALUES(v_return.id,(v_item->>'sale_item_id')::uuid,(v_item->>'product_id')::uuid,(v_item->>'quantity')::numeric,(v_item->>'amount')::numeric,(v_item->>'restock')::boolean);
   IF (v_item->>'restock')::boolean THEN
     PERFORM public.apply_stock_movement_v5(v_sale.warehouse_id,(v_item->>'product_id')::uuid,'IN',(v_item->>'quantity')::numeric,'SALE_RETURN',v_return.id,p_return_no);
   END IF;
 END LOOP;
 UPDATE public.sales SET returned_amount=returned_amount+v_total WHERE id=v_sale.id;
 IF v_refund>0 THEN
   INSERT INTO public.cash_transactions(warehouse_id,customer_id,type,direction,amount,payment_method,reference_type,reference_id,note,created_by)
   VALUES(v_sale.warehouse_id,v_sale.customer_id,'OTHER','OUT',v_refund,p_refund_method,'SALE_RETURN',v_return.id,'Hoàn tiền trả hàng '||p_return_no,auth.uid());
 END IF;
 INSERT INTO public.audit_logs(user_id,action,entity,entity_id,detail)
 VALUES(auth.uid(),'CREATE','SALE_RETURN',v_return.id::text,jsonb_build_object('sale_id',p_sale_id,'amount',v_total,'debt_offset',v_credit,'refund_amount',v_refund,'request_id',p_request_id));
 RETURN jsonb_build_object('already_processed',false,'return_id',v_return.id,'return_no',v_return.return_no,'amount',v_total,'debt_offset',v_credit,'refund_amount',v_refund);
END $$;
REVOKE ALL ON FUNCTION public.complete_sales_return_v5(uuid,text,uuid,jsonb,text,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.complete_sales_return_v5(uuid,text,uuid,jsonb,text,text) TO authenticated;

-- Existing debt settlement must respect returns, without modifying original invoice totals.
-- Replaces only the outstanding-balance calculation in the existing function.
DO $$ BEGIN
 IF to_regprocedure('public.settle_debt_v5(text,uuid,numeric,text,uuid)') IS NULL THEN
   RAISE EXCEPTION 'Apply debt_settlement_v5_patch.sql before this patch';
 END IF;
END $$;
create or replace function public.settle_debt_v5(
  p_kind text,
  p_document_id uuid,
  p_amount numeric,
  p_method text,
  p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_sale public.sales%rowtype;
  v_purchase public.purchases%rowtype;
  v_customer public.customers%rowtype;
  v_supplier public.suppliers%rowtype;
  v_previous public.debt_payment_requests%rowtype;
  v_remaining numeric;
  v_cash_id uuid;
  v_invoice text;
  v_party_id uuid;
  v_warehouse_id uuid;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if not exists (select 1 from public.user_profiles where user_id=auth.uid() and active=true) then
    raise exception 'Active user profile required';
  end if;
  if p_kind='SALE' then
    perform public.assert_operational_role(array['owner','admin','manager','cashier']);
  elsif p_kind='PURCHASE' then
    perform public.assert_operational_role(array['owner','admin','manager']);
  else
    raise exception 'Invalid document kind';
  end if;
  if p_document_id is null or p_request_id is null then raise exception 'Missing document/request id'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 or round(p_amount,2) <> p_amount then
    raise exception 'Invalid payment amount';
  end if;
  if p_method not in ('CASH','TRANSFER','CARD') or (p_kind='PURCHASE' and p_method='CARD') then
    raise exception 'Invalid payment method';
  end if;

  -- Serialize payment on each document. Concurrent calls cannot overpay.
  if p_kind='SALE' then
    select * into v_sale from public.sales where id=p_document_id for update;
    if not found or v_sale.status<>'COMPLETED' or v_sale.customer_id is null then
      raise exception 'Completed sale with customer not found';
    end if;
    v_remaining := v_sale.total-v_sale.paid-v_sale.returned_amount;
    v_invoice := v_sale.invoice_no;
    v_party_id := v_sale.customer_id;
    v_warehouse_id := v_sale.warehouse_id;
  else
    select * into v_purchase from public.purchases where id=p_document_id for update;
    if not found or v_purchase.status<>'COMPLETED' or v_purchase.supplier_id is null then
      raise exception 'Completed purchase with supplier not found';
    end if;
    v_remaining := v_purchase.total-v_purchase.paid;
    v_invoice := v_purchase.receipt_no;
    v_party_id := v_purchase.supplier_id;
    v_warehouse_id := v_purchase.warehouse_id;
  end if;

  -- The same request can be safely retried if the network times out.
  select * into v_previous from public.debt_payment_requests where request_id=p_request_id;
  if found then
    if v_previous.document_kind<>p_kind or v_previous.document_id<>p_document_id or
       v_previous.amount<>p_amount or v_previous.method<>p_method then
      raise exception 'Payment request ID reused with different details';
    end if;
    return jsonb_build_object('already_processed',true,'cash_transaction_id',v_previous.cash_transaction_id,'document_id',p_document_id);
  end if;

  if v_remaining <= 0 or p_amount > v_remaining then
    raise exception 'Payment exceeds remaining invoice debt (remaining: %)',v_remaining;
  end if;

  -- Serialize updates to party balance across *different* documents as well.
  if p_kind='SALE' then
    select * into v_customer from public.customers where id=v_party_id for update;
    if not found or v_customer.debt < p_amount then
      raise exception 'Customer debt balance is inconsistent; please reconcile before payment';
    end if;
    update public.sales set paid=paid+p_amount where id=p_document_id;
    update public.customers set debt=debt-p_amount,updated_at=now() where id=v_party_id;
    insert into public.sale_payments(sale_id,amount,method,created_by)
      values(p_document_id,p_amount,p_method,auth.uid());
    insert into public.cash_transactions(warehouse_id,customer_id,type,direction,amount,payment_method,reference_type,reference_id,note,created_by)
      values(v_warehouse_id,v_party_id,'RECEIVABLE','IN',p_amount,p_method,'SALE',p_document_id,'Thu công nợ '||v_invoice,auth.uid())
      returning id into v_cash_id;
  else
    select * into v_supplier from public.suppliers where id=v_party_id for update;
    if not found or v_supplier.debt < p_amount then
      raise exception 'Supplier debt balance is inconsistent; please reconcile before payment';
    end if;
    update public.purchases set paid=paid+p_amount where id=p_document_id;
    update public.suppliers set debt=debt-p_amount,updated_at=now() where id=v_party_id;
    insert into public.cash_transactions(warehouse_id,supplier_id,type,direction,amount,payment_method,reference_type,reference_id,note,created_by)
      values(v_warehouse_id,v_party_id,'PAYABLE','OUT',p_amount,p_method,'PURCHASE',p_document_id,'Trả công nợ '||v_invoice,auth.uid())
      returning id into v_cash_id;
  end if;

  insert into public.debt_payment_requests(request_id,document_kind,document_id,amount,method,cash_transaction_id,created_by)
    values(p_request_id,p_kind,p_document_id,p_amount,p_method,v_cash_id,auth.uid());
  insert into public.audit_logs(user_id,action,entity,entity_id,detail)
    values(auth.uid(),'PAY_DEBT',p_kind,p_document_id::text,
      jsonb_build_object('amount',p_amount,'method',p_method,'cash_transaction_id',v_cash_id,'request_id',p_request_id));
  return jsonb_build_object('already_processed',false,'cash_transaction_id',v_cash_id,'document_id',p_document_id,'remaining',v_remaining-p_amount);
end;
$$;

COMMIT;
