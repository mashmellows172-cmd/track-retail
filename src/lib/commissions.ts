// Tablas de comisión replicadas de database.sql
export const comisionTelefonia = (valor: number, anos: number) => {
  if (!Number.isSafeInteger(valor) || valor < 4000 || !Number.isInteger(anos) || anos < 1 || anos > 2) return 0;
  if (valor <= 20000) return anos === 1 ? 1200 : 1000;
  if (valor <= 60000) return anos === 1 ? 1200 : 2000;
  if (valor <= 100000) return anos === 1 ? 2400 : 4000;
  if (valor <= 151000) return anos === 1 ? 3600 : 6000;
  if (valor <= 251000) return anos === 1 ? 5900 : 9900;
  return anos === 1 ? 9100 : 15000;
};

export const comisionLineasDuras = (valor: number, anos: number) => {
  if (!Number.isSafeInteger(valor) || valor < 4000 || !Number.isInteger(anos) || anos < 1 || anos > 4) return 0;
  if (valor <= 20000) return anos === 1 ? 600 : anos === 2 ? 1000 : anos === 3 ? 1200 : 1400;
  if (valor <= 60000) return anos === 1 ? 1200 : anos === 2 ? 2000 : anos === 3 ? 2400 : 2800;
  if (valor <= 100000) return anos === 1 ? 2400 : anos === 2 ? 4000 : anos === 3 ? 4800 : 5600;
  if (valor <= 151000) return anos === 1 ? 3600 : anos === 2 ? 6000 : anos === 3 ? 7200 : 8400;
  if (valor <= 251000) return anos === 1 ? 5900 : anos === 2 ? 9900 : anos === 3 ? 12000 : 14000;
  return anos === 1 ? 9100 : anos === 2 ? 15000 : anos === 3 ? 18000 : 21000;
};

