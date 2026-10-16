/** Destructive demo resets must be explicitly requested and must never target live data. */
export function assertLoyaltyDemoSeedAllowed(env: { NODE_ENV?: string; ALLOW_LOYALTY_DEMO_SEED?: string }) {
  if (env.NODE_ENV === "production" || env.ALLOW_LOYALTY_DEMO_SEED !== "cafe-norte-demo") {
    throw new Error("Demo bloqueada. Usa una base de desarrollo y ALLOW_LOYALTY_DEMO_SEED=cafe-norte-demo; no se permite ejecutar en producción.");
  }
}

export function assertLoyaltyDemoDataOnly(realPrograms: number, realCustomers: number) {
  if (realPrograms > 0 || realCustomers > 0) {
    throw new Error("Demo bloqueada: esta organización contiene programas o clientes ajenos a la demo. No se modificó ningún registro.");
  }
}
