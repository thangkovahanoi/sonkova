import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

type Props = { onDetected:(value:string)=>void; onClose:()=>void }

export default function BarcodeScanner({onDetected,onClose}:Props) {
  const video = useRef<HTMLVideoElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const reader = useRef<BrowserMultiFormatReader | null>(null)
  const [error,setError] = useState('')
  const [cameraReady,setCameraReady] = useState(false)
  const [cameraAvailable,setCameraAvailable] = useState(true)
  const [manual,setManual] = useState('')

  useEffect(() => {
    input.current?.focus()
    const r = new BrowserMultiFormatReader()
    reader.current = r
    let controls: { stop:()=>void } | undefined
    let cancelled = false

    ;(async()=>{
      try {
        if (!navigator.mediaDevices?.enumerateDevices) throw new Error('Trình duyệt không hỗ trợ camera.')
        const devices = await navigator.mediaDevices.enumerateDevices()
        const cameras = devices.filter(d => d.kind === 'videoinput')
        if (!cameras.length) {
          setCameraAvailable(false)
          setError('Không tìm thấy camera trên thiết bị này. Anh có thể dùng máy quét mã vạch USB hoặc nhập mã bên dưới.')
          return
        }
        controls = await r.decodeFromConstraints(
          {video:{facingMode:{ideal:'environment'}}, audio:false},
          video.current!,
          (result) => {
            if (result && !cancelled) {
              onDetected(result.getText())
              controls?.stop()
              onClose()
            }
          }
        )
        if (!cancelled) setCameraReady(true)
      } catch(e) {
        if (cancelled) return
        setCameraAvailable(false)
        const message = e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Trình duyệt chưa được cấp quyền camera. Anh có thể dùng máy quét USB hoặc nhập mã bên dưới.'
          : e instanceof Error ? e.message : 'Không mở được camera. Hãy dùng máy quét USB hoặc nhập mã.'
        setError(message)
      }
    })()
    return () => { cancelled = true; controls?.stop() }
  }, [onDetected,onClose])

  function submitManual(e: FormEvent) {
    e.preventDefault()
    const value = manual.trim()
    if (!value) return
    onDetected(value)
    onClose()
  }

  return <div className="scannerOverlay">
    <div className="scanner">
      <div className="scannerHead"><b>Quét mã vạch</b><button onClick={onClose}>×</button></div>
      {cameraAvailable ? <video ref={video} muted playsInline /> : <div className="scannerNoCamera"><b>Không có camera khả dụng</b><span>{error}</span></div>}
      {cameraReady && <div className="scanLine" />}
      {cameraReady && <small>Đưa mã vạch vào khung hình</small>}
      {error && cameraAvailable && <p className="scanError">{error}</p>}
      <div className="scannerUsb">
        <b>Máy quét mã vạch USB</b>
        <small>Cắm máy quét vào Windows, bấm vào ô dưới rồi quét mã. Máy quét sẽ tự gửi Enter.</small>
        <form onSubmit={submitManual}>
          <input ref={input} value={manual} onChange={e=>setManual(e.target.value)} placeholder="Quét USB hoặc nhập mã barcode / SKU" autoComplete="off" />
          <button className="primary" type="submit">Xác nhận</button>
        </form>
      </div>
    </div>
  </div>
}
