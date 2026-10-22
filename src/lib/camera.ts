export interface CameraCapabilities {zoom?:{min:number;max:number;step?:number};torch?:boolean;focusMode?:string[]}
export function barcodeValue(raw:string) {const value=raw.trim();return /^\d{8,14}$/.test(value)?value:null;}
export function cameraError(error:unknown) {
 const name=error && typeof error==='object' && 'name' in error ? String(error.name):'';
 if(name==='NotAllowedError' || name==='SecurityError') return 'Activa el permiso de cámara en el navegador. También puedes escribir el código.';
 if(name==='NotFoundError' || name==='OverconstrainedError') return 'No encontramos una cámara compatible. Puedes escribir el código o usar otro dispositivo.';
 if(name==='NotReadableError' || name==='AbortError') return 'Otra aplicación puede estar usando la cámara. Ciérrala y pulsa Reintentar.';
 return 'No pudimos iniciar la cámara. Reintenta o escribe el código manualmente.';
}
export function zoomRange(capabilities:CameraCapabilities) {
 const z=capabilities.zoom;
 if(!z || !Number.isFinite(z.min) || !Number.isFinite(z.max) || z.min<=0 || z.max<=z.min) return null;
 const max=Math.min(z.max,4);if(max<=z.min) return null;
 return {min:z.min,max,step:z.step && z.step>0?z.step:0.1};
}
export function stopCamera(stream:Pick<MediaStream,'getTracks'>|null) {stream?.getTracks().forEach(track=>track.stop());}
