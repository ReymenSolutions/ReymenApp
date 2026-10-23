const HUMAN_REQUEST = /\b(humano|persona real|una persona|asesor|agente humano|gerente|encargado|supervisor|queja|reclam\w*|reembols\w*|devoluci\w*|cancel\w*|demanda|abogado|profeco|estafa|fraude|human|real person|manager|complain\w*|refund|lawyer|sue you|scam|fraud)\b/i;
/** Shared deterministic escalation rule; does not call a model. */
export function customerNeedsHuman(text: string): boolean { return HUMAN_REQUEST.test(text); }
