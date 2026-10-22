import {useEffect,useState} from 'react'
import {ChevronDown,ChevronRight,RefreshCw,ArrowLeft,Printer} from 'lucide-react'
import {supabase} from './lib/supabase'
import {money,safeNum} from './lib/format'
import type {Customer} from './types'
import {printReceipt} from './lib/print'
import {getInvoiceTemplate} from './lib/invoiceTemplate'
import DebtPaymentModal from './DebtPaymentModal'

type Sale={id:string;invoice_no:string;created_at:string;total:number;paid:number;returned_amount:number;discount:number;payment_method:string;status:string}
type SaleItem={id:string;sale_id:string;quantity:number;unit_price:number;discount:number;line_total:number;product:{name:string;sku:string;unit:string}|null}
const PAGE_SIZE=50
function normalizeProduct(raw:any):SaleItem['product']{
 const value=Array.isArray(raw)?raw[0]:raw
 return value?{name:String(value.name||''),sku:String(value.sku||''),unit:String(value.unit||'')}:null
}
function formatDate(value:string){return new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}

export default function CustomerHistory({customers,add,onPayment,onReturn}:{customers:Customer[];add:()=>void;onPayment:()=>void;onReturn:(saleId:string)=>void}){
 const [selected,setSelected]=useState<string|null>(null)
 const [sales,setSales]=useState<Sale[]>([])
 const [items,setItems]=useState<SaleItem[]>([])
 const [expanded,setExpanded]=useState<string[]>([])
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [hasMore,setHasMore]=useState(false)
 const [reload,setReload]=useState(0)
 const [search,setSearch]=useState('')
 const [printingId,setPrintingId]=useState<string|null>(null)
 const [printMessage,setPrintMessage]=useState('')
 const [paySale,setPaySale]=useState<Sale|null>(null)
 const customer=customers.find(c=>c.id===selected)
 useEffect(()=>{setSales([]);setItems([]);setExpanded([]);setHasMore(false);setError('')},[selected])
 useEffect(()=>{
  if(!selected||!supabase)return
  let active=true
  async function fetchPage(){
   setLoading(true);setError('')
   try{
    const {data:orders,error:ordersError}=await supabase!.from('sales')
     .select('id,invoice_no,created_at,total,paid,returned_amount,discount,payment_method,status')
     .eq('customer_id',selected).eq('status','COMPLETED')
     .order('created_at',{ascending:false}).range(0,PAGE_SIZE-1)
    if(ordersError)throw ordersError
    const rows=(orders||[]) as Sale[]
    let lines:SaleItem[]=[]
    if(rows.length){
     const {data,error:itemsError}=await supabase!.from('sale_items')
      .select('id,sale_id,quantity,unit_price,discount,line_total,product:products(name,sku,unit)')
      .in('sale_id',rows.map(s=>s.id))
     if(itemsError)throw itemsError
     lines=(data||[]).map((r:any)=>({...r,product:normalizeProduct(r.product)})) as SaleItem[]
    }
    if(active){setSales(rows);setItems(lines);setHasMore(rows.length===PAGE_SIZE)}
   }catch(e){if(active)setError(e instanceof Error?e.message:'Không tải được lịch sử mua hàng')}
   finally{if(active)setLoading(false)}
  }
  fetchPage()
  return()=>{active=false}
 },[selected,reload])
 async function loadMore(){
  if(!selected||!supabase||loading)return
  setLoading(true);setError('')
  try{
   const {data,error:ordersError}=await supabase.from('sales')
    .select('id,invoice_no,created_at,total,paid,returned_amount,discount,payment_method,status')
    .eq('customer_id',selected).eq('status','COMPLETED')
    .order('created_at',{ascending:false}).range(sales.length,sales.length+PAGE_SIZE-1)
   if(ordersError)throw ordersError
   const rows=(data||[]) as Sale[]
   let lines:SaleItem[]=[]
   if(rows.length){
    const {data:detail,error:detailError}=await supabase.from('sale_items')
     .select('id,sale_id,quantity,unit_price,discount,line_total,product:products(name,sku,unit)')
     .in('sale_id',rows.map(s=>s.id))
    if(detailError)throw detailError
    lines=(detail||[]).map((r:any)=>({...r,product:normalizeProduct(r.product)})) as SaleItem[]
   }
   setSales(old=>[...old,...rows]);setItems(old=>[...old,...lines]);setHasMore(rows.length===PAGE_SIZE)
  }catch(e){setError(e instanceof Error?e.message:'Không tải được thêm hóa đơn')}
  finally{setLoading(false)}
 }
 async function reprint(sale:Sale){
  if(printingId)return
  setPrintingId(sale.id);setPrintMessage('')
  try{
   // Use persisted sale and line items. Never call checkout RPC or update stock/debt.
   // Refetch the selected invoice to avoid printing stale or incomplete history.
   if(!supabase)throw new Error('Chưa kết nối Supabase')
   const {data:stored,error:saleError}=await supabase.from('sales')
    .select('id,invoice_no,created_at,total,discount,payment_method,status')
    .eq('id',sale.id).eq('customer_id',selected!).single()
   if(saleError)throw saleError
   if(stored.status!=='COMPLETED')throw new Error('Chỉ được in lại hóa đơn đã hoàn tất')
   const {data:rawLines,error:lineError}=await supabase.from('sale_items')
    .select('id,sale_id,quantity,unit_price,discount,line_total,product:products(name,sku,unit)')
    .eq('sale_id',stored.id)
   if(lineError)throw lineError
   const lines=(rawLines||[]).map((r:any)=>({...r,product:normalizeProduct(r.product)})) as SaleItem[]
   if(!lines.length)throw new Error('Hóa đơn không có chi tiết sản phẩm, không thể in lại')
   if(lines.some(i=>!i.product?.name))throw new Error('Thiếu thông tin sản phẩm gốc, không thể in lại chính xác')
   const subtotal=lines.reduce((sum,i)=>sum+safeNum(i.quantity)*safeNum(i.unit_price),0)
   const transfer=stored.payment_method==='TRANSFER'
   const params=new URLSearchParams({amount:String(Math.round(safeNum(stored.total))),addInfo:`THANHTOAN ${stored.invoice_no}`,accountName:'HO KINH DOANH SON & CHONG THAM KOVA THANG NGA'})
   const qrData=transfer?`https://img.vietqr.io/image/970422-1313138888-compact2.png?${params.toString()}`:undefined
   const baseTemplate=getInvoiceTemplate()
   await printReceipt(
    lines.map(i=>({name:i.product!.name,sku:i.product!.sku,qty:safeNum(i.quantity),unitPrice:safeNum(i.unit_price)})),
    `HÓA ĐƠN ${stored.invoice_no} - BẢN IN LẠI`,
    {invoiceNo:stored.invoice_no,printedAt:stored.created_at,subtotal,discount:safeNum(stored.discount),total:safeNum(stored.total),
     paymentMethod:transfer?'CHUYỂN KHOẢN':stored.payment_method==='CASH'?'TIỀN MẶT':stored.payment_method==='DEBT'?'GHI NỢ':stored.payment_method==='CARD'?'THẺ':stored.payment_method,
     ...(transfer?{paymentBank:'MB Bank',paymentAccount:'1313138888',paymentAccountName:'HO KINH DOANH SON & CHONG THAM KOVA THANG NGA',paymentInfo:`Nội dung: ${stored.invoice_no}`,qrData}:{})},
    undefined,undefined,{...baseTemplate,title:`${baseTemplate.title} - BẢN IN LẠI`}
   )
   setPrintMessage(`Đã gửi bản in lại hóa đơn ${stored.invoice_no} đến máy in.`)
  }catch(e){setPrintMessage(`Không in lại được ${sale.invoice_no}: ${e instanceof Error?e.message:String(e)}`)}
  finally{setPrintingId(null)}
 }
 const filtered=customers.filter(c=>`${c.name} ${c.code} ${c.phone||''}`.toLowerCase().includes(search.toLowerCase()))
 if(!selected||!customer)return <section className="panel"><div className="panelHead"><div className="masterTitle"><span aria-hidden="true">👥</span><div><h2>Khách hàng</h2><p>{customers.length} bản ghi • Chạm vào tên để xem lịch sử mua hàng</p></div></div><button className="primary" onClick={add}>+ Thêm</button></div><div className="customerSearch"><input aria-label="Tìm khách hàng" placeholder="Tìm tên, mã hoặc số điện thoại..." value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="masterList">{filtered.map(c=><button type="button" className="customerListRow" key={c.id} onClick={()=>setSelected(c.id)}><span><b>{c.name}</b><small>{c.code}{c.phone?` • ${c.phone}`:''}</small></span><span className="customerDebt">Nợ {money(c.debt)}</span><ChevronRight size={17}/></button>)}{!filtered.length&&<div className="empty">Không có khách hàng phù hợp.</div>}</div></section>
 const total=sales.reduce((sum,s)=>sum+safeNum(s.total),0)
 const count=items.reduce((sum,item)=>sum+safeNum(item.quantity),0)
 return <section className="panel customerHistory"><div className="panelHead"><div><button type="button" className="customerBack" onClick={()=>setSelected(null)}><ArrowLeft size={16}/> Quay lại khách hàng</button><h2>{customer.name}</h2><p>{customer.code}{customer.phone?` • ${customer.phone}`:''}{customer.address?` • ${customer.address}`:''}</p></div><button className="outline" onClick={()=>setReload(n=>n+1)} disabled={loading}><RefreshCw size={15}/> Làm mới</button></div>
 <div className="customerStats"><div><small>Công nợ hiện tại</small><strong>{money(customer.debt)}</strong></div><div><small>Hóa đơn đã tải</small><strong>{sales.length}{hasMore?'+':''}</strong></div><div><small>Tổng mua (đã tải)</small><strong>{money(total)}</strong></div><div><small>Số lượng SP (đã tải)</small><strong>{count.toLocaleString('vi-VN')}</strong></div></div>
 <div className="customerHistoryTitle"><h3>Lịch sử hóa đơn đã bán</h3><small>Chỉ hiển thị hóa đơn hoàn tất • Mới nhất trước</small></div>
 {error&&<div className="customerHistoryError" role="alert">{error}</div>}
 {printMessage&&<div className="customerHistoryError" role="status">{printMessage}</div>}
 {sales.map(s=>{const open=expanded.includes(s.id);const lines=items.filter(i=>i.sale_id===s.id);return <div className="customerInvoice" key={s.id}><button type="button" className="customerInvoiceHead" onClick={()=>setExpanded(old=>open?old.filter(x=>x!==s.id):[...old,s.id])} aria-expanded={open}><span>{open?<ChevronDown size={17}/>:<ChevronRight size={17}/>}<span><b>{s.invoice_no}</b><small>{formatDate(s.created_at)}</small></span></span><span className="customerInvoiceAmount"><b>{money(s.total)}</b><small>Đã trả {money(s.paid)} • Còn nợ {money(Math.max(0,safeNum(s.total)-safeNum(s.paid)-safeNum(s.returned_amount)))}</small></span></button>{open&&<div className="customerInvoiceBody"><div className="tableWrap"><table><thead><tr><th>Sản phẩm</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{lines.map(i=><tr key={i.id}><td><b>{i.product?.name||'Sản phẩm đã xóa'}</b><small className="cellSub">{i.product?.sku||'-'}</small></td><td>{safeNum(i.quantity).toLocaleString('vi-VN')} {i.product?.unit||''}</td><td>{money(i.unit_price)}</td><td>{money(i.line_total)}</td></tr>)}{!lines.length&&<tr><td colSpan={4}>Không có chi tiết mặt hàng.</td></tr>}</tbody></table></div><div className="customerInvoiceActions">{safeNum(s.total)-safeNum(s.paid)-safeNum(s.returned_amount)>0.005&&<button type="button" className="primary" onClick={()=>setPaySale(s)}>Đã thanh toán / Thu công nợ</button>}<button type="button" className="outline" onClick={()=>onReturn(s.id)}>Trả hàng</button><button type="button" className="outline" onClick={()=>reprint(s)} disabled={printingId!==null||!lines.length}><Printer size={16}/> {printingId===s.id?'Đang gửi máy in...':'In lại hóa đơn'}</button></div><div className="customerInvoiceFooter">Đã trả hàng: {money(s.returned_amount||0)} • Chiết khấu: {money(s.discount)} • Thanh toán: {s.payment_method==='CASH'?'Tiền mặt':s.payment_method==='TRANSFER'?'Chuyển khoản':s.payment_method==='DEBT'?'Công nợ':s.payment_method}</div></div>}</div>})}
 {!sales.length&&!loading&&!error&&<div className="empty">Khách hàng chưa có hóa đơn bán hàng hoàn tất.</div>}
 {loading&&<div className="empty">Đang tải hóa đơn...</div>}
 {hasMore&&!loading&&<button className="outline customerMore" onClick={loadMore}>Tải thêm 50 hóa đơn</button>}
 {paySale&&customer&&<DebtPaymentModal kind="SALE" documentId={paySale.id} documentNo={paySale.invoice_no} partyName={customer.name} remaining={Math.max(0,safeNum(paySale.total)-safeNum(paySale.paid)-safeNum(paySale.returned_amount))} onClose={()=>setPaySale(null)} onSuccess={()=>{setPaySale(null);setReload(n=>n+1);onPayment()}}/>}
 </section>
}
