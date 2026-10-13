import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";
import { auth } from "./auth";
import { secretsMatch } from "./webhook-validator";

// ─── Autenticación de las rutas GET /api/v1/* ────────────────────────
// Antes copiado en cada ruta. Dos formas de entrar:
//  - n8n / POS: header X-Api-Key con el secreto PROPIO de la organización
//    (n8nWebhookSecret) y ?orgId=. Nunca un secreto compartido: conocer el
//    id de otra organización no basta para leer sus datos.
//  - Navegador: la sesión de NextAuth del usuario.
// allowFoodPosReadKey acepta además la llave de solo lectura del POS
// (foodPosReadKey), para que el dispositivo no guarde la llave que firma.

export type OrgAuthResult = { orgId: string; response?: never } | { orgId?: never; response: NextResponse };

export async function authenticateOrgRequest(
  req: NextRequest,
  options: { allowFoodPosReadKey?: boolean } = {}
): Promise<OrgAuthResult> {
  const apiKey = req.headers.get("x-api-key");

  if (apiKey) {
    const paramOrgId = req.nextUrl.searchParams.get("orgId");
    if (!paramOrgId) {
      return { response: NextResponse.json({ error: "orgId required" }, { status: 400 }) };
    }

    const org = await prisma.organization.findUnique({
      where: { id: paramOrgId },
      select: { id: true, isActive: true, n8nWebhookSecret: true, foodPosReadKey: true },
    });

    // Una organización suspendida no abre ninguna llave: ni la que firma ni la de solo lectura del POS.
    const authorized =
      !!org &&
      org.isActive &&
      (secretsMatch(apiKey, org.n8nWebhookSecret) ||
        (!!options.allowFoodPosReadKey && !!org.foodPosReadKey && secretsMatch(apiKey, org.foodPosReadKey)));

    if (!authorized) {
      return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    return { orgId: org.id };
  }

  const session = await auth();
  if (!session?.user.organizationId) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { orgId: session.user.organizationId };
}
