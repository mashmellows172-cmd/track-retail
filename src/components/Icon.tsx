import { Activity, CircleAlert, Calculator, Camera, CircleCheck, CircleDollarSign, Download, Gift, Image, Info, Keyboard, LayoutDashboard, Pencil, Plus, Receipt, ScanLine, Shield, ShoppingCart, TrendingUp, TriangleAlert, User, UserPlus } from 'lucide-react';
import type { CSSProperties } from 'react';

const icons = {
  insights: Activity, error: CircleAlert, calculate: Calculator, photo_camera: Camera,
  check_circle: CircleCheck, monetization_on: CircleDollarSign, download: Download,
  redeem: Gift, image: Image, info: Info, keyboard: Keyboard, dashboard: LayoutDashboard,
  edit: Pencil, add: Plus, receipt: Receipt, receipt_long: Receipt, qr_code_scanner: ScanLine,
  shield: Shield, shopping_cart: ShoppingCart, trending_up: TrendingUp, warning: TriangleAlert,
  person: User, person_add: UserPlus,
};

/** Local SVGs keep controls recognizable when external fonts are unavailable. */
export default function Icon({ children, className = '', style }: { children: string; className?: string; style?: CSSProperties }) {
  const Glyph = icons[children.trim() as keyof typeof icons] ?? CircleAlert;
  return <Glyph aria-hidden="true" focusable="false" className={`inline-block shrink-0 ${className}`} style={style} width="1em" height="1em" />;
}
