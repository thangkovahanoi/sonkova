import {useEffect,useMemo,useState} from 'react'
import type {Dispatch,SetStateAction} from 'react'
import {Activity,AlertTriangle,ArrowLeftRight,BarChart3,Barcode,Boxes,ChevronRight,CircleUserRound,ClipboardCheck,FileText,LogIn,LogOut,Menu,Package,Printer,RefreshCw,Search,Settings as SettingsIcon,ShoppingCart,Truck,TruckIcon,Users,Warehouse as WarehouseIcon,X,Pencil,Trash2,Power,RotateCcw,Plus} from 'lucide-react'
import {supabase} from './lib/supabase'
import {money,invoiceNo,safeNum} from './lib/format'
import {getBridgeHealth,printLabel,printReceipt,testPrinter,listPrinters,getPrinterSettings,savePrinterSettings} from './lib/print'
import type {PrintMode,PrinterInfo,PrinterSettings} from './lib/print'
import {DEFAULT_INVOICE_TEMPLATE,getInvoiceTemplate,saveInvoiceTemplate} from './lib/invoiceTemplate'
import type {InvoiceTemplate,InvoiceBlockId} from './lib/invoiceTemplate'
import BarcodeScanner from './BarcodeScanner'
import CustomerHistory from './CustomerHistory'
import SupplierHistory from './SupplierHistory'
import SalesReturns from './SalesReturns'
import type {Customer,Product,StockMovement,Supplier,Warehouse} from './types'

type Tab='dashboard'|'pos'|'products'|'purchases'|'transfers'|'inventory'|'warehouses'|'customers'|'suppliers'|'history'|'cash'|'reports'|'printing'|'settings'|'returns'
type CartLine={product:Product;qty:number;price:number}
type CashTransaction={id:string;type:string;direction:'IN'|'OUT';amount:number;payment_method:string;reference_type:string|null;reference_id:string|null;note:string|null;created_at:string;customer?:{name:string}|null;supplier?:{name:string}|null}
type ProductForm={sku:string;barcode:string;name:string;category:string;unit:string;cost_price:number;sale_price:number;min_stock:number;location:string;active:boolean}

const BANK_PAYMENT={bankName:'MB Bank',bankBin:'970422',accountNo:'1313138888',accountName:'HO KINH DOANH SON & CHONG THAM KOVA THANG NGA'}

function vietQrUrl(amount:number,addInfo:string){
 const params=new URLSearchParams({amount:String(Math.round(amount)),addInfo,accountName:BANK_PAYMENT.accountName})
 return `https://img.vietqr.io/image/${BANK_PAYMENT.bankBin}-${BANK_PAYMENT.accountNo}-compact2.png?${params.toString()}`
}

const demo:Product[]=[
{id:'d1',sku:'KOVA-KV551OW',barcode:'893000000001',name:'Sơn KOVA KV551OW',category:'Sơn KOVA',unit:'thùng',cost_price:420000,sale_price:480000,stock_qty:24,min_stock:5,location:'Kệ A1',created_at:new Date().toISOString()},
{id:'d2',sku:'KOVA-CT04T',barcode:'893000000002',name:'KOVA CT04T Gold 20kg',category:'Sơn KOVA',unit:'thùng',cost_price:390000,sale_price:450000,stock_qty:7,min_stock:8,location:'Kệ A2',created_at:new Date().toISOString()},
{id:'d3',sku:'KOVA-K360',barcode:'893000000003',name:'KOVA K360 Gold 20kg',category:'Sơn KOVA',unit:'thùng',cost_price:410000,sale_price:470000,stock_qty:16,min_stock:5,location:'Kệ A3',created_at:new Date().toISOString()}
]

