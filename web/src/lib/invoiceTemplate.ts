export type InvoiceBlockId='store'|'title'|'meta'|'customer'|'items'|'totals'|'payment'|'qr'|'footer'
export type InvoiceTemplate={
 storeName:string
 businessName:string
 phone:string
 title:string
 footer:string
 showSku:boolean
 showUnitPrice:boolean
 showQty:boolean
 showSubtotal:boolean
 showDiscount:boolean
 showPayment:boolean
 showQr:boolean
 fontSize:number
 alignment:'left'|'center'
 blocks:InvoiceBlockId[]
}
export const DEFAULT_INVOICE_TEMPLATE:InvoiceTemplate={
 storeName:'SƠN & CHỐNG THẤM KOVA THẮNG NGA',
 businessName:'HỘ KD SƠN & CHỐNG THẤM KOVA',
 phone:'ĐT/ZALO: 033.246.1988',
 title:'HÓA ĐƠN BÁN HÀNG',
 footer:'Cảm ơn Quý khách!',
 showSku:true,showUnitPrice:true,showQty:true,showSubtotal:true,showDiscount:true,showPayment:true,showQr:true,
 fontSize:16,alignment:'center',
 blocks:['store','title','meta','customer','items','totals','payment','qr','footer']
}
const KEY='kho-xprinter-invoice-template-v5'
export function getInvoiceTemplate():InvoiceTemplate{try{const t={...DEFAULT_INVOICE_TEMPLATE,...JSON.parse(localStorage.getItem(KEY)||'{}')};if(t.fontSize<16)t.fontSize=16;return t}catch{return DEFAULT_INVOICE_TEMPLATE}}
export function saveInvoiceTemplate(t:InvoiceTemplate){localStorage.setItem(KEY,JSON.stringify(t))}
