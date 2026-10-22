import {useEffect,useState} from 'react'
import {ArrowLeft,ChevronDown,ChevronRight,RefreshCw} from 'lucide-react'
import {supabase} from './lib/supabase'
import {money,safeNum} from './lib/format'
import type {Supplier} from './types'
import DebtPaymentModal from './DebtPaymentModal'

type Purchase={id:string;receipt_no:string;created_at:string;total:number;paid:number;status:string}
const PAGE_SIZE=50
function dateLabel(value:string){return new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
export default function SupplierHistory({suppliers,add,onPayment}:{suppliers:Supplier[];add:()=>void;onPayment:()=>void}){
 const [selected,setSelected]=useState<string|null>(null)
 const [rows,setRows]=useState<Purchase[]>([])
 const [expanded,setExpanded]=useState<string[]>([])
 const [pay,setPay]=useState<Purchase|null>(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [reload,setReload]=useState(0)
 const [hasMore,setHasMore]=useState(false)
 const [search,setSearch]=useState('')
 const supplier=suppliers.find(x=>x.id===selected)
 useEffect(()=>{setRows([]);setExpanded([]);setHasMore(false);setError('')},[selected])
 useEffect(()=>{
  if(!selected||!supabase)return
  let active=true
  ;(async()=>{setLoading(true);setError('');try{
   const {data,error:e}=await supabase!.from('purchases').select('id,receipt_no,created_at,total,paid,status').eq('supplier_id',selected).eq('status','COMPLETED').order('created_at',{ascending:false}).range(0,PAGE_SIZE-1)
   if(e)throw e
   if(active){setRows((data||[]) as Purchase[]);setHasMore((data||[]).length===PAGE_SIZE)}
  }catch(e){if(active)setError(e instanceof Error?e.message:String(e))}finally{if(active)setLoading(false)}})()
  return()=>{active=false}
 },[selected,reload])
 async function loadMore(){if(!selected||!supabase||loading)return;setLoading(true);try{
  const {data,error:e}=await supabase.from('purchases').select('id,receipt_no,created_at,total,paid,status').eq('supplier_id',selected).eq('status','COMPLETED').order('created_at',{ascending:false}).range(rows.length,rows.length+PAGE_SIZE-1)
  if(e)throw e;setRows(old=>[...old,...(data||[]) as Purchase[]]);setHasMore((data||[]).length===PAGE_SIZE)
 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}}
 if(!selected||!supplier){const filtered=suppliers.filter(x=>`${x.name} ${x.code} ${x.phone||''}`.toLowerCase().includes(search.toLowerCase()));return <section className="panel"><div className="panelHead"><div><h2>Nhà cung cấp</h2><p>Chọn NCC để xem phiếu nhập và thanh toán công nợ theo từng phiếu</p></div><button className="primary" onClick={add}>+ Thêm</button></div><div className="customerSearch"><input placeholder="Tìm nhà cung cấp..." value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="masterList">{filtered.map(x=><button type="button" className="customerListRow" key={x.id} onClick={()=>setSelected(x.id)}><span><b>{x.name}</b><small>{x.code}{x.phone?` • ${x.phone}`:''}</small></span><span className="customerDebt">Nợ {money(x.debt)}</span><ChevronRight size={17}/></button>)}{!filtered.length&&<div className="empty">Không có nhà cung cấp.</div>}</div></section>}
 return <section className="panel customerHistory"><div className="panelHead"><div><button className="customerBack" onClick={()=>setSelected(null)}><ArrowLeft size={16}/> Quay lại nhà cung cấp</button><h2>{supplier.name}</h2><p>{supplier.code}{supplier.phone?` • ${supplier.phone}`:''}</p></div><button className="outline" disabled={loading} onClick={()=>setReload(n=>n+1)}><RefreshCw size={15}/> Làm mới</button></div>
 <div className="customerStats"><div><small>Công nợ hiện tại (tất cả các ngày)</small><strong>{money(supplier.debt)}</strong></div><div><small>Phiếu nhập đã tải</small><strong>{rows.length}{hasMore?'+':''}</strong></div></div>
 <div className="customerHistoryTitle"><h3>Phiếu nhập theo ngày</h3><small>Thanh toán cho từng phiếu, không gộp ngày nhập</small></div>
 {error&&<p className="customerHistoryError" role="alert">{error}</p>}
 {rows.map(r=>{const open=expanded.includes(r.id);const remaining=Math.max(0,safeNum(r.total)-safeNum(r.paid));return <div className="customerInvoice" key={r.id}><button type="button" className="customerInvoiceHead" onClick={()=>setExpanded(old=>open?old.filter(x=>x!==r.id):[...old,r.id])}><span>{open?<ChevronDown size={17}/>:<ChevronRight size={17}/>}<span><b>{r.receipt_no}</b><small>{dateLabel(r.created_at)}</small></span></span><span className="customerInvoiceAmount"><b>{money(r.total)}</b><small>Đã trả {money(r.paid)} • Còn nợ {money(remaining)}</small></span></button>{open&&<div className="customerInvoiceBody"><div className="customerInvoiceActions">{remaining>0.005?<button className="primary" onClick={()=>setPay(r)}>Thanh toán NCC</button>:<span className="debtPaid">Đã thanh toán đủ</span>}</div></div>}</div>})}
 {!rows.length&&!loading&&!error&&<div className="empty">Chưa có phiếu nhập hoàn tất.</div>}{loading&&<div className="empty">Đang tải...</div>}{hasMore&&!loading&&<button className="outline customerMore" onClick={loadMore}>Tải thêm 50 phiếu</button>}
 {pay&&<DebtPaymentModal kind="PURCHASE" documentId={pay.id} documentNo={pay.receipt_no} partyName={supplier.name} remaining={Math.max(0,safeNum(pay.total)-safeNum(pay.paid))} onClose={()=>setPay(null)} onSuccess={()=>{setPay(null);setReload(n=>n+1);onPayment()}}/>}
 </section>
}