export default function App(){
 const [returnSaleId,setReturnSaleId]=useState<string|null>(null)
 const [tab,setTab]=useState<Tab>('dashboard'),[products,setProducts]=useState<Product[]>([]),[managedProducts,setManagedProducts]=useState<Product[]>([]),[movements,setMovements]=useState<StockMovement[]>([])
 const [customers,setCustomers]=useState<Customer[]>([]),[suppliers,setSuppliers]=useState<Supplier[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([])
 const [cashTransactions,setCashTransactions]=useState<CashTransaction[]>([])
 const [query,setQuery]=useState(''),[message,setMessage]=useState(''),[scanner,setScanner]=useState(false),[mobile,setMobile]=useState(false),[loading,setLoading]=useState(false)
 const [cart,setCart]=useState<CartLine[]>([]),[discountPercent,setDiscountPercent]=useState(0),[payment,setPayment]=useState('CASH'),[customerId,setCustomerId]=useState('')
 const [transferOpen,setTransferOpen]=useState(false),[transferInvoice,setTransferInvoice]=useState(''),[transferQr,setTransferQr]=useState(''),[transferBusy,setTransferBusy]=useState(false)
 const [purchaseCart,setPurchaseCart]=useState<CartLine[]>([]),[supplierId,setSupplierId]=useState(''),[purchasePayment,setPurchasePayment]=useState('CASH'),[purchasePaid,setPurchasePaid]=useState(0),[purchaseDate,setPurchaseDate]=useState(()=>new Date().toISOString().slice(0,10))
 const [fromWarehouse,setFromWarehouse]=useState(''),[toWarehouse,setToWarehouse]=useState(''),[transferProduct,setTransferProduct]=useState(''),[transferQty,setTransferQty]=useState(1)
 const [warehouseId,setWarehouseId]=useState(''),[bridge,setBridge]=useState('Chưa kiểm tra')
 const [productEditor,setProductEditor]=useState<Product|null|undefined>(undefined),[productShowInactive,setProductShowInactive]=useState(true),[productQuery,setProductQuery]=useState('')
 const [productForm,setProductForm]=useState<ProductForm>({sku:'',barcode:'',name:'',category:'SƠN NỘI THẤT',unit:'Thùng',cost_price:0,sale_price:0,min_stock:5,location:'SƠN NỘI THẤT',active:true})
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[auth,setAuth]=useState<string|null>(null)
 const [inventoryCountId,setInventoryCountId]=useState(''),[countRows,setCountRows]=useState<any[]>([]),[cashDate,setCashDate]=useState(()=>new Date().toISOString().slice(0,10)),[cashRefresh,setCashRefresh]=useState(0)

 async function load(){
  setLoading(true)
  try{
   if(!supabase){setProducts(demo);setManagedProducts(demo);return}
   const dayStart=new Date();dayStart.setHours(0,0,0,0)
   const dayEnd=new Date();dayEnd.setHours(23,59,59,999)
   const [ps,cs,ss,ws,ms,cts]=await Promise.all([
    supabase.from('products').select('*').order('name'),
    supabase.from('customers').select('*').eq('active',true).order('name'),
    supabase.from('suppliers').select('*').eq('active',true).order('name'),
    supabase.from('warehouses').select('*').eq('active',true).order('name'),
    supabase.from('stock_movements').select('*,product:products(sku,name,unit)').order('created_at',{ascending:false}).limit(100),
    supabase.from('cash_transactions').select('id,type,direction,amount,payment_method,reference_type,reference_id,note,created_at,customer:customers(name),supplier:suppliers(name)').gte('created_at',dayStart.toISOString()).lte('created_at',dayEnd.toISOString()).order('created_at',{ascending:false})
   ])
   if(ps.error)throw ps.error
   setCustomers((cs.data||[]) as Customer[]);setSuppliers((ss.data||[]) as Supplier[]);setWarehouses((ws.data||[]) as Warehouse[]);setMovements((ms.data||[]) as StockMovement[]);setCashTransactions((cts.data||[]).map((row:any)=>({...row,customer:Array.isArray(row.customer)?(row.customer[0]??null):row.customer,supplier:Array.isArray(row.supplier)?(row.supplier[0]??null):row.supplier})) as CashTransaction[])
   const w=warehouseId||ws.data?.find((x:any)=>x.is_default)?.id||ws.data?.[0]?.id||''
   if(w!==warehouseId)setWarehouseId(w)
   const stock=await supabase.from('warehouse_stock').select('product_id,stock_qty,location').eq('warehouse_id',w)
   const map=new Map((stock.data||[]).map((x:any)=>[x.product_id,x]))
   const mapped=(ps.data||[]).map((p:any)=>({...p,stock_qty:Number(map.get(p.id)?.stock_qty||0),location:map.get(p.id)?.location||null})) as Product[]
   setManagedProducts(mapped)
   setProducts(mapped.filter(p=>p.active!==false))
   const session=await supabase.auth.getSession();setAuth(session.data.session?.user.email||null)
  }catch(e){setMessage(e instanceof Error?e.message:'Không tải được dữ liệu')}
  finally{setLoading(false)}
 }
 async function loadCashForDate(date:string){
  if(!supabase)return
  const start=new Date(`${date}T00:00:00`),end=new Date(`${date}T23:59:59.999`)
  const {data,error}=await supabase.from('cash_transactions').select('id,type,direction,amount,payment_method,reference_type,reference_id,note,created_at,customer:customers(name),supplier:suppliers(name)').gte('created_at',start.toISOString()).lte('created_at',end.toISOString()).order('created_at',{ascending:false})
  if(error){setMessage(error.message);return}
  setCashTransactions((data||[]).map((row:any)=>({...row,customer:Array.isArray(row.customer)?(row.customer[0]??null):row.customer,supplier:Array.isArray(row.supplier)?(row.supplier[0]??null):row.supplier})) as CashTransaction[])
 }
 useEffect(()=>{load()},[warehouseId])
 useEffect(()=>{loadCashForDate(cashDate)},[cashDate,cashRefresh])

 const filtered=useMemo(()=>products.filter(p=>`${p.sku} ${p.barcode||''} ${p.name}`.toLowerCase().includes(query.toLowerCase())),[products,query])
 const totalStock=products.reduce((a,p)=>a+safeNum(p.stock_qty),0),stockValue=products.reduce((a,p)=>a+safeNum(p.stock_qty)*safeNum(p.cost_price),0)
 const low=products.filter(p=>safeNum(p.stock_qty)<=safeNum(p.min_stock))
 const cartTotal=cart.reduce((a,x)=>a+x.qty*x.price,0),discountAmount=Math.round(cartTotal*Math.min(100,Math.max(0,discountPercent))/100),finalTotal=Math.max(0,cartTotal-discountAmount)
 const purchaseTotal=purchaseCart.reduce((a,x)=>a+x.qty*x.price,0)
 const warehouse=warehouses.find(w=>w.id===warehouseId)

 async function login(){
  if(!supabase){setMessage('Demo mode — cấu hình Supabase để đăng nhập');return}
  const {error}=await supabase.auth.signInWithPassword({email,password})
  if(error)setMessage(error.message);else{setMessage('Đăng nhập thành công');load()}
 }
 async function logout(){await supabase?.auth.signOut();setAuth(null)}

 function addCart(p:Product){setCart(old=>old.some(x=>x.product.id===p.id)?old.map(x=>x.product.id===p.id?{...x,qty:x.qty+1}:x):[...old,{product:p,qty:1,price:safeNum(p.sale_price)}])}
 function addPurchase(p:Product){setPurchaseCart(old=>old.some(x=>x.product.id===p.id)?old.map(x=>x.product.id===p.id?{...x,qty:x.qty+1}:x):[...old,{product:p,qty:1,price:safeNum(p.cost_price)}])}
 function change(setter:any,id:string,d:number){setter((old:CartLine[])=>old.map(x=>x.product.id===id?{...x,qty:Math.max(1,x.qty+d)}:x).filter(x=>x.qty>0))}

 async function finishCheckout(invoice:string){
  try{
   const items=cart.map(x=>({product_id:x.product.id,quantity:x.qty,unit_price:x.price,discount:0}))
   const paid=payment==='DEBT'?0:finalTotal
   const {data,error}=await supabase!.rpc('complete_sale_v5',{p_invoice_no:invoice,p_warehouse_id:warehouseId,p_customer_id:customerId||null,p_items:items,p_discount:discountAmount,p_tax:0,p_paid:paid,p_payment_method:payment,p_note:null})
   if(error)throw error
   try{
    const qrData = payment==='TRANSFER' ? vietQrUrl(finalTotal,`THANHTOAN ${invoice}`) : undefined
    await printReceipt(cart.map(x=>({name:x.product.name,sku:x.product.sku,qty:x.qty,unitPrice:x.price})),`HÓA ĐƠN ${data.invoice_no}`,payment==='TRANSFER'?{paymentMethod:'CHUYỂN KHOẢN',paymentBank:BANK_PAYMENT.bankName,paymentAccount:BANK_PAYMENT.accountNo,paymentAccountName:BANK_PAYMENT.accountName,paymentInfo:`Nội dung: ${invoice}`,invoiceNo:String(data.invoice_no),subtotal:cartTotal,discount:discountAmount,total:finalTotal,qrData}: {invoiceNo:String(data.invoice_no),subtotal:cartTotal,discount:discountAmount,total:finalTotal},undefined,undefined,getInvoiceTemplate())
   }catch(printErr){setMessage(`Đã lưu hóa đơn ${data.invoice_no}, nhưng chưa in được: ${String(printErr)}`);setCart([]);setDiscountPercent(0);setTransferOpen(false);load();return}
   setCart([]);setDiscountPercent(0);setTransferOpen(false);setTransferInvoice('');setTransferQr('');setMessage(`Đã hoàn tất ${data.invoice_no} • ${money(data.total)}`);load()
  }catch(e){setMessage(e instanceof Error?e.message:'Thanh toán thất bại')}
 }

 async function checkout(){
  if(!cart.length){setMessage('Chưa có sản phẩm');return}
  if(!warehouseId){setMessage('Chưa chọn kho');return}
  if(finalTotal<=0){setMessage('Tổng thanh toán phải lớn hơn 0');return}
  if(!supabase){setCart([]);setMessage(`Demo: đã tạo ${invoiceNo()} • ${money(finalTotal)}`);return}
  const invoice=invoiceNo()
  if(payment==='TRANSFER'){
   const info=`THANHTOAN ${invoice}`
   setTransferInvoice(invoice)
   setTransferQr(vietQrUrl(finalTotal,info))
   setTransferOpen(true)
   return
  }
  await finishCheckout(invoice)
 }

 async function completePurchase(){
  if(!purchaseCart.length){setMessage('Chưa có hàng nhập');return}
  if(!warehouseId){setMessage('Chưa chọn kho');return}
  if(purchasePayment==='DEBT'&&!supplierId){setMessage('Vui lòng chọn nhà cung cấp khi nhập công nợ');return}
  const paid=purchasePayment==='DEBT'?0:Math.min(purchaseTotal,Math.max(0,safeNum(purchasePaid)||purchaseTotal))
  if(!supabase){setPurchaseCart([]);setPurchasePaid(0);setMessage(`Demo: đã tạo ${invoiceNo('PN')}`);return}
  const no=invoiceNo('PN'),items=purchaseCart.map(x=>({product_id:x.product.id,quantity:x.qty,unit_cost:x.price,discount:0}))
  const {data,error}=await supabase.rpc('complete_purchase_v5',{p_receipt_no:no,p_warehouse_id:warehouseId,p_supplier_id:supplierId||null,p_items:items,p_discount:0,p_paid:paid,p_note:null,p_purchase_date:purchaseDate})
  if(error)setMessage(error.message);else{setPurchaseCart([]);setPurchasePaid(0);setPurchasePayment('CASH');setSupplierId('');setMessage(`Đã nhập ${data.receipt_no} • ${money(data.total)}${safeNum(data.total)-paid>0?` • Công nợ NCC ${money(safeNum(data.total)-paid)}`:''}`);load()}
 }

 async function completeTransfer(){
  if(!transferProduct||!fromWarehouse||!toWarehouse||fromWarehouse===toWarehouse){setMessage('Chọn kho đi, kho đến và sản phẩm');return}
  const q=safeNum(transferQty);if(q<=0)return
  if(!supabase){setMessage('Demo: chuyển kho đã mô phỏng');return}
  const no=invoiceNo('CK')
  const {error}=await supabase.rpc('complete_transfer_v5',{p_transfer_no:no,p_from_warehouse:fromWarehouse,p_to_warehouse:toWarehouse,p_items:[{product_id:transferProduct,quantity:q}],p_note:null})
  if(error)setMessage(error.message);else{setMessage(`Đã chuyển kho ${no}`);load()}
 }

 async function createMaster(type:'customer'|'supplier'|'warehouse'){
  const name=prompt(type==='warehouse'?'Tên kho':type==='customer'?'Tên khách hàng':'Tên nhà cung cấp')
  if(!name||!supabase)return
  const code=(prompt('Mã:',`${type==='warehouse'?'KHO':type==='customer'?'KH':'NCC'}-${Date.now().toString().slice(-5)}`)||'').trim()
  if(!code)return
  const table=type==='warehouse'?'warehouses':type==='customer'?'customers':'suppliers'
  const {error}=await supabase.from(table).insert({code,name})
  setMessage(error?error.message:`Đã thêm ${name}`);if(!error)load()
 }

 async function openProductCreate(){
  setProductEditor(null)
  setProductForm({sku:'',barcode:'',name:'',category:'SƠN NỘI THẤT',unit:'Thùng',cost_price:0,sale_price:0,min_stock:5,location:'SƠN NỘI THẤT',active:true})
 }
 function openProductEdit(p:Product){
  setProductEditor(p)
  setProductForm({sku:p.sku,barcode:p.barcode||'',name:p.name,category:p.category||'SƠN NỘI THẤT',unit:p.unit||'Thùng',cost_price:safeNum(p.cost_price),sale_price:safeNum(p.sale_price),min_stock:(p.min_stock===null||p.min_stock===undefined)?5:safeNum(p.min_stock),location:p.location||'SƠN NỘI THẤT',active:p.active!==false})
 }
 async function saveProduct(){
  if(!supabase){setMessage('Demo mode — cấu hình Supabase để quản lý sản phẩm');return}
  if(!productForm.sku.trim()||!productForm.name.trim()){setMessage('SKU và Tên hàng là bắt buộc');return}
  setLoading(true)
  try{
   const {data,error}=await supabase.rpc('manage_product_v5',{
    p_product_id:productEditor?.id||null,
    p_sku:productForm.sku.trim(),p_barcode:productForm.barcode.trim()||null,p_name:productForm.name.trim(),
    p_category:productForm.category.trim()||'SƠN NỘI THẤT',p_unit:productForm.unit.trim()||'Thùng',
    p_cost_price:safeNum(productForm.cost_price),p_sale_price:safeNum(productForm.sale_price),p_min_stock:safeNum(productForm.min_stock),
    p_active:productForm.active,p_warehouse_id:warehouseId||null,p_location:productForm.location.trim()||null
   })
   if(error)throw error
   const savedBarcode=(data as any)?.barcode
   setProductEditor(undefined)
   setMessage(productEditor?`Đã cập nhật sản phẩm${savedBarcode?` • Barcode: ${savedBarcode}`:''}`:`Đã thêm sản phẩm • Barcode: ${savedBarcode||'đã tự tạo'}`)
   await load()
  }catch(e){setMessage(e instanceof Error?e.message:'Không lưu được sản phẩm')}
  finally{setLoading(false)}
 }
 async function deleteProduct(p:Product){
  if(!supabase){setMessage('Demo mode — không thể xóa dữ liệu mẫu');return}
  if(!confirm(`Xóa sản phẩm "${p.name}" (${p.sku})? Chỉ sản phẩm chưa phát sinh giao dịch mới được xóa.`))return
  setLoading(true)
  try{const {error}=await supabase.rpc('delete_product_v5',{p_product_id:p.id});if(error)throw error;setMessage(`Đã xóa ${p.sku}`);await load()}catch(e){setMessage(e instanceof Error?e.message:'Không thể xóa sản phẩm')}finally{setLoading(false)}
 }
 async function setProductActive(p:Product,active:boolean){
  if(!supabase){setMessage('Demo mode — cấu hình Supabase để thay đổi trạng thái');return}
  try{const {error}=await supabase.rpc('set_product_active_v5',{p_product_id:p.id,p_active:active});if(error)throw error;setMessage(active?`Đã mở bán ${p.sku}`:`Đã ngừng kinh doanh ${p.sku}`);await load()}catch(e){setMessage(e instanceof Error?e.message:'Không đổi được trạng thái sản phẩm')}
 }

 async function startCount(){
  if(!supabase||!warehouseId){setMessage('Chưa chọn kho');return}
  const no=invoiceNo('KK')
  const {data,error}=await supabase.rpc('start_inventory_count_v5',{p_count_no:no,p_warehouse_id:warehouseId,p_note:null})
  if(error)setMessage(error.message);else{setInventoryCountId(data.id);const r=await supabase.from('inventory_count_items').select('id,product_id,system_qty,counted_qty,product:products(sku,name,unit)').eq('count_id',data.id);setCountRows(r.data||[]);setTab('inventory');setMessage(`Đã tạo phiếu kiểm kê ${no}`)}
 }
 async function finishCount(){
  if(!supabase||!inventoryCountId)return
  for(const r of countRows){await supabase.from('inventory_count_items').update({counted_qty:safeNum(r.counted_qty)}).eq('id',r.id)}
  const {error}=await supabase.rpc('complete_inventory_count_v5',{p_count_id:inventoryCountId})
  if(error)setMessage(error.message);else{setMessage('Đã hoàn tất kiểm kê và cập nhật tồn');setInventoryCountId('');setCountRows([]);load()}
 }

 const menu=[
  ['dashboard','Tổng quan',Activity],['pos','Bán hàng',ShoppingCart],['returns','Trả hàng',RotateCcw],['products','Sản phẩm',Boxes],['purchases','Nhập hàng',Truck],['transfers','Chuyển kho',ArrowLeftRight],['inventory','Kiểm kê',ClipboardCheck],
  ['warehouses','Kho hàng',WarehouseIcon],['customers','Khách hàng',Users],['suppliers','Nhà cung cấp',TruckIcon],['history','Lịch sử',RefreshCw],['cash','Thu chi',FileText],['reports','Báo cáo',BarChart3],['printing','Máy in',Printer],['settings','Cài đặt',SettingsIcon]
 ] as const

 return <div className="app">
  <aside className={mobile?'sidebar open':'sidebar'}><div className="brand"><div className="brandIcon">K</div><div><b>SƠN KOVA</b><span>V5 • Stable Core</span></div><button className="closeNav" onClick={()=>setMobile(false)}><X/></button></div>
   <div className="warehouseSelect"><span>Kho đang làm việc</span><select value={warehouseId} onChange={e=>setWarehouseId(e.target.value)}>{warehouses.map(w=><option key={w.id} value={w.id}>{w.code} • {w.name}</option>)}{!warehouses.length&&<option value="">Demo</option>}</select></div>
   <nav>{menu.map(([id,label,I])=><button key={id} className={tab===id?'active':''} onClick={()=>{setTab(id as Tab);setMobile(false)}}><I size={16}/>{label}</button>)}</nav>
   <div className="sideBottom"><div className="bridgeState"><i/> {bridge}</div>{auth?<button className="logout" onClick={logout}><LogOut size={15}/>{auth}</button>:<button className="logout" onClick={()=>setTab('settings')}><CircleUserRound size={15}/>Đăng nhập</button>}</div>
  </aside>
  <main className="main"><header><div className="headerLeft"><button className="mobileMenu" onClick={()=>setMobile(true)}><Menu/></button><div><h1>{menu.find(x=>x[0]===tab)?.[1]}</h1><p>{warehouse?`${warehouse.code} • ${warehouse.name}`:'Kho demo'} • Hệ thống máy in</p></div></div><div className="headerActions"><button className="scanTop" onClick={()=>setScanner(true)}><Barcode/> Quét</button><button className="iconBtn" onClick={load}><RefreshCw className={loading?'spin':''}/></button></div></header>
   {message&&<div className="toast">{message}<button onClick={()=>setMessage('')}>×</button></div>}
   {tab==='dashboard'&&<Dashboard products={products} low={low} total={totalStock} value={stockValue} onTab={setTab}/>}
   {tab==='pos'&&<POS products={filtered} cart={cart} setQuery={setQuery} query={query} add={addCart} change={(id,d)=>change(setCart,id,d)} remove={id=>setCart(old=>old.filter(x=>x.product.id!==id))} total={cartTotal} discountPercent={discountPercent} setDiscountPercent={setDiscountPercent} discountAmount={discountAmount} final={finalTotal} payment={payment} setPayment={setPayment} customerId={customerId} setCustomerId={setCustomerId} customers={customers} checkout={checkout} scan={()=>setScanner(true)}/>}
   {tab==='products'&&<Products products={products} managedProducts={managedProducts} query={productQuery} setQuery={setProductQuery} showInactive={productShowInactive} setShowInactive={setProductShowInactive} scan={()=>setScanner(true)} create={openProductCreate} edit={openProductEdit} remove={deleteProduct} setActive={setProductActive} print={async p=>{try{await printLabel({name:p.name,sku:p.sku,barcode:p.barcode,price:p.sale_price},1);setMessage('Đã gửi tem')}catch(e){setMessage(String(e))}}}/>}
   {tab==='purchases'&&<Purchases products={products} cart={purchaseCart} add={addPurchase} change={(id,d)=>change(setPurchaseCart,id,d)} remove={id=>setPurchaseCart(old=>old.filter(x=>x.product.id!==id))} total={purchaseTotal} suppliers={suppliers} supplierId={supplierId} setSupplierId={setSupplierId} payment={purchasePayment} setPayment={setPurchasePayment} paid={purchasePaid} setPaid={setPurchasePaid} purchaseDate={purchaseDate} setPurchaseDate={setPurchaseDate} submit={completePurchase}/>}
   {tab==='transfers'&&<Transfers products={products} warehouses={warehouses} from={fromWarehouse} setFrom={setFromWarehouse} to={toWarehouse} setTo={setToWarehouse} product={transferProduct} setProduct={setTransferProduct} qty={transferQty} setQty={setTransferQty} submit={completeTransfer}/>}
   {tab==='inventory'&&<Inventory rows={countRows} active={!!inventoryCountId} start={startCount} finish={finishCount} setRows={setCountRows}/>}
   {tab==='warehouses'&&<MasterList title="Kho hàng" icon={<WarehouseIcon/>} rows={warehouses.map(w=>({id:w.id,code:w.code,name:w.name,extra:w.address||'-'}))} add={()=>createMaster('warehouse')}/>}
   {tab==='customers'&&<CustomerHistory customers={customers} add={()=>createMaster('customer')} onPayment={load} onReturn={id=>{setReturnSaleId(id);setTab('returns')}}/>}
   {tab==='suppliers'&&<SupplierHistory suppliers={suppliers} add={()=>createMaster('supplier')} onPayment={()=>{load();setCashRefresh(n=>n+1)}}/>}
   {tab==='returns'&&<SalesReturns initialSaleId={returnSaleId} onCompleted={()=>{load();setCashRefresh(n=>n+1)}}/>}
   {tab==='history'&&<History rows={movements}/>}
   {tab==='cash'&&<Cash customers={customers} suppliers={suppliers} transactions={cashTransactions} refresh={()=>{load();setCashRefresh(x=>x+1)}} selectedDate={cashDate} setSelectedDate={setCashDate} refreshToken={cashRefresh}/>}
   {tab==='reports'&&<Reports products={products} total={totalStock} value={stockValue} transactions={cashTransactions}/>}
   {tab==='printing'&&<Printing products={products} bridge={bridge} setBridge={setBridge} message={setMessage}/>}
   {tab==='settings'&&<Settings auth={auth} email={email} setEmail={setEmail} password={password} setPassword={setPassword} login={login} message={setMessage}/>}
   {transferOpen&&<TransferModal invoice={transferInvoice} amount={finalTotal} qr={transferQr} busy={transferBusy} cancel={()=>{if(!transferBusy)setTransferOpen(false)}} confirm={async()=>{setTransferBusy(true);try{await finishCheckout(transferInvoice)}finally{setTransferBusy(false)}}}/>}
  </main>
  {productEditor!==undefined&&<ProductModal editing={productEditor} form={productForm} setForm={setProductForm} save={saveProduct} close={()=>setProductEditor(undefined)} loading={loading}/> }
  {scanner&&<BarcodeScanner onDetected={v=>{setScanner(false);setQuery(v);const p=products.find(x=>x.barcode===v||x.sku===v);if(p){addCart(p);setTab('pos');setMessage(`Đã thêm ${p.name}`)}else setMessage(`Không tìm thấy mã ${v}`)}} onClose={()=>setScanner(false)}/>}
 </div>
}

function TransferModal({invoice,amount,qr,busy,cancel,confirm}:{invoice:string;amount:number;qr:string;busy:boolean;cancel:()=>void;confirm:()=>void}){
 return <div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)cancel()}}><div className="modalCard transferModal"><div className="modalHead"><div><h2>Thanh toán chuyển khoản</h2><p>Hóa đơn {invoice}</p></div><button className="iconBtn" onClick={cancel} disabled={busy}><X size={17}/></button></div><div className="transferQr"><img src={qr} alt="VietQR thanh toán"/><strong>{money(amount)}</strong><small>MB Bank • {BANK_PAYMENT.accountNo}</small><small>Nội dung chuyển khoản: THANHTOAN {invoice}</small></div><div className="modalActions"><button className="outline" onClick={cancel} disabled={busy}>Hủy</button><button className="primary" onClick={confirm} disabled={busy}>{busy?'Đang xử lý...':'Đã nhận tiền • Hoàn tất & In'}</button></div></div></div>
}

