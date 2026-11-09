import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { UserError } from "./user-error";

/**
 * «Dejar como nuevo»: borra los datos de operación de un cliente (lo que se generó al probar) y conserva todo lo que
 * el negocio va a usar. Pensado para entregar un negocio después de las pruebas.
 *
 * SE BORRA: contactos (leads), oportunidades, notas, tareas, citas, conversaciones y mensajes; clientes, Lealtad
 * (integrantes, visitas, recompensas, canjes); ventas y su inventario usado, platillos vendidos, compras, movimientos
 * de inventario, comandas, cortes y pedidos de delivery; eventos y ejecuciones de automatizaciones; métricas y
 * webhooks recibidos. Las existencias quedan en 0 para capturar el conteo inicial real.
 *
 * SE CONSERVA: el negocio, usuarios, módulos y plan; menú, categorías, recetas, modificadores, insumos, proveedores,
 * gastos fijos y sucursales; embudos y etapas, campos propios, reglas de seguimiento y de citas, servicios y
 * horarios; programa de Lealtad; automatizaciones y su configuración; agentes de IA y base de conocimiento;
 * conexiones de canales; facturación y consumo de IA; la bitácora (auditoría).
 *
 * Todo en una sola transacción: o se borra todo o no se borra nada.
 */

export interface ClientResetSummary {
  leads: number;
  opportunities: number;
  tasks: number;
  appointments: number;
  conversations: number;
  messages: number;
  customers: number;
  loyaltyMembers: number;
  loyaltyVisits: number;
  sales: number;
  purchases: number;
  inventoryMovements: number;
  automationRuns: number;
  /** Insumos (y existencias por sucursal) con existencia distinta de 0 que quedarán en 0. */
  stockItems: number;
}

type Db = Prisma.TransactionClient | typeof prisma;

export async function previewClientReset(organizationId: string, db: Db = prisma): Promise<ClientResetSummary> {
  const org = { organizationId };
  const [leads, opportunities, tasks, appointments, conversations, messages, customers, loyaltyMembers, loyaltyVisits, sales, purchases, inventoryMovements, automationRuns, stockItems, branchStock] = await Promise.all([
    db.lead.count({ where: org }),
    db.opportunity.count({ where: org }),
    db.task.count({ where: org }),
    db.appointment.count({ where: org }),
    db.conversation.count({ where: org }),
    db.message.count({ where: { conversation: org } }),
    db.customer.count({ where: org }),
    db.loyaltyMember.count({ where: org }),
    db.loyaltyVisit.count({ where: org }),
    db.foodSale.count({ where: org }),
    db.foodPurchase.count({ where: org }),
    db.foodInventoryMovement.count({ where: org }),
    db.automationExecution.count({ where: org }),
    db.foodInventoryItem.count({ where: { ...org, NOT: { currentStock: 0 } } }),
    db.branchStock.count({ where: { ...org, NOT: { currentStock: 0 } } }),
  ]);
  return { leads, opportunities, tasks, appointments, conversations, messages, customers, loyaltyMembers, loyaltyVisits, sales, purchases, inventoryMovements, automationRuns, stockItems: stockItems + branchStock };
}

/** El texto que hay que escribir para confirmar: el nombre del negocio, tal cual. */
export function resetConfirmationMatches(orgName: string, typed: string): boolean {
  return typed.trim() === orgName.trim() && orgName.trim().length > 0;
}

export async function resetClientData(organizationId: string): Promise<ClientResetSummary> {
  const exists = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!exists) throw new UserError("Cliente no encontrado");

  return prisma.$transaction(
    async (tx) => {
      const summary = await previewClientReset(organizationId, tx);
      const org = { organizationId };

      // Piloto privado del agente (sus turnos apuntan a mensajes y el piloto a la conversación, sin cascada).
      await tx.markChatTurn.deleteMany({ where: org });
      await tx.markChatPilot.deleteMany({ where: org });

      // Lealtad: canjes → recompensas → visitas → integrantes (los dispositivos de Wallet caen con el integrante).
      await tx.loyaltyPosRedemption.deleteMany({ where: org });
      await tx.loyaltyReward.deleteMany({ where: org });
      await tx.loyaltyVisit.deleteMany({ where: org });
      await tx.loyaltyMember.deleteMany({ where: org });
      await tx.loyaltyEventReceipt.deleteMany({ where: org });

      // Foods: ventas y todo lo que generaron, compras (sus renglones caen con la compra), movimientos y conteos.
      await tx.foodRecipeUsage.deleteMany({ where: org });
      await tx.foodInventoryMovement.deleteMany({ where: org });
      await tx.foodSale.deleteMany({ where: org });
      await tx.foodDishSale.deleteMany({ where: org });
      await tx.foodModifierOptionSale.deleteMany({ where: org });
      await tx.foodPurchase.deleteMany({ where: org });
      await tx.foodKitchenTicket.deleteMany({ where: org });
      await tx.foodShiftClose.deleteMany({ where: org });
      await tx.deliveryOrder.deleteMany({ where: org });
      await tx.foodInventoryItem.updateMany({ where: org, data: { currentStock: 0 } });
      await tx.branchStock.updateMany({ where: org, data: { currentStock: 0 } });

      // Clientes del negocio y sus opiniones.
      await tx.customerFeedback.deleteMany({ where: org });
      await tx.customer.deleteMany({ where: org });

      // Automatizaciones: lo que pasó (eventos, ejecuciones, atribución). La configuración se queda.
      await tx.automationTouch.deleteMany({ where: org });
      await tx.automationConversion.deleteMany({ where: org });
      await tx.automationExecution.deleteMany({ where: org });
      await tx.domainEvent.deleteMany({ where: org });
      await tx.automationEvent.deleteMany({ where: org });
      await tx.pipelineAiRun.deleteMany({ where: org }); // sus acciones caen en cascada

      // CRM: todo lo que cuelga de los contactos, y al final los contactos.
      await tx.task.deleteMany({ where: org });
      await tx.note.deleteMany({ where: org });
      await tx.opportunity.deleteMany({ where: org });
      await tx.followUpLog.deleteMany({ where: { lead: org } });
      await tx.appointmentReminderLog.deleteMany({ where: { appointment: org } });
      await tx.appointment.deleteMany({ where: org }); // las visitas a propiedades caen con su cita
      await tx.message.deleteMany({ where: { conversation: org } });
      await tx.conversation.deleteMany({ where: org }); // sus borradores de respuesta caen en cascada
      await tx.realtyProfileSuggestion.deleteMany({ where: org });
      await tx.realtyLeadProfile.deleteMany({ where: org }); // zonas y coincidencias caen en cascada
      await tx.lead.deleteMany({ where: org });

      // Registro técnico de la operación de prueba.
      await tx.metric.deleteMany({ where: org });
      await tx.webhookEvent.deleteMany({ where: org });

      return summary;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
