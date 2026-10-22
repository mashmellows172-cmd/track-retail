export function productKind(product: {category:string;description:string}) {
  const text=`${product.category} ${product.description}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  if(/PANTALLA|TELEVIS|\bTV\b|\bOLED\b|\bQLED\b/.test(text)) return 'tv';
  if(/NOTEBOOK|COMPUTA|LAPTOP|\bPC\b|TABLET/.test(text)) return 'computer';
  if(/REFRIG|MINIBAR|FREEZER|CONGELAD/.test(text)) return 'fridge';
  if(/LAVADORA|LAVADO|SECADORA|SECAD_ROPA|SEMIAUTOMA|CENTRIFUG/.test(text)) return 'laundry';
  if(/TELEFON|CELULAR|SMARTPHONE/.test(text)) return 'phone';
  if(/COCINA|MICROONDA|HORNO|ENCIMERA/.test(text)) return 'kitchen';
  if(/ASPIRAD|ASP_POLVO/.test(text)) return 'cleaning';
  if(/CALEF|VENTIL|ESTUFA|CALIENTA|AIRE ACOND/.test(text)) return 'climate';
  if(/IMPRESOR|IMPR\.LASER/.test(text)) return 'printer';
  if(/ZAPAT|BOTIN|SANDALIA|CALZADO/.test(text)) return 'footwear';
  if(/BICICLET/.test(text)) return 'bike';
  if(/COLCHON|CAMA|DORMITOR/.test(text)) return 'bed';
  if(/SOFA|SILLON|MUEBLE/.test(text)) return 'furniture';
  if(/MOCHILA|MALETA|BOLSO/.test(text)) return 'bag';
  if(/POLERA|PANTAL|PIJAMA|VESTIDO|CAMISA|BODY|2_PIEZAS/.test(text)) return 'clothing';
  return 'generic';
}