function Dashboard({products,low,total,value,onTab}:{products:Product[];low:Product[];total:number;value:number;onTab:(t:Tab)=>void}){return <><section className="cards"><Stat title="Sản phẩm" value={products.length.toString()} sub="SKU" icon={<Boxes/>}/><Stat title="Tồn kho" value={total.toString()} sub="đơn vị" icon={<Package/>}/><Stat title="Giá trị tồn" value={money(value)} sub="giá nhập" icon={<Activity/>}/><Stat title="Sắp hết" value={low.length.toString()} sub="cần nhập" icon={<AlertTriangle/>}/></section><div className="twoCol"><section className="panel"><div className="panelHead"><div><h2>Hàng sắp hết</h2><p>Dưới mức tồn tối thiểu</p></div><button onClick={()=>onTab('products')}>Xem tất cả <ChevronRight size={14}/></button></div><table><thead><tr><th>SKU</th><th>Sản phẩm</th><th>Tồn</th><th>Tối thiểu</th></tr></thead><tbody>{low.map(p=><tr key={p.id}><td>{p.sku}</td><td>{p.name}</td><td className="danger">{p.stock_qty} {p.unit}</td><td>{p.min_stock}</td></tr>)}{!low.length&&<tr><td colSpan={4} className="empty">Không có sản phẩm sắp hết.</td></tr>}</tbody></table></section><section className="panel quick"><h2>Thao tác nhanh</h2><Quick label="Bán hàng" sub="POS & in hóa đơn" icon={<ShoppingCart/>} onClick={()=>onTab('pos')}/><Quick label="Nhập hàng" sub="Tạo phiếu nhập" icon={<Truck/>} onClick={()=>onTab('purchases')}/><Quick label="Chuyển kho" sub="Điều chuyển nội bộ" icon={<ArrowLeftRight/>} onClick={()=>onTab('transfers')}/><Quick label="Kiểm kê" sub="Quét & đối chiếu tồn" icon={<ClipboardCheck/>} onClick={()=>onTab('inventory')}/></section></div></>}
function Stat({title,value,sub,icon}:{title:string;value:string;sub:string;icon:any}){return <div className="stat"><div className="statIcon">{icon}</div><span>{title}</span><strong>{value}</strong><small>{sub}</small></div>}
function Quick({label,sub,icon,onClick}:{label:string;sub:string;icon:any;onClick:()=>void}){return <button onClick={onClick}>{icon}<div><b>{label}</b><span>{sub}</span></div><ChevronRight/></button>}

