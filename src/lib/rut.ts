/**
 * Se guarda siempre sin puntos y con guion (ej. "76647271-0"), sin importar
 * cómo lo haya escrito la IA o la persona al tipearlo a mano.
 */
export function normalizarRut(rut: string | null): string | null {
  if (!rut) return null;
  const limpio = rut.replace(/\./g, "").trim();
  return limpio || null;
}
