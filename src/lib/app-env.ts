// Producción o ambiente de prueba (apptest.reymen.mx). El ambiente de prueba corre con REYMEN_ENV=test: muestra la
// franja «AMBIENTE DE PRUEBA» y no manda correos salvo a la lista permitida. Ver docs/AMBIENTE-PRUEBA.md.

export function isTestEnv(): boolean {
  return process.env.REYMEN_ENV === "test";
}

/** En prueba, solo se envían correos a estas direcciones (TEST_EMAIL_ALLOWLIST, separadas por coma). */
export function testEmailAllowed(to: string): boolean {
  const list = (process.env.TEST_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(to.trim().toLowerCase());
}