function POS({products,cart,setQuery,query,add,change,remove,total,discountPercent,setDiscountPercent,discountAmount,final,payment,setPayment,customerId,setCustomerId,customers,checkout,scan}:{products:Product[];cart:CartLine[];setQuery:(s:string)=>void;query:string;add:(p:Product)=>void;change:(id:string,d:number)=>void;remove:(id:string)=>void;total:number;discountPercent:number;setDiscountPercent:(n:number)=>void;discountAmount:number;final:number;payment:string;setPayment:(s:string)=>void;customerId:string;setCustomerId:(s:string)=>void;customers:Customer[];checkout:()=>void;scan:()=>void}){return <div className="pos"><section className="panel catalog"><div className="panelHead"><div className="search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tên / SKU / barcode"/></div><button className="scanBtn" onClick={scan}><Barcode/> Quét</button></div><div className="catalogGrid">{products.map(p=><button className="catalogItem" key={p.id} onClick={()=>add(p)} disabled={p.stock_qty<=0}><span>{p.category}</span><b>{p.name}</b><small>{p.sku}</small><strong>{money(p.sale_price)}</strong><em>Tồn {p.stock_qty} {p.unit}</em></button>)}</div></section><section className="panel cart"><div className="panelHead"><div><h2>Đơn hàng</h2><p>{cart.length} dòng • {money(total)}</p></div><button onClick={()=>setCartSafe(remove,cart)}>Xóa tất cả</button></div><div className="cartLines">{cart.map(x=><div className="cartLine" key={x.product.id}><div><b>{x.product.name}</b><small>{money(x.price)} / {x.product.unit}</small></div><div className="qty"><button onClick={()=>change(x.product.id,-1)}>−</button><span>{x.qty}</span><button onClick={()=>change(x.product.id,1)}>+</button></div><strong>{money(x.qty*x.price)}</strong></div>)}{!cart.length&&<div className="empty">Chưa có sản phẩm.</div>}</div><div className="checkout"><label>Khách hàng<select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Khách lẻ</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} • {c.phone||''}</option>)}</select></label><div className="row"><label>Chiết khấu (%)<input type="number" min="0" max="100" step="0.1" inputMode="decimal" placeholder="0" value={discountPercent||''} onChange={e=>setDiscountPercent(Math.min(100,Math.max(0,safeNum(e.target.value))))}/><small className="discountHint">Giảm {money(discountAmount)}</small></label><label>Thanh toán<select value={payment} onChange={e=>setPayment(e.target.value)}><option value="CASH">Tiền mặt</option><option value="TRANSFER">Chuyển khoản</option><option value="CARD">Thẻ</option><option value="DEBT">Ghi nợ</option></select></label></div><div className="total"><span>Tổng</span><strong>{money(final)}</strong></div><button className="checkoutBtn" onClick={checkout}>Thanh toán & In hóa đơn</button></div></section></div>}
function setCartSafe(remove:(id:string)=>void,cart:CartLine[]){cart.forEach(x=>remove(x.product.id))}

