'use client';
import {useEffect,useRef,useState} from 'react';
import {Camera,X,Flashlight,RotateCcw,ScanLine,Keyboard} from 'lucide-react';
import {barcodeValue,cameraError,stopCamera,zoomRange,type CameraCapabilities} from '@/lib/camera';
import {Haptics} from '@/lib/haptics';
type NativeDetector={detect:(source:HTMLVideoElement)=>Promise<{rawValue:string}[]>};
type NativeConstructor={new(options:{formats:string[]}):NativeDetector;getSupportedFormats:()=>Promise<string[]>};
const control='min-h-12 rounded-xl border border-surface-border px-4 py-2 inline-flex items-center justify-center gap-2 disabled:opacity-40';

export default function ProductBarcodeScanner({onCode,onClose}:{onCode:(code:string)=>void;onClose:()=>void}) {
 const video=useRef<HTMLVideoElement>(null),dialog=useRef<HTMLDialogElement>(null),track=useRef<MediaStreamTrack|null>(null);
 const [attempt,setAttempt]=useState(0),[state,setState]=useState<'opening'|'scanning'|'paused'|'error'>('opening');
 const [error,setError]=useState(''),[manual,setManual]=useState(''),[torchAvailable,setTorchAvailable]=useState(false),[torch,setTorch]=useState(false);
 const [zoom,setZoom]=useState(1),[zoomLimits,setZoomLimits]=useState<ReturnType<typeof zoomRange>>(null);
 const stopSession=useRef<()=>void>(()=>{}),delivered=useRef(false),callback=useRef(onCode);
 useEffect(()=>{callback.current=onCode;},[onCode]);
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{
  let cancelled=false,stream:MediaStream|null=null,timer:ReturnType<typeof setTimeout>|undefined;
  let decoder:{decodeFromCanvas:(canvas:HTMLCanvasElement)=>{getText:()=>string}}|null=null,detector:NativeDetector|null=null,frames=0;
  const canvas=document.createElement('canvas');
  const cleanup=()=>{cancelled=true;clearTimeout(timer);stopCamera(stream);track.current=null;if(video.current) video.current.srcObject=null;};
  stopSession.current=cleanup;
  const deliver=(raw:string)=>{const value=barcodeValue(raw);if(!value||cancelled||delivered.current)return false;delivered.current=true;cleanup();Haptics.success();callback.current(value);return true;};
  async function fallback(){
   const [{BrowserMultiFormatOneDReader},{BarcodeFormat,DecodeHintType}]=await Promise.all([import('@zxing/browser'),import('@zxing/library')]);
   if(cancelled)return;
   const hints=new Map<number,unknown>([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.UPC_A,BarcodeFormat.UPC_E,BarcodeFormat.CODE_128,BarcodeFormat.ITF]],[DecodeHintType.TRY_HARDER,true]]);
   decoder=new BrowserMultiFormatOneDReader(hints,{delayBetweenScanAttempts:150});
  }
  let started=0;
  async function scan(){
   if(cancelled||!video.current)return;
   const element=video.current;
   if(element.readyState>=2&&element.videoWidth>0){
    try{
     if(detector){const results=await detector.detect(element);if(cancelled)return;for(const result of results)if(deliver(result.rawValue))return;if(performance.now()-started>5000){detector=null;await fallback();}}
     else if(decoder){
      // Alternate a center band with a full frame to preserve rotated-code support.
      const full=frames++%4===3,height=full?element.videoHeight:Math.round(element.videoHeight*0.6),top=full?0:Math.round((element.videoHeight-height)/2),scale=Math.min(1,1280/element.videoWidth);
      canvas.width=Math.round(element.videoWidth*scale);canvas.height=Math.round(height*scale);
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(context){context.drawImage(element,0,top,element.videoWidth,height,0,0,canvas.width,canvas.height);if(deliver(decoder.decodeFromCanvas(canvas).getText()))return;}
     }
    }catch{
     // Native detection can be exposed but fail at runtime; do not leave scanning stuck on it.
     if(detector || !decoder){detector=null;try{await fallback();}catch(e){if(!cancelled){cleanup();setError(cameraError(e));setState('error');}return;}}
     // ZXing not finding a code in a frame is normal.
    }
   }
   if(!cancelled)timer=setTimeout(()=>void scan(),detector?100:170);
  }
  async function start(){
   try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera unavailable');
    const native=(window as unknown as {BarcodeDetector?:NativeConstructor}).BarcodeDetector;
    const nativeReady=(async()=>{if(!native)return;try{const supported=await native.getSupportedFormats(),formats=['ean_13','ean_8','upc_a','upc_e','code_128','itf'].filter(f=>supported.includes(f));if(formats.includes('ean_13')&&!cancelled)detector=new native({formats});}catch{/* Use portable decoding. */}})();
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:24,max:30}}});
    if(cancelled||!video.current){stopCamera(stream);return;}
    const current=stream.getVideoTracks()[0];track.current=current;
    const capabilities=(current.getCapabilities?.()||{}) as CameraCapabilities;
    setTorchAvailable(!!capabilities.torch);setTorch(false);
    const limits=zoomRange(capabilities);setZoomLimits(limits);setZoom((current.getSettings() as MediaTrackSettings&{zoom?:number}).zoom||limits?.min||1);
    if(capabilities.focusMode?.includes('continuous'))void current.applyConstraints({advanced:[{focusMode:'continuous'} as MediaTrackConstraintSet]}).catch(()=>{});
    video.current.srcObject=stream;await video.current.play();await nativeReady;if(!detector)await fallback();
    if(cancelled)return;started=performance.now();setState('scanning');void scan();
   }catch(e){if(!cancelled){cleanup();setError(cameraError(e));setState('error');}}
  }
  void start();
  const hide=()=>{if(document.hidden){cleanup();setState('paused');setTorch(false);}};
  document.addEventListener('visibilitychange',hide);
  return()=>{cleanup();document.removeEventListener('visibilitychange',hide);};
 },[attempt]);
 async function changeSetting(values:Record<string,unknown>){const current=track.current;if(!current)return false;try{await current.applyConstraints({advanced:[values as MediaTrackConstraintSet]});return track.current===current;}catch{if(track.current===current)setError('Este dispositivo no pudo aplicar ese ajuste. Puedes seguir escaneando.');return false;}}
 function retry(){stopSession.current();delivered.current=false;setError('');setState('opening');setAttempt(n=>n+1);}
 function manualSubmit(e:React.FormEvent){e.preventDefault();const code=barcodeValue(manual);if(!code){setError('Escribe un PLU o código de barras de 8 a 14 dígitos.');return;}if(delivered.current)return;delivered.current=true;stopSession.current();callback.current(code);}
 return <dialog ref={dialog} onCancel={onClose} aria-labelledby="scanner-title" className="m-auto w-[calc(100%-1rem)] max-w-xl max-h-[92dvh] overflow-y-auto rounded-3xl border border-surface-border bg-surface-elevated text-on-surface p-4 sm:p-6 backdrop:bg-black/70">
  <header className="flex justify-between items-center gap-3 mb-4"><div><p className="text-xs text-secondary font-semibold mb-1">ASISTENTE DE VENTA</p><h2 id="scanner-title" className="text-xl font-semibold">Escanear código</h2></div><button type="button" onClick={onClose} aria-label="Cerrar escáner" className={`${control} px-3`}><X aria-hidden="true"/></button></header>
  <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] sm:aspect-video"><video ref={video} muted playsInline className="w-full h-full object-contain" aria-label="Vista de la cámara para códigos"/><div className="absolute inset-x-[7%] inset-y-[27%] border-2 border-white/80 rounded-xl pointer-events-none flex items-center justify-center"><ScanLine size={48} aria-hidden="true" className="text-white/70"/></div>{state==='opening'&&<p role="status" className="absolute inset-0 grid place-items-center bg-black/70 text-white px-5 text-center">Abriendo cámara… Permite el acceso si el navegador lo solicita.</p>}</div>
  <p role="status" className="text-sm text-on-surface-variant my-3">{state==='scanning'?'Centra todas las barras dentro del marco. Se lee automáticamente; no necesitas tomar una foto.':state==='paused'?'Cámara pausada al salir de la aplicación. Pulsa Reintentar para continuar.':state==='error'?'Puedes reintentar o escribir el código debajo.':'Mantén el producto quieto y evita reflejos.'}</p>
  {error&&<p role="alert" className="rounded-xl bg-error/10 text-error p-3 text-sm mb-3">{error}</p>}
  <div className="flex flex-wrap gap-2 mb-4">{torchAvailable&&state==='scanning'&&<button type="button" aria-pressed={torch} className={control} onClick={()=>void changeSetting({torch:!torch}).then(ok=>{if(ok)setTorch(!torch);})}><Flashlight size={20} aria-hidden="true"/>{torch?'Apagar luz':'Encender luz'}</button>}{(state==='error'||state==='paused')&&<button type="button" onClick={retry} className={`${control} bg-secondary text-on-secondary`}><RotateCcw size={20} aria-hidden="true"/>Reintentar cámara</button>}</div>
  {zoomLimits&&state==='scanning'&&<label className="block text-sm mb-4">Acercamiento · {zoom.toFixed(1)}×<input aria-label="Acercamiento de cámara" type="range" min={zoomLimits.min} max={zoomLimits.max} step={zoomLimits.step} value={zoom} onChange={e=>setZoom(Number(e.target.value))} onPointerUp={()=>void changeSetting({zoom})} onKeyUp={()=>void changeSetting({zoom})} className="w-full mt-2 accent-secondary"/></label>}
  <form onSubmit={manualSubmit} className="border-t border-surface-border pt-4"><label className="block text-sm font-medium mb-2" htmlFor="manual-product-code">¿No lo toma? Escribe el código</label><div className="flex gap-2"><input id="manual-product-code" inputMode="numeric" autoComplete="off" value={manual} onChange={e=>setManual(e.target.value)} placeholder="0200012345678" className="min-h-12 rounded-xl border border-surface-border bg-surface-base px-3 min-w-0 flex-1"/><button type="submit" className={`${control} bg-secondary text-on-secondary`}><Keyboard size={20} aria-hidden="true"/><span>Buscar</span></button></div></form>
  <p className="mt-4 text-xs text-on-surface-variant flex items-center gap-2"><Camera size={16} aria-hidden="true"/>La cámara y los códigos se procesan en tu dispositivo.</p>
 </dialog>;
}
