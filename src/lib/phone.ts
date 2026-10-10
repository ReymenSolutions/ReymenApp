/**
 * Llave para comparar teléfonos aunque cambie el formato: solo los últimos 10
 * dígitos. "+52 1 55 1234 5678", "5215512345678" y "(55) 1234-5678" dan la
 * misma llave. Devuelve null si no hay dígitos suficientes para identificar
 * a alguien (menos de 7), para no unir contactos por números incompletos.
 */
export function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}