function Products({products,managedProducts,query,setQuery,showInactive,setShowInactive,scan,create,edit,remove,setActive,print}:{products:Product[];managedProducts:Product[];query:string;setQuery:(s:string)=>void;showInactive:boolean;setShowInactive:(v:boolean)=>void;scan:()=>void;create:()=>void;edit:(p:Product)=>void;remove:(p:Product)=>void;setActive:(p:Product,a:boolean)=>void;print:(p:Product)=>void}){
 const rows=managedProducts.filter(p=>(showInactive||p.active!==false)&&`${p.sku} ${p.barcode||''} ${p.name} ${p.category||''}`.toLowerCase().includes(query.toLowerCase()))
 return <section className="panel"><div className="panelHead productHead"><div className="search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm SKU / barcode / tên hàng"/></div><button className="scanBtn" onClick={scan}><Barcode/> Quét</button><label className="checkLabel"><input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/> Hiện ngừng KD</label><button className="primary" onClick={create}><Plus size={15}/> Thêm sản phẩm</button></div><div className="productSummary"><span><b>{rows.length}</b> sản phẩm</span><span>Đang bán: <b>{rows.filter(p=>p.active!==false).length}</b></span><span>Ngừng KD: <b>{rows.filter(p=>p.active===false).length}</b></span></div><div className="tableWrap"><table><thead><tr><th>SKU</th><th>Sản phẩm</th><th>Barcode</th><th>Nhóm</th><th>Tồn</th><th>Giá vốn</th><th>Giá bán</th><th>Tối thiểu</th><th>Vị trí</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{rows.map(p=><tr key={p.id} className={p.active===false?'inactiveRow':''}><td><b>{p.sku}</b></td><td>{p.name}<small className="cellSub">{p.unit}</small></td><td>{p.barcode||'-'}</td><td>{p.category||'Khác'}</td><td className={p.stock_qty<=p.min_stock?'danger':''}><b>{p.stock_qty}</b></td><td>{money(p.cost_price)}</td><td>{money(p.sale_price)}</td><td>{p.min_stock}</td><td>{p.location||'-'}</td><td><span className={`statusBadge ${p.active===false?'off':'on'}`}>{p.active===false?'Ngừng KD':'Đang bán'}</span></td><td className="actionsCell"><button className="mini" title="Sửa" onClick={()=>edit(p)}><Pencil size={12}/></button><button className="mini" title={p.active===false?'Mở bán':'Ngừng kinh doanh'} onClick={()=>setActive(p,p.active===false)}>{p.active===false?<RotateCcw size={12}/>:<Power size={12}/>}</button><button className="mini" title="In tem" onClick={()=>print(p)}><Printer size={12}/></button><button className="mini dangerBtn" title="Xóa" onClick={()=>remove(p)}><Trash2 size={12}/></button></td></tr>)}{!rows.length&&<tr><td colSpan={11} className="empty">Không tìm thấy sản phẩm.</td></tr>}</tbody></table></div></section>
}


function ProductModal({editing,form,setForm,save,close,loading}:{editing:Product|null|undefined;form:ProductForm;setForm:Dispatch<SetStateAction<ProductForm>>;save:()=>void;close:()=>void;loading:boolean}){
 const field=(key:keyof typeof form)=>(value:any)=>setForm(f=>({...f,[key]:value}))
 const autoBarcode=!editing
 return <div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modalCard"><div className="modalHead"><div><h2>{editing?'Sửa sản phẩm':'Thêm sản phẩm'}</h2><p>{editing?`Chỉnh sửa ${editing.sku}`:'Barcode sẽ được hệ thống tự tạo khi lưu'}</p></div><button className="iconBtn" onClick={close}><X size={17}/></button></div><div className="formGrid productFormGrid"><label>SKU *<input value={form.sku} onChange={e=>field('sku')(e.target.value)} placeholder="VD: KOVA-K360-20"/></label><label>{autoBarcode?'Barcode (tự động)':'Barcode'}<input value={form.barcode} readOnly={autoBarcode} onChange={e=>field('barcode')(e.target.value)} placeholder={autoBarcode?'Tự động tạo khi lưu':'Mã vạch'}/>{autoBarcode&&<small className="fieldHint">Để trống: hệ thống tự tạo mã 12 số khi bấm Tạo sản phẩm. Sản phẩm cũ thiếu mã cũng được tự bổ sung.</small>}</label><label>Tên hàng *<input value={form.name} onChange={e=>field('name')(e.target.value)} placeholder="Tên sản phẩm"/></label><label>Nhóm hàng<select value={form.category} onChange={e=>field('category')(e.target.value)}><option value="SƠN NỘI THẤT">SƠN NỘI THẤT</option><option value="SƠN NGOẠI THẤT">SƠN NGOẠI THẤT</option></select></label><label>Đơn vị tính<select value={form.unit} onChange={e=>field('unit')(e.target.value)}><option value="Thùng">Thùng</option><option value="Lon">Lon</option><option value="Chai">Chai</option></select></label><label>Vị trí trong kho<select value={form.location} onChange={e=>field('location')(e.target.value)}><option value="SƠN NỘI THẤT">SƠN NỘI THẤT</option><option value="SƠN NGOẠI THẤT">SƠN NGOẠI THẤT</option></select></label><label>Giá vốn<input type="number" min="0" value={form.cost_price} onChange={e=>field('cost_price')(safeNum(e.target.value))}/></label><label>Giá bán<input type="number" min="0" value={form.sale_price} onChange={e=>field('sale_price')(safeNum(e.target.value))}/></label><label>Tồn tối thiểu<input type="number" min="0" value={form.min_stock} onChange={e=>field('min_stock')(safeNum(e.target.value))}/><small className="fieldHint">Mặc định: 5</small></label><label>Trạng thái<select value={form.active?'1':'0'} onChange={e=>field('active')(e.target.value==='1')}><option value="1">Đang bán</option><option value="0">Ngừng kinh doanh</option></select></label></div><div className="modalFoot"><button className="outline" onClick={close}>Hủy</button><button className="primary" onClick={save} disabled={loading}>{loading?'Đang lưu...':<><Plus size={14}/>{editing?'Lưu thay đổi':'Tạo sản phẩm'}</>}</button></div></div></div>
}

