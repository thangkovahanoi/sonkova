export const money=(n:number)=>Number(n||0).toLocaleString('vi-VN',{maximumFractionDigits:0})+'đ'
export const invoiceNo=(prefix='HD')=>`${prefix}${new Date().toISOString().slice(0,10).replaceAll('-','')}-${Date.now().toString().slice(-5)}`
export const safeNum=(v:string|number)=>{const n=Number(v);return Number.isFinite(n)?n:0}
