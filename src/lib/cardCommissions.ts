export interface CardCommissionRecord {
  id: string; openedOn: string; activatedOn: string | null; base: number; activatedTotal: number;
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value;
}
export function cardCommission(record: CardCommissionRecord) {
  if (!validDate(record.openedOn) || (record.activatedOn !== null && record.activatedOn !== record.openedOn)) throw new Error('La apertura y activación deben registrarse el mismo día.');
  if (![record.base, record.activatedTotal].every(n => Number.isSafeInteger(n) && n >= 0) || record.activatedTotal < record.base) throw new Error('El total activado debe ser igual o mayor al monto por apertura.');
  return record.activatedOn ? record.activatedTotal : record.base;
}
export function cardMonthlyTotal(records: CardCommissionRecord[], month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mes inválido.');
  return records.reduce((sum, r) => {
    cardCommission(r);
    const openingMonth = r.openedOn.slice(0,7);
    const total = sum + (openingMonth === month ? cardCommission(r) : 0);
    if (!Number.isSafeInteger(total)) throw new Error('El total supera el rango permitido.');
    return total;
  },0);
}
