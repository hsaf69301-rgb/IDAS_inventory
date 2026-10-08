import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader, Panel } from '@/components/common';
import { get } from '@/lib/api';

/** Look up an asset by its tag (typed, barcode-scanner "keyboard wedge", or camera QR scan where the browser supports BarcodeDetector). */
export default function Scan() {
  const nav = useNavigate();
  const [tag, setTag] = useState(''); const [err, setErr] = useState(''); const [camOn, setCamOn] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  async function open(t: string) {
    setErr('');
    try { const a = await get(`/assets/by-tag/${encodeURIComponent(t.trim())}`); nav(`/inventory/${a.id}`); }
    catch (e: any) { setErr(e.status === 404 ? `No asset with tag "${t}"` : e.message); }
  }

  useEffect(() => {
    if (!camOn) return;
    let stream: MediaStream | undefined; let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        const Det = (window as any).BarcodeDetector; const det = new Det({ formats: ['qr_code', 'code_128', 'ean_13'] });
        const loop = async () => {
          if (stop || !video.current) return;
          try { const r = await det.detect(video.current); if (r[0]?.rawValue) { setCamOn(false); open(r[0].rawValue); return; } } catch { /* frame not ready */ }
          requestAnimationFrame(loop);
        };
        loop();
      } catch { setErr('Camera not available. Type the asset tag instead.'); setCamOn(false); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn]);

  return (
    <>
      <PageHeader title="Scan / find asset" sub="Scan a QR or barcode label, or type the asset ID, to open the asset and act on it." />
      <Panel className="max-w-xl">
        <form onSubmit={(e) => { e.preventDefault(); if (tag.trim()) open(tag); }} className="flex gap-2">
          <Input autoFocus aria-label="Asset tag" placeholder="IDAS-PC-0001" value={tag} onChange={(e) => setTag(e.target.value)} className="font-mono" />
          <Button type="submit"><Search className="mr-1 h-4 w-4" />Open</Button>
        </form>
        {supported && <Button variant="outline" className="mt-3" onClick={() => setCamOn((c) => !c)}><Camera className="mr-1 h-4 w-4" />{camOn ? 'Stop camera' : 'Scan with camera'}</Button>}
        {camOn && <video ref={video} className="mt-3 w-full rounded-md border" muted playsInline />}
        {err && <p role="alert" className="mt-3 text-sm text-destructive">{err}</p>}
        <p className="mt-4 text-xs text-muted-foreground">USB barcode scanners work too: click the field and scan. From the asset page, authorised staff can issue, return, inspect, report damage and view history.</p>
      </Panel>
    </>
  );
}
