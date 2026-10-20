import { prisma } from "@/lib/prisma";
import { cleanupOrg } from "@/test/helpers";

/** Only synthetic fixtures in TEST_DATABASE_URL. New history must be removed before legacy cleanup, never in product code. */
export async function cleanupAgentFixture(id: string) {
  await prisma.agentExecutionStep.deleteMany({ where: { organizationId: id } });
  await prisma.agentExecution.deleteMany({ where: { organizationId: id } });
  await prisma.agentConfigRevision.deleteMany({ where: { organizationId: id } });
  await prisma.agentInstance.deleteMany({ where: { organizationId: id } });
  await prisma.agentModelRollout.deleteMany({ where: { organizationId: id } });
  await cleanupOrg(id);
}
