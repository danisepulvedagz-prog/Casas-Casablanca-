/** Parsea una fecha "YYYY-MM-DD" (columna date de Postgres) como medianoche UTC. */
export function parseFechaUTC(fecha: string): Date {
  return new Date(`${fecha}T00:00:00Z`);
}

export function hoyUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** a - b, en días completos. */
export function diferenciaDias(a: Date, b: Date): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((a.getTime() - b.getTime()) / MS_POR_DIA);
}

export function esFinDeSemana(date: Date): boolean {
  const dia = date.getUTCDay();
  return dia === 0 || dia === 6;
}

/** Si la fecha cae en sábado/domingo, avanza al lunes siguiente. */
export function siguienteDiaHabil(date: Date): Date {
  const d = new Date(date);
  while (esFinDeSemana(d)) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

/** Avanza `dias` días hábiles (lunes a viernes) desde `date`, saltando fines de semana. */
export function avanzarDiasHabiles(date: Date, dias: number): Date {
  const d = new Date(date);
  let restantes = dias;
  while (restantes > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!esFinDeSemana(d)) restantes--;
  }
  return d;
}
