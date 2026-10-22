'use client';
import Image from 'next/image';
import {useState} from 'react';
import ProductGlyph from './ProductGlyph';
import type {StockProduct} from '@/lib/stock';
export default function ProductVisual({product,image,large=false}:{product:StockProduct;image?:string;large?:boolean}) {
  const [failed,setFailed]=useState(false);
  return <div className={`${large ? 'w-full h-48 mb-5' : 'w-14 h-14 shrink-0'} rounded-2xl bg-secondary/5 text-secondary grid place-items-center overflow-hidden`}>
    {image && !failed ? <Image src={image} alt={`Referencia de ${product.description}`} width={large?320:56} height={large?192:56} unoptimized referrerPolicy="no-referrer" onError={()=>setFailed(true)} className="w-full h-full object-contain bg-white" /> : <ProductGlyph product={product} size={large?64:28} />}
  </div>;
}
