import { Tv, Laptop, Refrigerator, WashingMachine, Smartphone, CookingPot, BrushCleaning, Fan, Printer, Footprints, Bike, BedDouble, Sofa, Backpack, Shirt, Package } from 'lucide-react';
import { productKind } from '@/lib/productPresentation';
const glyphs={tv:Tv,computer:Laptop,fridge:Refrigerator,laundry:WashingMachine,phone:Smartphone,kitchen:CookingPot,cleaning:BrushCleaning,climate:Fan,printer:Printer,footwear:Footprints,bike:Bike,bed:BedDouble,furniture:Sofa,bag:Backpack,clothing:Shirt,generic:Package};
export default function ProductGlyph({product,size=28}:{product:{category:string;description:string};size?:number}) {
  const Glyph=glyphs[productKind(product)];
  return <Glyph size={size} aria-hidden="true" />;
}
