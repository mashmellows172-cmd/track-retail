
export function isDistinctPlu(list: string[], plu: string): boolean {
  return !list.includes(plu);
}

export function canAddToComparison(current: string[], plu: string): boolean {
  if (current.length >= 3) return false;
  return isDistinctPlu(current, plu);
}
