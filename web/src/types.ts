export type Product={
 id:string;sku:string;barcode:string|null;name:string;unit:string;cost_price:number;sale_price:number;
 stock_qty:number;min_stock:number;location:string|null;created_at:string;category?:string;active?:boolean
}
export type Customer={id:string;code:string;name:string;phone:string|null;address:string|null;debt:number;created_at:string}
export type Supplier={id:string;code:string;name:string;phone:string|null;address:string|null;debt:number;created_at:string}
export type Warehouse={id:string;code:string;name:string;address:string|null;phone:string|null;is_default:boolean;created_at:string}
export type StockMovement={id:string;product_id:string;movement_type:string;quantity:number;note:string|null;created_at:string;product?:Pick<Product,'sku'|'name'|'unit'>}
