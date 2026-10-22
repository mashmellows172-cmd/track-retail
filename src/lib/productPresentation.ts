type ProductPresentation = {category:string;description:string};
export const productGroups = [
  {id:'tv',label:'Televisión'}, {id:'computer',label:'Computación'},
  {id:'whitegoods',label:'Línea blanca'}, {id:'phone',label:'Telefonía'},
  {id:'audio',label:'Audio'}, {id:'gaming',label:'Videojuegos'},
  {id:'smallappliances',label:'Electrodomésticos'}, {id:'cleaning',label:'Limpieza'},
  {id:'climate',label:'Climatización'}, {id:'personal',label:'Cuidado personal'},
  {id:'footwear',label:'Calzado'}, {id:'clothing',label:'Vestuario'},
  {id:'sports',label:'Deportes'}, {id:'bedroom',label:'Dormitorio'},
  {id:'furniture',label:'Muebles'}, {id:'home',label:'Hogar y decoración'},
  {id:'bags',label:'Bolsos y maletas'}, {id:'toys',label:'Juguetes y bebés'},
  {id:'tools',label:'Herramientas'}, {id:'accessories',label:'Accesorios'},
  {id:'other',label:'Otros'},
] as const;
export type ProductGroup = typeof productGroups[number]['id'];
const groupsByKind = {
  tv:'tv', computer:'computer', printer:'computer', fridge:'whitegoods', laundry:'whitegoods', kitchen:'whitegoods',
  phone:'phone', audio:'audio', gaming:'gaming', smallappliances:'smallappliances', cleaning:'cleaning', climate:'climate',
  personal:'personal', footwear:'footwear', clothing:'clothing', bike:'sports', sports:'sports', bed:'bedroom',
  furniture:'furniture', home:'home', bag:'bags', toys:'toys', tools:'tools', accessories:'accessories', generic:'other',
} as const satisfies Record<string,ProductGroup>;
export type ProductKind = keyof typeof groupsByKind;