function Purchases({products,cart,add,change,remove,total,suppliers,supplierId,setSupplierId,payment,setPayment,paid,setPaid,purchaseDate,setPurchaseDate,submit}:{products:Product[];cart:CartLine[];add:(p:Product)=>void;change:(id:string,d:number)=>void;remove:(id:string)=>void;total:number;suppliers:Supplier[];supplierId:string;setSupplierId:(s:string)=>void;payment:string;setPayment:(s:string)=>void;paid:number;setPaid:(n:number)=>void;purchaseDate:string;setPurchaseDate:(s:string)=>void;submit:()=>void}){
 const debt=Math.max(0,total-(payment==='DEBT'?0:Math.min(total,Math.max(0,paid||total))))
 const [history,setHistory]=useState<any[]>([])
 const [historyLoading,setHistoryLoading]=useState(false)
 const loadHistory=async()=>{
  if(!supabase){setHistory([]);return}
  setHistoryLoading(true)
  const {data}=await supabase.from('purchases').select('id,receipt_no,supplier_id,total,paid,created_at,status,supplier:suppliers(id,name,code)').eq('status','COMPLETED').order('created_at',{ascending:false}).limit(100)
  const normalized=(data||[]).map((p:any)=>({...p,supplier:Array.isArray(p.supplier)?(p.supplier[0]??null):p.supplier}))
  setHistory(normalized)
  setHistoryLoading(false)
 }
 useEffect(()=>{loadHistory()},[])

 const dateKey=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))
 const dateLabel=(key:string)=>new Date(`${key}T12:00:00+07:00`).toLocaleDateString('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'})
 const grouped=history.reduce((acc:any[],p:any)=>{
  const key=dateKey(p.created_at)
  let group=acc.find(x=>x.date===key)
  if(!group){group={date:key,items:[]};acc.push(group)}
  group.items.push(p)
  return acc
 },[])
 return <div className="pos"><section className="panel catalog"><div className="panelHead"><div><h2>Chọn hàng nhập</h2><p>Bấm sản phẩm để thêm</p></div></div><div className="catalogGrid">{products.map(p=><button className="catalogItem" key={p.id} onClick={()=>add(p)}><b>{p.name}</b><small>{p.sku}</small><strong>Giá nhập {money(p.cost_price)}</strong></button>)}</div></section><section className="panel cart"><div className="panelHead"><h2>Phiếu nhập</h2><button onClick={()=>cart.forEach(x=>remove(x.product.id))}>Xóa tất cả</button></div><div className="cartLines">{cart.map(x=><div className="cartLine" key={x.product.id}><div><b>{x.product.name}</b><small>{money(x.price)}</small></div><div className="qty"><button onClick={()=>change(x.product.id,-1)}>−</button><span>{x.qty}</span><button onClick={()=>change(x.product.id,1)}>+</button></div><strong>{money(x.qty*x.price)}</strong></div>)}</div><div className="checkout"><label>Ngày nhập<input type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)}/><small>Mỗi phiếu nhập được ghi nhận riêng theo ngày này, không cộng dồn sang ngày khác.</small></label><label>Nhà cung cấp<select value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Không chọn</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Phương thức thanh toán<select value={payment} onChange={e=>{setPayment(e.target.value);if(e.target.value==='DEBT')setPaid(0)}}><option value="CASH">TIỀN MẶT</option><option value="TRANSFER">CHUYỂN KHOẢN</option><option value="DEBT">CÔNG NỢ NCC</option></select></label>{payment!=='DEBT'&&<label>Đã thanh toán<input type="number" min="0" max={total} value={paid} onChange={e=>setPaid(safeNum(e.target.value))}/><small>Để 0 để hệ thống tự thanh toán đủ tổng nhập.</small></label>}<div className="total"><span>Tổng nhập</span><strong>{money(total)}</strong></div>{debt>0&&<div className="total"><span>Công nợ NCC</span><strong>{money(debt)}</strong></div>}<button className="checkoutBtn" onClick={submit}>Lưu phiếu nhập</button></div></section><section className="panel wide"><div className="panelHead"><div><h2>Lịch sử nhập hàng</h2><p>Phiếu nhập được nhóm riêng theo từng ngày, không cộng dồn giữa các ngày.</p></div><button onClick={loadHistory}><RefreshCw size={14}/> Cập nhật</button></div>{historyLoading?<div className="empty">Đang tải lịch sử nhập hàng...</div>:grouped.length?grouped.map((g:any)=><div key={g.date} className="purchaseDayGroup"><div className="panelHead"><div><h3>{dateLabel(g.date)}</h3><p>{g.items.length} phiếu nhập trong ngày</p></div><strong>{money(g.items.reduce((a:number,p:any)=>a+safeNum(p.total),0))}</strong></div><div className="masterList">{g.items.map((p:any)=><div className="masterRow" key={p.id}><div><b>{p.receipt_no}</b><small>{p.supplier?.name||'Không chọn NCC'}{p.supplier?.code?` • ${p.supplier.code}`:''} • {new Date(p.created_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</small></div><div><strong>{money(p.total)}</strong><small>Đã trả {money(p.paid)} • Nợ {money(Math.max(0,safeNum(p.total)-safeNum(p.paid)))}</small></div></div>)}</div></div>):<div className="empty">Chưa có phiếu nhập.</div>}</section></div>}

function Transfers({products,warehouses,from,setFrom,to,setTo,product,setProduct,qty,setQty,submit}:{products:Product[];warehouses:Warehouse[];from:string;setFrom:(s:string)=>void;to:string;setTo:(s:string)=>void;product:string;setProduct:(s:string)=>void;qty:number;setQty:(n:number)=>void;submit:()=>void}){return <section className="panel formPage"><h2>Chuyển kho</h2><p>Trừ kho đi và cộng kho đến trong một transaction.</p><div className="formGrid"><label>Kho đi<select value={from} onChange={e=>setFrom(e.target.value)}><option value="">Chọn kho</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.code} • {w.name}</option>)}</select></label><label>Kho đến<select value={to} onChange={e=>setTo(e.target.value)}><option value="">Chọn kho</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.code} • {w.name}</option>)}</select></label><label>Sản phẩm<select value={product} onChange={e=>setProduct(e.target.value)}><option value="">Chọn sản phẩm</option>{products.map(p=><option key={p.id} value={p.id}>{p.sku} • {p.name}</option>)}</select></label><label>Số lượng<input type="number" min="1" value={qty} onChange={e=>setQty(safeNum(e.target.value))}/></label></div><button className="primary" onClick={submit}>Thực hiện chuyển kho</button></section>}

function Inventory({rows,active,start,finish,setRows}:{rows:any[];active:boolean;start:()=>void;finish:()=>void;setRows:(r:any[])=>void}){return <section className="panel"><div className="panelHead"><div><h2>Kiểm kê kho</h2><p>Đối chiếu tồn hệ thống với tồn thực tế</p></div>{active?<button className="primary" onClick={finish}>Hoàn tất kiểm kê</button>:<button className="primary" onClick={start}><ClipboardCheck/> Tạo phiếu kiểm kê</button>}</div>{!active?<div className="empty">Tạo phiếu để chụp số tồn hệ thống rồi nhập số đếm thực tế.</div>:<div className="tableWrap"><table><thead><tr><th>SKU</th><th>Sản phẩm</th><th>Hệ thống</th><th>Thực tế</th><th>Lệch</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.product?.sku}</td><td>{r.product?.name}</td><td>{r.system_qty}</td><td><input className="countInput" type="number" value={r.counted_qty} onChange={e=>setRows(rows.map(x=>x.id===r.id?{...x,counted_qty:safeNum(e.target.value)}:x))}/></td><td className={safeNum(r.counted_qty)-safeNum(r.system_qty)<0?'danger':''}>{safeNum(r.counted_qty)-safeNum(r.system_qty)}</td></tr>)}</tbody></table></div>}</section>}

