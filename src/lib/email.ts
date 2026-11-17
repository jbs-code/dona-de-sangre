// Mismo patrón para todo correo que entra por un formulario o una API.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normaliza el correo igual que la base: sin espacios y en minúsculas.
 * Un valor que no sea texto se convierte en cadena vacía (nunca válido).
 */
export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
