// Pure module — importable from client and server contexts.
//
// Reglas del ciclo de visitas de REYMEN Loyalty. Todo cálculo de progreso y
// de "¿esta visita desbloquea la recompensa?" pasa por aquí, para que la
// caja, la tarjeta del cliente, el seed de demo y las pruebas usen la misma
// lógica (nada de recalcular el progreso a mano en cada pantalla).

export interface CycleState {
  /** Número del ciclo en curso (empieza en 1; cada recompensa abre el siguiente). */
  cycleNumber: number;
  /** Visitas contadas en el ciclo en curso. */
  cycleVisits: number;
}

export interface Progress {
  current: number;
  goal: number;
  remaining: number;
  /** 0–100, entero. */
  pct: number;
  /** El ciclo ya llegó a la meta (la siguiente visita entrega la recompensa si la meta bajó). */
  complete: boolean;
}

/** Normaliza una meta de visitas: entera y entre 1 y 100. */
export function normalizeGoal(goal: number): number {
  if (!Number.isFinite(goal)) return 1;
  return Math.min(100, Math.max(1, Math.round(goal)));
}

/**
 * Progreso visible hacia la siguiente recompensa. Si la meta del programa bajó
 * después de que el cliente avanzó (p. ej. tenía 11 con meta 12 y ahora la meta
 * es 10), se muestra la meta como alcanzada en vez de "11 / 10".
 */
export function progressOf(cycleVisits: number, goal: number): Progress {
  const g = normalizeGoal(goal);
  const current = Math.min(Math.max(0, Math.floor(cycleVisits)), g);
  return {
    current,
    goal: g,
    remaining: g - current,
    pct: Math.round((current / g) * 100),
    complete: current >= g,
  };
}

export interface VisitOutcome {
  /** Estado del miembro después de la visita. */
  next: CycleState;
  /** Ciclo en el que contó esta visita (para guardarlo en la visita). */
  countedInCycle: number;
  /** Visitas del ciclo justo después de sumar esta (antes de reiniciar). */
  reachedVisits: number;
  /** La visita completó el ciclo: hay que emitir una recompensa para countedInCycle. */
  rewardEarned: boolean;
}

/**
 * Aplica una visita confirmada al ciclo del miembro con la meta vigente.
 * Al llegar a la meta se emite la recompensa de ese ciclo y empieza el
 * siguiente en 0 (las visitas de más no se arrastran: un ciclo = una
 * recompensa). Cambiar la meta nunca reescribe ciclos ya cerrados.
 */
export function applyVisit(state: CycleState, goal: number): VisitOutcome {
  const g = normalizeGoal(goal);
  const reachedVisits = Math.max(0, state.cycleVisits) + 1;
  if (reachedVisits >= g) {
    return {
      next: { cycleNumber: state.cycleNumber + 1, cycleVisits: 0 },
      countedInCycle: state.cycleNumber,
      reachedVisits,
      rewardEarned: true,
    };
  }
  return {
    next: { cycleNumber: state.cycleNumber, cycleVisits: reachedVisits },
    countedInCycle: state.cycleNumber,
    reachedVisits,
    rewardEarned: false,
  };
}

/** Promedio de compra: venta acumulada ÷ visitas en las que se capturó monto (no todas las visitas). */
export function averageTicket(totalSpent: number, visitsWithAmount: number): number {
  if (!visitsWithAmount || visitsWithAmount <= 0) return 0;
  return roundMoney(totalSpent / visitsWithAmount);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
