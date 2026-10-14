// Pure module — importable from client and server contexts.
// Valor de ?branch= que significa "la sucursal principal" (la implícita, sin
// fila en Branch). Vive aparte de branches.ts porque aquel importa Prisma y los
// componentes de cliente solo necesitan esta constante.
export const MAIN_BRANCH_PARAM = "main";
