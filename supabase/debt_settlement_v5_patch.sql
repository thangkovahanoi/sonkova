-- KHO XPRINTER V5 - thanh toán công nợ theo từng hóa đơn/phiếu nhập.
-- Run once in Supabase SQL Editor on the intended project after backup.
-- No existing sales, purchases, stock movements or historical cash transactions are deleted.
-- Records actual payment date, not original invoice/purchase date.

begin;

create table if not exists public.debt_payment_requests (
  request_id uuid primary key,
  document_kind text not null check(document_kind in ('SALE','PURCHASE')),
  document_id uuid not null,
  amount numeric(14,2) not null check(amount>0),
  method text not null check(method in ('CASH','TRANSFER','CARD')),
  cash_transaction_id uuid not null references public.cash_transactions(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.debt_payment_requests enable row level security;
-- No direct access by clients: mutations are only allowed through audited RPC.
revoke all on public.debt_payment_requests from public, anon, authenticated;

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
    v_remaining := v_sale.total-v_sale.paid;
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

revoke all on function public.settle_debt_v5(text,uuid,numeric,text,uuid) from public,anon;
grant execute on function public.settle_debt_v5(text,uuid,numeric,text,uuid) to authenticated;

commit;
