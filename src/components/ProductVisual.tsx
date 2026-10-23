'use client';
import Image from 'next/image';
import {useState} from 'react';
import ProductGlyph from './ProductGlyph';
import type {StockProduct} from '@/lib/stock';
export default function ProductVisual({product,image,large=false}:{product:StockProduct;image?:string;large?:boolean}) {
  const [failed,setFailed]=useState(false);
  return <div className={`${large ? 'w-full h-[clamp(16rem,55dvh,28rem)] mb-5 p-4' : 'w-14 h-14 shrink-0'} rounded-2xl bg-secondary/5 text-secondary grid place-items-center overflow-hidden`}>
    {image && !failed ? <Image src={image} alt={`Referencia de ${product.description}`} width={large?640:56} height={large?640:56} unoptimized referrerPolicy="no-referrer" onError={()=>setFailed(true)} className="w-full h-full min-h-0 object-contain bg-white" /> : <ProductGlyph product={product} size={large?112:28} />}
  </div>;
}