const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[_./-]+/g,' ');
const rules: [ProductKind,RegExp][] = [
  ['bag',/MOCHILA|MALETA|BOLSO|EQUIPAJE|CARTERA|BANANO/],
  ['accessories',/SOPORTE|CABLE|CARGADOR|CARCASA|PROTECTOR|FUNDA|ADAPTADOR|RELOJ|SMARTWATCH|JOYER|BISUTER|LENTE DE SOL/],
  ['personal',/CUIDADO PERSONAL|BELLEZA|PERFUM|COSMETIC|MAQUILLAJE|LABIAL|RUBOR|\bSOMBRAS?\b|AFEITAD|DEPILAD|ALISAD|SECAPELOS|SECADOR(?:A)?(?: DE)? CABELLO|CORTA ?PELO|PLANCHA(?: DE)? PELO|MASAJE/],
  ['smallappliances',/PEQUENOS ELECTRO|ELECTRODOMESTICOS MENORES|HERVIDOR|LICUAD|BATID|TOSTAD|CAFET|FREID|SACAJUGO|SANDWICH|MULTIPRO|PROCESADOR(?: DE)? ALIM|ARROCERA|OLLA ELECT|PARRILLA ELECT|PLANCHA(?: DE)? ROPA|MAQUINA(?: DE)? COSER/],
  ['home',/MENAJE|DECORAC|VAJILLA|LOZA|CUBIERTO|UTENSILIO|SARTEN|OLLAS|ASADERA|\bWOK\b|BATERIA(?: DE)? ALUMINIO|CRISTALERIA|TEXTIL HOGAR|SABANA|FRAZADA|COBERTOR|CORTINA|ALFOMBRA|ALMOHADA|TOALLA|ILUMINACION|LAMPARA/],
  ['toys',/JUGUET|MUNECA|PELUCHE|BEBE|COCHE|CUNA|PANALES|PUERICULTURA|JUEGO(?: DE)? MESA/],
  ['gaming',/VIDEOJUEGO|CONSOLA|PLAYSTATION|XBOX|NINTENDO|JOYSTICK|GAMEPAD/],
  ['audio',/\bAUDIO\b|PARLANTE|AUDIFONO|AURICULAR|SONIDO|SOUNDBAR|MINICOMPONENTE|MICROCOMPONENTE|RADIO|TORNAMESA/],
  ['tv',/PANTALLA|TELEVIS|\bTV\b|\bOLED\b|\bQLED\b/],
  ['printer',/IMPRESOR|IMPR LASER|MULTIFUNCIONAL|SCANNER|ESCANER/],
  ['computer',/NOTEBOOK|COMPUTA|LAPTOP|\bPC\b|TABLET|MONITOR|TECLADO|MOUSE|DISCO DURO|PENDRIVE/],
  ['fridge',/REFRIG|MINIBAR|FREEZER|CONGELAD/],
  ['laundry',/LAVADORA|LAVADO|SECADORA|SECAD ROPA|SEMIAUTOMA|CENTRIFUG/],
  ['phone',/TELEFON|CELULAR|SMARTPHONE/],
  ['kitchen',/COCINA|MICROONDA|HORNO|ENCIMERA|CAMPANA/],
  ['cleaning',/ASPIRAD|ASP POLVO|LIMPIEZA|LIMPIAVAPOR|HIDROLAVAD/],
  ['climate',/CLIMATIZ|CALEF|VENTIL|ESTUFA|CALIENTA|AIRE ACOND|ENFRIADOR|PURIFICADOR|DESHUMIDIFICADOR/],
  ['footwear',/ZAPAT|BOTIN|SANDALIA|CALZADO|CHALA|PANTUFLA|BOTAS|BALLERINA/],
  ['bike',/BICICLET/],
  ['sports',/DEPORT|FITNESS|MANCUERNA|PESA |BALON|PELOTA|TROTADORA|ELIPTICA|SCOOTER|CAMPING|CARPA|SACO(?: DE)? DORMIR/],
  ['bed',/COLCHON|CAMA|DORMITOR|BOX SPRING|RESPALDO|VELADOR/],
  ['furniture',/SOFA|SILLON|MUEBLE|COMEDOR|COMODA|CLOSET|ESCRITORIO|ESTANTE|SILLA|MESA|FUTON/],
  ['clothing',/VESTUARIO|ROPA|POLERA|POLERON|PANTAL|PIJAMA|VESTIDO|CAMISA|BODY|2 PIEZAS|CHAQUETA|PARKA|SWEATER|CHOMBA|CALCETIN|ROPA INTERIOR|SOSTEN|BOMBACHA|SLIP|CALZON|SHORT|BUZO|FALDA|BLUSA|\b(?:JEANS?|J INDIGO|BOXER|BERMUDA|CALCETAS?|CALZA|TOPS?|BOTTOM|PILUCHO|TRAJE DE BANO|CASACA|TEJIDO|ABRIGO|PETO|BRALETTE)\b/],
  ['tools',/HERRAMIENT|TALADRO|ATORNILLADOR|SIERRA|ESMERIL|FERRETERIA|JARDIN|CORTACESPED/],
];
export function productKind(product:ProductPresentation):ProductKind {
  // Explicit shoe-size sections are meaningful; gender or age labels by themselves are not.
  if(/\b(?:NINOS\s*26\s+33|TWEENS\s*34\s+40)\b/.test(normalize(product.category))) return 'footwear';
  // Category is stronger evidence than a model name or compatibility description.
  for(const text of [normalize(product.category),normalize(product.description)]) {
    const rule=rules.find(([,pattern])=>pattern.test(text));
    if(rule) return rule[0];
  }
  return 'generic';
}
export function productGroup(product:ProductPresentation):ProductGroup {return groupsByKind[productKind(product)];}
export function matchesProductGroup(product:ProductPresentation,group:string) {return !group || productGroup(product)===group;}
