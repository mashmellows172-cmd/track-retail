export const getMetaMensual = (mes: string): number => {
  if (typeof window === 'undefined') return 150000;
  
  try {
    const saved = localStorage.getItem(`trackretail_meta_${mes}`);
    if (saved) {
      const val = parseInt(saved, 10);
      if (!isNaN(val)) return val;
    }
  } catch (e) {
    console.warn('LocalStorage no accesible para metas');
  }
  
  return 150000; // Valor por defecto
};

export const setMetaMensual = (mes: string, valor: number): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`trackretail_meta_${mes}`, valor.toString());
  } catch (e) {
    console.warn('No se pudo guardar la meta');
  }
};
