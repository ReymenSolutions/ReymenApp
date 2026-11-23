# Auditoría Fase 0 — Reymen Retail (Grupo Carvallo)

**Fecha:** 23 nov 2026 · **Commit auditado:** `780430b` (main) · **Hecha por:** Claude Code, antes de escribir código.
**Fuente:** [`SPEC.md`](SPEC.md). Aquí solo se verifica lo que el spec da por hecho contra el repo real y se marcan las
diferencias. No cambia el spec: las diferencias que requieren decisión están en [`DECISIONS.md`](DECISIONS.md).

## 1. Lo que el spec dice y SÍ se confirma

| Supuesto del spec | Verificado en el repo |
|---|---|
| Commit `780430b`, `schema.prisma` con 3,749 líneas | ✅ Igual |
| Enum `PlatformModule` en `prisma/schema.prisma:1345` | ✅ CRM, AI_WHATSAPP, AUTOMATIONS, NFC_QR, MARKETING_ADS, FOOD_OPS, REYMEN_POS, LOYALTY, REALTY. No existe RETAIL |
| `NFC_QR` y `MARKETING_ADS` reservados, sin schema/UI | ✅ `schema.prisma:1349-1350` («reserved — no schema/UI yet») |
| Registro de módulos en `src/lib/modules.ts` | ✅ `MODULE_LABEL`, `MODULE_LABEL_EN`, `ALL_MODULES` |
| Entitlement por `OrganizationModule` | ✅ `hasModule` / `hasContractedModule` (status `ACTIVE`; con cobro suspendido, `hasModule` da falso) |
| Guard `requireModule(orgId, "RETAIL")` | ✅ Existe: en páginas redirige a `/portal/dashboard`. En server actions el equivalente es `assertModuleEnabled` (lanza error) |
| `REYMEN_POS` = permiso para recibir ventas de un POS externo por webhook | ✅ `src/app/api/webhooks/pos/orders/route.ts` → `processFoodPosOrder` (`src/lib/food.ts:1106`) |
| Food: inventario por cantidad, no por pieza | ✅ `FoodInventoryItem` + `FoodInventoryMovement` + `BranchStock` |
| CRM `Customer` y `Lead` existen | ✅ `Customer` (único por `organizationId + phoneKey`, con `leadId` opcional) y `Lead` |
| LOYALTY real (programas, miembros, visitas, recompensas) | ✅ |
| Rutas `/portal/*` con módulo propio y pestañas | ✅ Patrón Realty: `src/app/(portal)/portal/realty/layout.tsx` + `getRealtyContext()` (`src/lib/realty/context.ts`) + `RealtyHeader`/`RealtyTabs` |

## 2. Diferencias con el spec (corregir antes de codificar)

| # | El spec dice | El repo tiene | Efecto |
|---|---|---|---|
| D1 | «Next.js 15» | **Next.js 16.4** (`package.json`) | `AGENTS.md`: esta versión trae cambios que rompen; leer `node_modules/next/dist/docs/` antes de escribir rutas |
| D2 | «patrón Realty / Contractors / Talleres» | **Solo existe Realty.** No hay módulos Contractors ni Talleres en el repo | Seguir únicamente el patrón Realty |
| D3 | Crear `RetailLocation` nueva | Ya existe **`Branch`** (sucursales genéricas, usadas por Food, Lealtad y Realty; `src/lib/branches.ts`) | Riesgo de duplicar sucursales → decisión **DEC-01** |
| D4 | «POS Reymen» se construye nuevo dentro de RETAIL | Además de ReymenApp existe la app **ReymenPOS** (repo `ReymenSolutions/ReymenPOS`, `pos.reymen.mx`), en producción con Villa Gardenia: cajas offline, cortes, impresión Epson por USB, app Android, dispositivos y personal con PIN | Se puede reutilizar mucho, pero es offline-first y la regla de «sin doble venta» necesita servidor → decisión **DEC-02** |
| D5 | `fotoUrl`, hasta 10 GB de fotos | Realty guarda las fotos **dentro de Postgres** (`RealtyPropertyMedia.data Bytes`) | Miles de fotos en la base hacen pesados los respaldos y el clon de prueba → decisión **DEC-03** |
| D6 | Importación de Excel de GESEM | No hay librería de Excel (sí `qrcode` y `sharp`) | Agregar lector de `.xlsx` o pedir CSV → decisión **DEC-04** |
| D7 | Vendedor = `RetailEmployee` o usuario | Roles `UserRole`: SUPER_ADMIN, ADMIN, OWNER, MANAGER, AGENT, VIEWER, CLIENT. Permisos en `src/lib/permissions.ts` (p. ej. `realty:manage` / `realty:operate`) | Definir si cada vendedor es un `User` o un empleado con PIN → decisión **DEC-05** |
| D8 | (sin mención) | Línea duplicada en el spec: «Entitlement por organización vía `OrganizationModule`…» aparece 2 veces | Solo edición del spec |

## 3. Lugares que se tocan para registrar RETAIL (checklist técnico)

1. `prisma/schema.prisma` → `enum PlatformModule { … RETAIL }` + migración.
2. `src/lib/modules.ts` → `MODULE_LABEL`, `MODULE_LABEL_EN`, `ALL_MODULES`.
3. `src/lib/permissions.ts` → permisos `retail:manage` / `retail:operate` (y los que se definan para vender, mover, aprobar descuentos).
4. `src/lib/guards.ts` → guards como los de Realty (`requireOrgPermission` + `assertModuleEnabled(..., "RETAIL")`).
5. `src/components/portal/PortalSidebar.tsx` → entrada `/portal/retail` con `module: "RETAIL"`.
6. Admin: `src/actions/admin/modules.ts`, `src/actions/admin/plans.ts`, `src/components/admin/CustomPlanDialog.tsx`, `PlanEditorDialog.tsx` (usan `ALL_MODULES`; revisar textos y límites).
7. `src/app/(portal)/portal/retail/layout.tsx` + `src/lib/retail/context.ts` (como `getRealtyContext`).
8. i18n: `src/lib/i18n-retail.ts` (como `i18n-realty.ts`).
9. Pruebas: el repo usa vitest con base real (`reymen_ops_test`) y Playwright; cada regla de negocio del spec lleva su prueba.

## 4. Lo que ya existe y se reutiliza

- **Transacción de venta** de Food (`processFoodPosOrder`: `prisma.$transaction`, idempotencia por id de orden).
- **Sucursales** (`Branch`, `listBranches`) — ver DEC-01.
- **Clientes**: `Customer` + `Lead` (CRM). Retail no crea tabla de personas.
- **Rutas públicas**: `/p/[slug]` (Realty) y `/lealtad/[slug]` → patrón para la web de ventas (Fase 2).
- **QR**: librería `qrcode` ya instalada. **Imágenes**: `sharp` y `src/lib/square-image.ts`.
- **Ambiente de prueba**: `apptest.reymen.mx` (`docs/AMBIENTE-PRUEBA.md`) para el piloto antes de producción.
- **Bitácora**: `logAudit` (`src/lib/audit.ts`) para «quién/cuándo».

## 5. Conclusión

El patrón Realty sigue vigente y sirve para RETAIL. **No hay que esperar nada del repo** para empezar Fase 1, pero hay
**5 decisiones abiertas (DEC-01 a DEC-05)** que cambian el modelo de datos; conviene cerrarlas antes de la migración
de Prisma, para no rehacerla.