function MasterList({title,icon,rows,add}:{title:string;icon:any;rows:{id:string;code:string;name:string;extra:string}[];add:()=>void}){return <section className="panel"><div className="panelHead"><div className="masterTitle">{icon}<div><h2>{title}</h2><p>{rows.length} bản ghi</p></div></div><button className="primary" onClick={add}>+ Thêm</button></div><div className="masterList">{rows.map(r=><div className="masterRow" key={r.id}><div><b>{r.name}</b><small>{r.code}</small></div><span>{r.extra}</span></div>)}{!rows.length&&<div className="empty">Chưa có dữ liệu.</div>}</div></section>}
function History({rows}:{rows:StockMovement[]}){return <section className="panel"><div className="panelHead"><div><h2>Lịch sử kho</h2><p>100 giao dịch gần nhất</p></div></div><div className="tableWrap"><table><thead><tr><th>Thời gian</th><th>Sản phẩm</th><th>Loại</th><th>Số lượng</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{new Date(r.created_at).toLocaleString('vi-VN')}</td><td>{r.product?.name||'-'}</td><td>{r.movement_type}</td><td>{r.quantity}</td></tr>)}{!rows.length&&<tr><td colSpan={4} className="empty">Chưa có giao dịch.</td></tr>}</tbody></table></div></section>}
function cashTypeLabel(t:string){return ({SALE:'Bán hàng',PURCHASE:'Nhập hàng',RECEIVABLE:'Thu công nợ',PAYABLE:'Trả công nợ',EXPENSE:'Chi phí',OTHER:'Khác'} as Record<string,string>)[t]||t}
function paymentLabel(t:string){return ({CASH:'Tiền mặt',TRANSFER:'Chuyển khoản',DEBT:'Công nợ'} as Record<string,string>)[t]||t}
function Cash({customers,suppliers,transactions,refresh,selectedDate,setSelectedDate,refreshToken}:{customers:Customer[];suppliers:Supplier[];transactions:CashTransaction[];refresh:()=>void;selectedDate:string;setSelectedDate:(s:string)=>void;refreshToken:number}){
 const [dailyPurchases,setDailyPurchases]=useState<any[]>([])
 useEffect(()=>{let alive=true;(async()=>{if(!supabase){if(alive)setDailyPurchases([]);return}const start=`${selectedDate}T00:00:00`;const end=`${selectedDate}T23:59:59.999`;const {data}=await supabase.from('purchases').select('id,supplier_id,total,paid,created_at,supplier:suppliers(id,name,code,phone)').gte('created_at',start).lte('created_at',end).eq('status','COMPLETED').order('created_at',{ascending:false});if(alive)setDailyPurchases(data||[])})();return()=>{alive=false}},[selectedDate,refreshToken])
 const receivable=customers.reduce((a,x)=>a+safeNum(x.debt),0)
 const supplierMap=new Map<string,any>()
 dailyPurchases.forEach((p:any)=>{if(!p.supplier_id)return;const s=Array.isArray(p.supplier)?p.supplier[0]:p.supplier;if(!s)return;const debt=Math.max(0,safeNum(p.total)-safeNum(p.paid));const cur=supplierMap.get(s.id)||{...s,debt:0,count:0};cur.debt+=debt;cur.count++;supplierMap.set(s.id,cur)})
 const supplierDebts=Array.from(supplierMap.values()).filter(x=>x.debt>0).sort((a,b)=>b.debt-a.debt)
 const totalDailyDebt=supplierDebts.reduce((a,x)=>a+x.debt,0)
 const totalIn=transactions.filter(x=>x.direction==='IN').reduce((a,x)=>a+safeNum(x.amount),0),totalOut=transactions.filter(x=>x.direction==='OUT').reduce((a,x)=>a+safeNum(x.amount),0)
 return <section className="cards cashCards"><div className="stat"><div className="statIcon"><Users/></div><span>Phải thu khách hàng</span><strong>{money(receivable)}</strong><small>Số dư hiện tại</small></div><div className="stat"><div className="statIcon"><TruckIcon/></div><span>Công nợ NCC trong ngày</span><strong>{money(totalDailyDebt)}</strong><small>{supplierDebts.length} NCC có nợ ngày {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('vi-VN')}</small></div><div className="panel cashInfo wide"><div className="panelHead"><div><h2>Thu chi theo ngày</h2><p><input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}/> • Chỉ hiển thị giao dịch của ngày đã chọn</p></div><button onClick={refresh}><RefreshCw size={14}/> Cập nhật</button></div><div className="cards"><div className="stat"><span>Tổng thu</span>: <strong>{money(totalIn)}</strong><small>{transactions.filter(x=>x.direction==='IN').length} giao dịch</small></div><div className="stat"><span>Tổng chi</span>: <strong>{money(totalOut)}</strong><small>{transactions.filter(x=>x.direction==='OUT').length} giao dịch</small></div><div className="stat"><span>Thuần trong ngày</span>: <strong>{money(totalIn-totalOut)}</strong><small>Thu − Chi</small></div></div>{transactions.length?<div className="tableWrap"><table><thead><tr><th>Thời gian</th><th>Nội dung</th><th>Phương thức</th><th>Thu</th><th>Chi</th></tr></thead><tbody>{transactions.map(t=><tr key={t.id}><td>{new Date(t.created_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</td><td><b>{cashTypeLabel(t.type)}</b><small>{t.customer?.name||t.supplier?.name||t.note||t.reference_id||''}</small></td><td>{paymentLabel(t.payment_method)}</td><td className="success">{t.direction==='IN'?money(t.amount):'-'}</td><td className="danger">{t.direction==='OUT'?money(t.amount):'-'}</td></tr>)}</tbody></table></div>:<div className="empty">Ngày {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('vi-VN')} chưa phát sinh giao dịch thu chi.</div>}</div><div className="panel cashInfo"><div className="panelHead"><div><h2>Công nợ nhà cung cấp theo ngày</h2><p>Không cộng dồn với các ngày trước</p></div></div>{supplierDebts.length?<div className="masterList">{supplierDebts.map(s=><div className="masterRow" key={s.id}><div><b>{s.name}</b><small>{s.code}{s.phone?` • ${s.phone}`:''} • {s.count} phiếu nhập ngày {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('vi-VN')}</small></div><strong>{money(s.debt)}</strong></div>)}</div>:<div className="empty">Ngày {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('vi-VN')} chưa phát sinh công nợ nhà cung cấp.</div>}</div></section>}

function Reports({products,total,value,transactions}:{products:Product[];total:number;value:number;transactions:CashTransaction[]}){const low=products.filter(p=>p.stock_qty<=p.min_stock),totalIn=transactions.filter(x=>x.direction==='IN').reduce((a,x)=>a+safeNum(x.amount),0),totalOut=transactions.filter(x=>x.direction==='OUT').reduce((a,x)=>a+safeNum(x.amount),0);return <section className="reportGrid"><div className="panel"><h2>Báo cáo thu chi hôm nay</h2><p>{new Date().toLocaleDateString('vi-VN')}</p><div className="reportLine"><span>Tổng thu</span>: <strong>{money(totalIn)}</strong></div><div className="reportLine"><span>Tổng chi</span>: <strong>{money(totalOut)}</strong></div><div className="reportLine"><span>Thuần</span>: <strong>{money(totalIn-totalOut)}</strong></div><p>{transactions.length} giao dịch</p></div><div className="panel"><h2>Giá trị tồn</h2><strong className="reportNumber">{money(value)}</strong><p>{total} đơn vị</p></div><div className="panel"><h2>Sản phẩm sắp hết</h2><strong className="reportNumber">{low.length}</strong><p>SKU cần bổ sung</p></div><div className="panel wide"><h2>Tồn kho theo sản phẩm</h2>{products.map(p=><div className="barRow" key={p.id}><span>{p.name}</span><div><i style={{width:`${Math.min(100,Math.max(4,safeNum(p.stock_qty)*4))}%`}}/></div><b>{p.stock_qty}</b></div>)}</div></section>}
function Printing({products,bridge,setBridge,message}:{products:Product[];bridge:string;setBridge:(s:string)=>void;message:(s:string)=>void}){
 const [p,setP]=useState(products[0]?.id||'')
 const [lastCheck,setLastCheck]=useState('')
 async function check(){try{const r=await getBridgeHealth();setBridge('Online');setLastCheck(`Máy tính: ${r.machine||'-'} • Máy mặc định: ${r.printer||'-'}`);message(`Print Bridge Online • ${r.printer||'đang chạy'}`)}catch(e){setBridge('Offline');setLastCheck('');message(e instanceof Error?e.message:String(e))}}
 async function test(){try{const s=getPrinterSettings();await testPrinter(s.receiptPrinter||undefined,s.receiptMode);message(`Đã gửi lệnh test tới ${s.receiptPrinter||'máy mặc định'}`)}catch(e){message(e instanceof Error?e.message:String(e))}}
 const x=products.find(y=>y.id===p)
 const s=getPrinterSettings()
 return <section className="printPage"><div className="printHero"><div className="printerBig"><Printer/></div><div><h2>Hệ thống máy in</h2><p>{s.receiptMode==='a4'?'A4 • Windows Print Bridge':'80mm • Windows Print Bridge'}</p><span className="pill">{bridge}</span>{lastCheck&&<small className="muted">{lastCheck}</small>}</div></div><div className="printActions"><button className="primary" onClick={check}>Kiểm tra Bridge</button><button className="outline" onClick={test}>In test</button></div><div className="panel"><h2>Máy in đang chọn</h2><p className="muted">Hóa đơn/phiếu: <b>{s.receiptPrinter||'Chưa chọn'}</b> • Chế độ: <b>{s.receiptMode==='a4'?'A4':'Xprinter / ESC-POS'}</b></p><p className="muted">Tem barcode: <b>{s.labelPrinter||'Chưa chọn'}</b></p><p className="muted">N160II 80mm: kết nối USB với Windows, chọn chế độ Xprinter / ESC-POS.</p></div><div className="panel"><h2>In tem</h2><div className="labelForm"><select value={p} onChange={e=>setP(e.target.value)}>{products.map(q=><option key={q.id} value={q.id}>{q.sku} — {q.name}</option>)}</select><button className="primary" disabled={!x} onClick={async()=>{if(!x)return;try{await printLabel({name:x.name,sku:x.sku,barcode:x.barcode,price:x.sale_price},1);message('Đã gửi tem')}catch(e){message(e instanceof Error?e.message:String(e))}}}><Printer/> In tem</button></div></div></section>}

function InvoiceTemplateEditor({message}:{message:(s:string)=>void}){
 const [t,setT]=useState<InvoiceTemplate>(()=>getInvoiceTemplate())
 const [saved,setSaved]=useState(false)
 const update=<K extends keyof InvoiceTemplate>(k:K,v:InvoiceTemplate[K])=>setT(x=>({...x,[k]:v}))
 const toggle=(k:'showSku'|'showUnitPrice'|'showQty'|'showSubtotal'|'showDiscount'|'showPayment'|'showQr')=>update(k,!t[k])
 const labels:Record<InvoiceBlockId,string>={store:'Thông tin cửa hàng',title:'Tiêu đề hóa đơn',meta:'Số HĐ / ngày giờ',customer:'Khách hàng',items:'Danh sách hàng',totals:'Tổng tiền / chiết khấu',payment:'Thanh toán',qr:'QR MB Bank',footer:'Chân trang'}
 const move=(id:InvoiceBlockId,dir:-1|1)=>{const a=[...t.blocks],i=a.indexOf(id),j=i+dir;if(i<0||j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];update('blocks',a)}
 const save=()=>{saveInvoiceTemplate(t);setSaved(true);message('Đã lưu Mẫu hóa đơn 80mm');window.setTimeout(()=>setSaved(false),1800)}
 return <div className="panel invoiceTemplatePanel"><div className="panelHead"><div><h2>Mẫu hóa đơn 80mm</h2><p>Chỉnh trực tiếp trên V5, không cần sửa code. Cấu hình được lưu trên máy đang sử dụng.</p></div><div className="templateActions"><button className="outline" onClick={()=>setT(DEFAULT_INVOICE_TEMPLATE)}>Khôi phục mặc định</button><button className="primary" onClick={save}>{saved?'Đã lưu ✓':'Lưu mẫu hóa đơn'}</button></div></div>
  <div className="invoiceEditorGrid"><div className="invoiceControls">
   <div className="formGrid"><label>Tên cửa hàng<input value={t.storeName} onChange={e=>update('storeName',e.target.value)}/></label><label>Tên hộ kinh doanh<input value={t.businessName} onChange={e=>update('businessName',e.target.value)}/></label><label>Điện thoại / Zalo<input value={t.phone} onChange={e=>update('phone',e.target.value)}/></label><label>Tiêu đề<input value={t.title} onChange={e=>update('title',e.target.value)}/></label><label>Chân trang<input value={t.footer} onChange={e=>update('footer',e.target.value)}/></label><label>Cỡ chữ<select value={t.fontSize} onChange={e=>update('fontSize',Number(e.target.value))}><option value="14">Vừa</option><option value="16">Lớn</option><option value="18">Rất lớn</option><option value="20">Siêu lớn</option></select></label><label>Căn chữ<select value={t.alignment} onChange={e=>update('alignment',e.target.value as InvoiceTemplate['alignment'])}><option value="center">Giữa</option><option value="left">Trái</option></select></label></div>
   <div className="templateChecks">{[['showSku','Hiện SKU'],['showUnitPrice','Hiện đơn giá'],['showQty','Hiện số lượng'],['showSubtotal','Hiện tạm tính'],['showDiscount','Hiện chiết khấu'],['showPayment','Hiện phương thức thanh toán'],['showQr','Hiện QR MB Bank']].map(([k,l])=><label key={k}><input type="checkbox" checked={Boolean(t[k as keyof InvoiceTemplate])} onChange={()=>toggle(k as any)}/>{l}</label>)}</div>
   <div className="templateOrder"><b>Thứ tự khối in</b>{t.blocks.map((id,i)=><div className="templateOrderRow" key={id}><span>{i+1}. {labels[id]}</span><button onClick={()=>move(id,-1)} disabled={i===0}>↑</button><button onClick={()=>move(id,1)} disabled={i===t.blocks.length-1}>↓</button></div>)}</div>
  </div><div className="receiptPreviewWrap"><div className="receiptPreview" style={{fontSize:t.fontSize,textAlign:t.alignment}}>{t.blocks.map(id=><div key={id} className={`receiptBlock receipt-${id}`}>
   {id==='store'&&<><b className="receiptStore">{t.storeName}</b><span>{t.businessName}</span><span>{t.phone}</span></>}
   {id==='title'&&<b>{t.title}</b>}
   {id==='meta'&&<span>Số HĐ: HD20261006-00001<br/>{new Date().toLocaleString('vi-VN')}</span>}
   {id==='customer'&&<span>Khách hàng: Khách lẻ</span>}
   {id==='items'&&<div className="previewItemsTable"><div className="previewItemHeader"><b>TÊN HÀNG</b>{t.showQty&&<b>SL</b>}{t.showUnitPrice&&<b>ĐƠN GIÁ</b>}<b>THÀNH TIỀN</b></div><div className="previewItemRow"><span><b>Sơn KOVA K360 Gold 20kg</b>{t.showSku&&<small>SKU: KOVA-K360</small>}</span>{t.showQty&&<span>1</span>}{t.showUnitPrice&&<span>470.000</span>}<b>470.000</b></div></div>}
   {id==='totals'&&<div className="previewTotals">{t.showSubtotal&&<span>Tạm tính <b>470.000</b></span>}{t.showDiscount&&<span>Chiết khấu 5% <b>-23.500</b></span>}<strong>TỔNG THANH TOÁN 446.500</strong></div>}
   {id==='payment'&&t.showPayment&&<span>Thanh toán: CHUYỂN KHOẢN<br/>MB Bank • STK {BANK_PAYMENT.accountNo}</span>}
   {id==='qr'&&t.showQr&&<><div className="fakeQr">QR</div><span>THANHTOAN HD20261006-00001</span></>}
   {id==='footer'&&<span>{t.footer}</span>}
  </div>)}</div><div className="previewCaption">Xem trước 80mm • mẫu thật sẽ dùng khi in hóa đơn tiếp theo</div></div></div>
 </div>
}

function Settings({auth,email,setEmail,password,setPassword,login,message}:{auth:string|null;email:string;setEmail:(s:string)=>void;password:string;setPassword:(s:string)=>void;login:()=>void;message:(s:string)=>void}){
 const [printers,setPrinters]=useState<PrinterInfo[]>([])
 const [settings,setSettings]=useState<PrinterSettings>(()=>getPrinterSettings())
 const [loadingPrinters,setLoadingPrinters]=useState(false)
 const [saving,setSaving]=useState(false)
 async function loadPrinters(){
  setLoadingPrinters(true)
  try{
   const rows=await listPrinters();setPrinters(rows)
   if(rows.length){
    setSettings(old=>({...old,receiptPrinter:old.receiptPrinter&&rows.some(x=>x.name===old.receiptPrinter)?old.receiptPrinter:(rows.find(x=>x.isDefault)?.name||rows[0].name),labelPrinter:old.labelPrinter&&rows.some(x=>x.name===old.labelPrinter)?old.labelPrinter:(rows.find(x=>x.isDefault)?.name||rows[0].name)}))
   }
   message(`Đã tìm thấy ${rows.length} máy in Windows`)
  }catch(e){message(`Không lấy được danh sách máy in: ${String(e)}`)}finally{setLoadingPrinters(false)}
 }
 useEffect(()=>{loadPrinters()},[])
 function update<K extends keyof PrinterSettings>(key:K,value:PrinterSettings[K]){setSettings(old=>({...old,[key]:value}))}
 function save(){setSaving(true);savePrinterSettings(settings);setSaving(false);message('Đã lưu cấu hình máy in')}
 return <section className="settingsPage">
  <div className="panel authPanel"><CircleUserRound size={34}/><h2>Tài khoản</h2>{auth?<p>Đang đăng nhập: <b>{auth}</b></p>:<><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mật khẩu"/><button className="primary" onClick={login}><LogIn/> Đăng nhập</button></>}</div>
  <div className="panel printerSettings"><div className="panelHead"><div><h2>Máy in Windows</h2><p>Chọn máy in cho hóa đơn/phiếu và tem barcode.</p></div><button className="outline" onClick={loadPrinters} disabled={loadingPrinters}>{loadingPrinters?'Đang tìm...':'Quét lại máy in'}</button></div>
   {!printers.length?<p className="muted">Chưa lấy được danh sách. Hãy khởi động Windows Print Bridge rồi bấm “Quét lại máy in”.</p>:<div className="printerGrid">
    <label>Máy in hóa đơn / phiếu<select value={settings.receiptPrinter} onChange={e=>update('receiptPrinter',e.target.value)}>{printers.map(p=><option key={p.name} value={p.name}>{p.name}{p.isDefault?' • Mặc định':''}</option>)}</select></label>
    <label>Kiểu in hóa đơn / phiếu<select value={settings.receiptMode} onChange={e=>update('receiptMode',e.target.value as PrintMode)}><option value="thermal">Xprinter / ESC-POS (58/80mm)</option><option value="a4">Máy in A4 thông thường</option></select></label>
    <label>Máy in tem barcode<select value={settings.labelPrinter} onChange={e=>update('labelPrinter',e.target.value)}>{printers.map(p=><option key={p.name} value={p.name}>{p.name}{p.isDefault?' • Mặc định':''}</option>)}</select></label>
   </div>}
   <div className="printerList">{printers.map(p=><div className="printerRow" key={p.name}><Printer size={15}/><span>{p.name}{p.isDefault&&<small>Máy in mặc định Windows</small>}</span></div>)}</div>
   <button className="primary" onClick={save}>{saving?'Đang lưu...':'Lưu cấu hình máy in'}</button>
   <p className="muted">Máy in A4 dùng Windows Print Spooler. Xprinter dùng lệnh ESC/POS RAW. Cả hai đều cần được cài đặt và nhìn thấy trong Windows.</p>
  </div>
  <div className="panel"><h2>Thanh toán chuyển khoản</h2><div className="bankInfo"><div><span>Ngân hàng</span><b>{BANK_PAYMENT.bankName}</b></div><div><span>Số tài khoản</span><b>{BANK_PAYMENT.accountNo}</b></div><div><span>Chủ tài khoản</span><b>{BANK_PAYMENT.accountName}</b></div></div><p className="muted">Khi chọn “Chuyển khoản” tại POS, SƠN KOVA sẽ tạo VietQR động theo đúng số tiền và mã hóa đơn.</p></div>
  <InvoiceTemplateEditor message={message}/>
  <div className="panel"><h2>Thiết bị & bảo mật</h2><p>Windows → Print Bridge → Windows Print Spooler → Xprinter hoặc máy in A4</p><p>iPhone → Cloud Print Queue → Windows Print Bridge → máy in</p><p className="muted">V5 không đưa service-role key ra client. Print Bridge chỉ nên chạy nội bộ trên máy Windows.</p></div>
 </section>}
