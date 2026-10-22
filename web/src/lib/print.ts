export type PrintMode = 'thermal' | 'a4'

export type ReceiptOptions = {
  invoiceNo?: string
  printedAt?: string // Original invoice date for reprints; defaults to current time.
  subtotal?: number
  discount?: number
  total?: number
  qrData?: string
  qrImageData?: string
  paymentMethod?: string
  paymentBank?: string
  paymentAccount?: string
  paymentAccountName?: string
  paymentInfo?: string
}

export type ReceiptItem = {
  name: string
  sku?: string
  qty: number
  unitPrice?: number
}
export type LabelPayload = {
  name: string
  sku: string
  barcode?: string | null
  price?: number
}
export type PrinterInfo = {
  name: string
  isDefault: boolean
}

const bridge = () => (import.meta.env.VITE_PRINT_BRIDGE_URL || 'http://localhost:9100').replace(/\/$/, '')

function friendlyBridgeError(error: unknown): Error {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return new Error(`Không kết nối được Windows Print Bridge tại ${bridge()}. Hãy kiểm tra Print Bridge đang chạy và mở đúng địa chỉ này trên máy Windows.`)
  }
  if (error instanceof Error) return error
  return new Error(String(error))
}

async function request(path: string, init?: RequestInit) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 6000)
  try {
    const response = await fetch(`${bridge()}${path}`, {...init, signal: controller.signal})
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `Print Bridge trả về HTTP ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Print Bridge không phản hồi tại ${bridge()} trong 6 giây.`)
    }
    throw friendlyBridgeError(error)
  } finally {
    window.clearTimeout(timer)
  }
}

async function post(path: string, body?: unknown) {
  return request(path, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body)
  })
}

export const getBridgeHealth = () => request('/health')
export const listPrinters = async (): Promise<PrinterInfo[]> => {
  const data = await request('/printers')
  return Array.isArray(data) ? data : []
}

const SETTINGS_KEY = 'kho-xprinter-printer-settings'
export type PrinterSettings = { receiptPrinter: string; receiptMode: PrintMode; labelPrinter: string }

export const getPrinterSettings = (): PrinterSettings => {
  const fallback: PrinterSettings = { receiptPrinter: '', receiptMode: 'thermal', labelPrinter: '' }
  try { return {...fallback, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'))} } catch { return fallback }
}
export const savePrinterSettings = (settings: PrinterSettings) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))

export const testPrinter = (printerName?: string, mode: PrintMode = 'thermal') =>
  post('/print/test', {printerName: printerName || getPrinterSettings().receiptPrinter || undefined, mode})

export const printReceipt = (
  items: ReceiptItem[],
  title='PHIẾU KHO',
  options?: ReceiptOptions,
  printerName?: string,
  mode: PrintMode = getPrinterSettings().receiptMode,
  template?: unknown
) => post('/print/receipt', {
  title,
  items,
  printedAt:new Date().toISOString(),
  printerName: printerName || getPrinterSettings().receiptPrinter || undefined,
  mode,
  template,
  ...options
})

export const printLabel = (label: LabelPayload, copies=1, printerName?: string) =>
  post('/print/label', {...label, copies, printerName: printerName || getPrinterSettings().labelPrinter || undefined})
