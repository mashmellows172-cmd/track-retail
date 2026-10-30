import type { StockProduct } from '@/lib/stock';

export interface OpportunityItem {
  product: StockProduct;
  kind: 'price_drop' | 'suitable_sala' | 'confirm_single';
  priority: number;
  reason: string;
  absoluteDrop?: number;
  percentageDrop?: number;
}

function isValidPrice(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isValidPriorPrice(value: number | undefined): value is number {
  return isValidPrice(value);
}

export function isValidCurrentPrice(value: number | undefined): value is number {
  return isValidPrice(value);
}

export function getOpportunityItems(products: StockProduct[]): OpportunityItem[] {
  const items: OpportunityItem[] = [];

  for (const product of products) {
    const available = product.available;
    // Units 1/0/negative are separate - never false opportunities
    if (typeof available !== 'number' || !Number.isSafeInteger(available)) {
      continue;
    }
    if (available < 0) {
      // negative stock - marked separately, not a positive opportunity to push
      continue;
    }
    if (available === 0) {
      // zero units - never false opportunity
      continue;
    }

    // Price drops - require positive valid prior and current prices.
    // Zero/negative units are never offered; one unit stays visible with a confirmation cue.
    if (available >= 1 && isValidPriorPrice(product.previousPrice) && isValidCurrentPrice(product.price)) {
      if (product.price < product.previousPrice) {
        const absoluteDrop = product.previousPrice - product.price;
        const percentageDrop = Math.round((absoluteDrop / product.previousPrice) * 100);
        items.push({
          product,
          kind: 'price_drop',
          priority: 10,
          reason: available === 1 ? 'Bajó de precio · confirma la única unidad' : 'Bajó de precio',
          absoluteDrop,
          percentageDrop,
        });
      }
    }

    // Suitable sala - >= 2 units
    if (available >= 2) {
      items.push({
        product,
        kind: 'suitable_sala',
        priority: 5,
        reason: 'Adecuado para sala (≥2 unidades)',
      });
    }

    // Confirm 1 unit
    if (available === 1) {
      items.push({
        product,
        kind: 'confirm_single',
        priority: 8,
        reason: '1 unidad - confirmar estado',
      });
    }
  }

  // Stable sorting
  items.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const nameA = a.product.description || '';
    const nameB = b.product.description || '';
    const cmp = nameA.localeCompare(nameB, 'es');
    if (cmp !== 0) return cmp;
    return a.product.plu.localeCompare(b.product.plu);
  });

  return items;
}
