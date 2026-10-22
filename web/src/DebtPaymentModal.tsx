import {useRef,useState} from 'react'
import {X} from 'lucide-react'
import {supabase} from './lib/supabase'
import {money,safeNum} from './lib/format'

type Kind='SALE'|'PURCHASE'
type Props={kind:Kind;documentId:string;documentNo:string;partyName:string;remaining:number;onClose:()=>void;onSuccess:()=>void}

export default function DebtPaymentModal({kind,documentId,documentNo,partyName,remaining,onClose,onSuccess}:Props){
 const [amount,setAmount]=useState(String(remaining))
 const [method,setMethod]=useState('CASH')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 // Reuse the same request ID on retry after an uncertain network failure.
 const request=useRef<string>(crypto.randomUUID())
 const submitted=useRef(false)
 const amountNumber=Number(amount)
 const valid=Number.isFinite(amountNumber)&&amountNumber>0&&amountNumber<=remaining&&Math.round(amountNumber*100)===amountNumber*100
 async function submit(){
  if(submitted.current||busy||!valid||!supabase)return
  submitted.current=true;setBusy(true);setError('')
  try{
   const {error:rpcError}=await supabase.rpc('settle_debt_v5',{p_kind:kind,p_document_id:documentId,p_amount:amountNumber,p_method:method,p_request_id:request.current})
   if(rpcError)throw rpcError
   onSuccess()
  }catch(e){setError(e instanceof Error?e.message:String(e));submitted.current=false}
  finally{setBusy(false)}
 }
 return <div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><div className="modalCard debtModal" role="dialog" aria-modal="true" aria-label="Xác nhận thanh toán công nợ">
  <div className="modalHead"><div><h2>{kind==='SALE'?'Khách hàng thanh toán công nợ':'Thanh toán cho nhà cung cấp'}</h2><p>{partyName} • {documentNo}</p></div><button type="button" className="iconBtn" disabled={busy} onClick={onClose}><X size={18}/></button></div>
  <div className="debtBalance"><span>Còn nợ của chứng từ này</span><strong>{money(remaining)}</strong></div>
  <label>Số tiền thực tế đã {kind==='SALE'?'nhận':'trả'}<input type="number" min="0.01" max={remaining} step="0.01" value={amount} onChange={e=>{setAmount(e.target.value);request.current=crypto.randomUUID()}}/></label>
  <label>Phương thức thanh toán<select value={method} onChange={e=>{setMethod(e.target.value);request.current=crypto.randomUUID()}}><option value="CASH">Tiền mặt</option><option value="TRANSFER">Chuyển khoản</option>{kind==='SALE'&&<option value="CARD">Thẻ</option>}</select></label>
  <p className="debtHint">Chỉ ghi nhận sau khi tiền thực tế đã {kind==='SALE'?'nhận':'trả'}. Cho phép trả một phần hoặc trả hết. Ngày thu/chi là ngày xác nhận, không thay đổi ngày hóa đơn gốc.</p>
  {error&&<p className="customerHistoryError" role="alert">{error}</p>}
  <div className="modalFoot"><button className="outline" type="button" disabled={busy} onClick={onClose}>Hủy</button><button className="primary" type="button" disabled={busy||!valid} onClick={submit}>{busy?'Đang ghi nhận...':`Xác nhận ${kind==='SALE'?'đã nhận':'đã trả'} ${valid?money(safeNum(amount)):''}`}</button></div>
 </div></div>
}
