import {useEffect,useMemo,useState} from 'react'
import {ArrowLeft,RefreshCw,Printer} from 'lucide-react'
import {supabase} from './lib/supabase'
import {money,safeNum} from './lib/format'
import {printReceipt} from './lib/print'
import {getInvoiceTemplate} from './lib/invoiceTemplate'

type Sale={id:string;invoice_no:string;created_at:string;total:number;paid:number;returned_amount:number;status:string;customer:{name:string}|null}
type Line={id:string;sale_id:string;quantity:number;unit_price:number;line_total:number;product:{name:string;sku:string;unit:string}|null;returned:number}
type ReturnRow={id:string;return_no:string;created_at:string;amount:number;debt_offset:number;refund_amount:number;refund_method:string;note:string|null;sale:{invoice_no:string}|null}
const norm=(x:any)=>Array.isArray(x)?x[0]||null:x||null
const formatDate=(s:string)=>new Date(s).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})

export default function SalesReturns({initialSaleId,onCompleted}:{initialSaleId?:string|null;onCompleted:()=>void}){
 const [sales,setSales]=useState<Sale[]>([])
 const [saleId,setSaleId]=useState(initialSaleId||'')
 const [lines,setLines]=useState<Line[]>([])
 const [quantities,setQuantities]=useState<Record<string,string>>({})
 const [restock,setRestock]=useState<Record<string,boolean>>({})
 const [method,setMethod]=useState<'CASH'|'TRANSFER'>('CASH')
 const [note,setNote]=useState('Khách không sử dụng')
 const [history,setHistory]=useState<ReturnRow[]>([])
 const [search,setSearch]=useState('')
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [busy,setBusy]=useState(false)
 const [refresh,setRefresh]=useState(0)
 const [lastRequest,setLastRequest]=useState<{id:string;no:string}|null>(null)
 useEffect(()=>{if(initialSaleId)setSaleId(initialSaleId)},[initialSaleId])
 useEffect(()=>{
  if(!supabase)return
  let active=true
  async function load(){
   const [a,b]=await Promise.all([
    supabase!.from('sales').select('id,invoice_no,created_at,total,paid,returned_amount,status,customer:customers(name)').eq('status','COMPLETED').order('created_at',{ascending:false}).limit(250),
    supabase!.from('sales_returns').select('id,return_no,created_at,amount,debt_offset,refund_amount,refund_method,note,sale:sales(invoice_no)').order('created_at',{ascending:false}).limit(100)
   ])
   if(!active)return
   if(a.error)setError(a.error.message);else setSales((a.data||[]).map((s:any)=>({...s,customer:norm(s.customer)})))
   if(b.error)setError(b.error.message);else setHistory((b.data||[]).map((r:any)=>({...r,sale:norm(r.sale)})))
  }
  load();return()=>{active=false}
 },[refresh])
 useEffect(()=>{
  setLines([]);setQuantities({});setRestock({});setLastRequest(null)
  if(!saleId||!supabase)return
  let active=true
  async function loadLines(){
   const [a,b]=await Promise.all([
    supabase!.from('sale_items').select('id,sale_id,quantity,unit_price,line_total,product:products(name,sku,unit)').eq('sale_id',saleId),
    supabase!.from('sales_return_items').select('sale_item_id,quantity,return:sales_returns!inner(sale_id)').eq('return.sale_id',saleId)
   ])
   if(!active)return
   if(a.error){setError(a.error.message);return}
   if(b.error){setError(b.error.message);return}
   const returned=new Map<string,number>()
   for(const r of b.data||[])returned.set(r.sale_item_id,(returned.get(r.sale_item_id)||0)+safeNum(r.quantity))
   setLines((a.data||[]).map((r:any)=>({...r,product:norm(r.product),returned:returned.get(r.id)||0})))
  }
  loadLines();return()=>{active=false}
 },[saleId,refresh])
 const sale=sales.find(s=>s.id===saleId)
 const available=lines.filter(l=>safeNum(l.quantity)-safeNum(l.returned)>0.0001)
 const chosen=useMemo(()=>available.map(l=>({...l,qty:Number(quantities[l.id]||0)})).filter(l=>l.qty>0),[available,quantities])
 const base=lines.reduce((s,l)=>s+safeNum(l.line_total),0)
 const estimated=chosen.reduce((s,l)=>s+(base&&sale?Math.round(safeNum(l.line_total)*safeNum(sale.total)/base*l.qty/safeNum(l.quantity)*100)/100:0),0)
 const outstanding=sale?Math.max(0,safeNum(sale.total)-safeNum(sale.paid)-safeNum(sale.returned_amount)):0
 const credit=Math.min(estimated,outstanding)
 const refund=Math.max(0,estimated-credit)
 const filtered=sales.filter(s=>`${s.invoice_no} ${s.customer?.name||''}`.toLowerCase().includes(search.toLowerCase()))
 async function submit(){
  if(!supabase||!sale){setError('Chưa chọn hóa đơn');return}
  if(!chosen.length){setError('Chưa chọn sản phẩm và số lượng trả');return}
  if(chosen.some(l=>!Number.isFinite(l.qty)||l.qty<=0||l.qty>safeNum(l.quantity)-safeNum(l.returned)||Math.round(l.qty*1000)!==l.qty*1000)){setError('Số lượng trả vượt số đã bán hoặc không hợp lệ');return}
  if(!window.confirm(`Xác nhận trả ${chosen.length} mặt hàng từ ${sale.invoice_no}? Hệ thống sẽ cập nhật tồn kho, công nợ và tiền hoàn.`))return
  setBusy(true);setError('');setNotice('')
  try{
   const req=lastRequest||{id:crypto.randomUUID(),no:`TH${new Date().toISOString().replace(/\D/g,'').slice(0,14)}-${Math.random().toString(36).slice(2,7).toUpperCase()}`}
   setLastRequest(req)
   const {data,error:rpcError}=await supabase.rpc('complete_sales_return_v5',{
    p_request_id:req.id,p_return_no:req.no,p_sale_id:sale.id,
    p_items:chosen.map(l=>({sale_item_id:l.id,quantity:l.qty,restock:restock[l.id]!==false})),
    p_refund_method:method,p_note:note.trim()||null
   })
   if(rpcError)throw rpcError
   setNotice(`Đã tạo ${data.return_no}. Trừ công nợ ${money(data.debt_offset)}; hoàn tiền ${money(data.refund_amount)}. Không tạo hóa đơn bán mới.`)
   setLastRequest(null);setQuantities({});setSaleId('');setRefresh(n=>n+1);onCompleted()
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 async function printReturn(r:ReturnRow){
  try{
   if(!supabase)throw new Error('Chưa kết nối Supabase')
   const {data,error:dbError}=await supabase.from('sales_return_items').select('quantity,amount,product:products(name,sku)').eq('return_id',r.id)
   if(dbError)throw dbError
   await printReceipt((data||[]).map((x:any)=>({name:norm(x.product)?.name||'Hàng trả',sku:norm(x.product)?.sku||'',qty:safeNum(x.quantity),unitPrice:safeNum(x.amount)/safeNum(x.quantity)})),`PHIẾU TRẢ HÀNG ${r.return_no}`,
    {invoiceNo:r.return_no,printedAt:r.created_at,subtotal:r.amount,discount:0,total:r.amount,paymentMethod:`Giảm nợ ${money(r.debt_offset)} • Hoàn ${money(r.refund_amount)}`},undefined,undefined,getInvoiceTemplate())
   setNotice(`Đã gửi phiếu ${r.return_no} tới máy in`)
  }catch(e){setError(e instanceof Error?e.message:String(e))}
 }
 return <div className="returnsPage">
  <section className="panel"><div className="panelHead"><div><h2>Trả hàng khách mua</h2><p>Chọn hóa đơn gốc, chỉ nhận số lượng chưa từng trả. Hóa đơn gốc được giữ nguyên.</p></div><button className="outline" onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={14}/> Làm mới</button></div>
   {error&&<div className="customerHistoryError" role="alert">{error}</div>}{notice&&<div className="returnSuccess" role="status">{notice}</div>}
   <div className="formGrid"><label>Tìm hóa đơn hoặc khách hàng<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Số hóa đơn, tên khách hàng"/></label><label>Hóa đơn gốc<select value={saleId} onChange={e=>{setSaleId(e.target.value);setError('')}}><option value="">Chọn hóa đơn đã bán</option>{filtered.map(s=><option key={s.id} value={s.id}>{s.invoice_no} — {s.customer?.name||'Khách lẻ'} — {money(s.total)}</option>)}{saleId&&!filtered.some(s=>s.id===saleId)&&sale&&<option value={saleId}>{sale.invoice_no}</option>}</select></label></div>
   {sale&&<><p><b>{sale.invoice_no}</b> • {formatDate(sale.created_at)} • {sale.customer?.name||'Khách lẻ'} • Đã trả hàng {money(sale.returned_amount||0)}</p><div className="tableWrap"><table><thead><tr><th>Mặt hàng</th><th>Đã bán / Đã trả</th><th>Trả lần này</th><th>Tình trạng</th></tr></thead><tbody>{lines.map(l=><tr key={l.id}><td><b>{l.product?.name||'Sản phẩm'}</b><small className="cellSub">{l.product?.sku} • {l.product?.unit}</small></td><td>{l.quantity} / {l.returned}</td><td><input className="returnQty" type="number" min="0" max={Math.max(0,safeNum(l.quantity)-safeNum(l.returned))} step="1" disabled={l.returned>=l.quantity} value={quantities[l.id]||''} placeholder="0" onChange={e=>{setQuantities(p=>({...p,[l.id]:e.target.value}));setLastRequest(null)}}/></td><td><select disabled={l.returned>=l.quantity} value={restock[l.id]===false?'damaged':'intact'} onChange={e=>{setRestock(p=>({...p,[l.id]:e.target.value==='intact'}));setLastRequest(null)}}><option value="intact">Còn nguyên – nhập kho</option><option value="damaged">Đã mở/hỏng – không nhập kho</option></select></td></tr>)}</tbody></table></div>
    <div className="formGrid"><label>Hoàn tiền qua<select value={method} onChange={e=>{setMethod(e.target.value as 'CASH'|'TRANSFER');setLastRequest(null)}}><option value="CASH">Tiền mặt</option><option value="TRANSFER">Chuyển khoản</option></select></label><label>Lý do trả hàng<input value={note} onChange={e=>{setNote(e.target.value);setLastRequest(null)}}/></label></div>
    <div className="returnSummary"><span>Giá trị hàng trả (ước tính): <b>{money(estimated)}</b></span><span>Giảm công nợ: <b>{money(credit)}</b></span><span>Hoàn tiền: <b>{money(refund)}</b></span><small>Số tiền chính xác được máy chủ tính lại theo hóa đơn gốc và chiết khấu. Khoản nợ được trừ trước; chỉ phần còn lại mới hoàn tiền.</small></div>
    <button className="primary" onClick={submit} disabled={busy||!chosen.length}>{busy?'Đang ghi nhận...':'Xác nhận trả hàng'}</button></>}
  </section>
  <section className="panel"><div className="panelHead"><div><h2>Lịch sử trả hàng</h2><p>Mỗi phiếu riêng, theo ngày phát sinh; không gộp vào hóa đơn cũ.</p></div></div><div className="masterList">{history.map(r=><div className="masterRow" key={r.id}><div><b>{r.return_no}</b><small>{formatDate(r.created_at)} • HĐ {r.sale?.invoice_no||'-'}</small><small>Trừ nợ {money(r.debt_offset)} • Hoàn {money(r.refund_amount)} ({r.refund_method==='CASH'?'tiền mặt':'chuyển khoản'})</small></div><div><strong>{money(r.amount)}</strong><button className="outline" onClick={()=>printReturn(r)}><Printer size={14}/> In phiếu trả</button></div></div>)}{!history.length&&<div className="empty">Chưa có phiếu trả hàng.</div>}</div></section>
 </div>
}
