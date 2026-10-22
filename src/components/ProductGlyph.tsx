import { Tv, Laptop, Refrigerator, WashingMachine, Smartphone, CookingPot, BrushCleaning, Fan, Printer, Footprints, Bike, BedDouble, Sofa, Backpack, Shirt, Package, AudioLines, Gamepad2, Blender, Sparkles, Dumbbell, Lamp, Baby, Hammer, Watch } from 'lucide-react';
import { productKind,type ProductKind,type ProductGroup } from '@/lib/productPresentation';
const glyphs={tv:Tv,computer:Laptop,fridge:Refrigerator,laundry:WashingMachine,phone:Smartphone,kitchen:CookingPot,cleaning:BrushCleaning,climate:Fan,printer:Printer,footwear:Footprints,bike:Bike,bed:BedDouble,furniture:Sofa,bag:Backpack,clothing:Shirt,generic:Package,audio:AudioLines,gaming:Gamepad2,smallappliances:Blender,personal:Sparkles,sports:Dumbbell,home:Lamp,toys:Baby,tools:Hammer,accessories:Watch} satisfies Record<ProductKind,typeof Package>;
const groupGlyphs={tv:Tv,computer:Laptop,whitegoods:Refrigerator,phone:Smartphone,audio:AudioLines,gaming:Gamepad2,smallappliances:Blender,cleaning:BrushCleaning,climate:Fan,personal:Sparkles,footwear:Footprints,clothing:Shirt,sports:Dumbbell,bedroom:BedDouble,furniture:Sofa,home:Lamp,bags:Backpack,toys:Baby,tools:Hammer,accessories:Watch,other:Package} satisfies Record<ProductGroup,typeof Package>;
export function ProductGroupGlyph({group,size=20}:{group:ProductGroup|'';size?:number}) {
  const Glyph=group ? groupGlyphs[group] : Package;
  return <Glyph size={size} aria-hidden="true" className="shrink-0" />;
}
export default function ProductGlyph({product,size=28}:{product:{category:string;description:string};size?:number}) {
  const Glyph=glyphs[productKind(product)];
  return <Glyph size={size} aria-hidden="true" />;
}
