# Catálogo de planes

El catálogo comercial vive en la base de datos (`Plan`, con su historial en `PlanRevision`) y se edita en **Admin → Planes**. `Organization.plan` guarda la **llave** del plan (`starter`, `professional`, `business`…); el nombre visible, el precio y todo lo demás se pueden cambiar sin tocar código.

## Qué se edita
Nombre (es/en), descripción, **precio mensual (MXN)**, límites de leads/usuarios/automatizaciones (vacío = ilimitado), **presupuesto interno de IA**, **agentes IA activos**, módulos incluidos, **"qué incluye"** (líneas es/en), precio de Stripe, **color de diferenciación** (sutil: borde superior, fondo suave e insignia; se ve igual en Planes, Cambiar plan y Configuración del portal), orden y si el plan está activo.

## Dónde se actualiza al guardar (de inmediato, todo lee de `src/lib/plans.ts`)
| Dónde | Qué toma del plan |
|---|---|
| Validación de capacidad (`assertPlanCapacity`) | límites de leads, usuarios, automatizaciones |
| Portal → Configuración (plan actual) y Reportes | nombre, descripción, precio, límites, "qué incluye", módulos |
| Admin → Cliente (encabezado, tarjetas) y **Cambiar plan** | nombre, precio, límites, módulos (solo planes activos) |
| ROI | precio de lista (o el pactado con el cliente) |
| Presupuesto de IA (`getBudgetState`) | presupuesto interno del plan (si el cliente no tiene uno propio) |
| Sincronizar módulos del cliente | módulos del plan |
| SmartCard | límite de integrantes = usuarios del plan |
| Stripe (checkout y webhook) | precio de Stripe del plan (o `STRIPE_PRICE_<LLAVE>`) |
| Admin → Métricas | nombre del plan |

## Card «Custom»
En Admin → Planes, junto a los planes del catálogo, hay un card **Custom**: no es una fila del catálogo sino los clientes con **precio pactado** (`Organization.customMonthlyPriceMxn`) —su plan base, el precio de lista y lo que pagan—. En **Cambiar plan** hay una tarjeta equivalente que lleva al campo «Precio mensual pactado».

## Reglas
- Cada edición sube la **versión**, guarda cómo quedó el plan (`PlanRevision`) y queda en la bitácora con el antes y el después (`plan.update`, `plan.create`).
- El **precio pactado con un cliente** (`Organization.customMonthlyPriceMxn`) no se toca al cambiar el precio de lista.
- Un plan **retirado** no se asigna a clientes nuevos; quienes ya lo tienen lo conservan. Siempre debe quedar al menos un plan activo.
- La llave no se puede cambiar. Una llave desconocida se trata como Starter.
- El catálogo se guarda unos segundos en memoria; al editar se invalida (en otra instancia del servidor llega, a más tardar, en 15 s).
- **Tope de agentes IA (aplicado):** un «agente» es un canal del inbox (WhatsApp, Instagram, Messenger, chat web, correo, consultas) en modo Sugerir o Automático; la IA del pipeline no cuenta. El tope (1/3/5 según plan) **solo bloquea encender un canal apagado** («Tu plan incluye N agentes IA activos; apaga uno o mejora tu plan»); cambiar entre Sugerir y Automático o apagar nunca se bloquea y **nada se apaga solo**. Un cliente que ya está por encima conserva lo que tiene, ve el aviso «tienes X, tu plan incluye N» en WhatsApp y aparece en Admin → Planes → «Clientes por encima de su tope». La migración dejó explícito el estado de cada cliente existente (canales sin fila = Sugerir) para que nadie cambie. Los clientes nuevos arrancan solo con WhatsApp.
- **Tope pactado (Custom):** Admin → Cliente → Presupuesto de IA → «Tope de agentes IA» reemplaza el del plan solo para ese cliente (auditado con motivo, acción `ai.agents_cap`); vacío vuelve al del plan.

- **Cobro mensual:** ver `docs/COBRO.md` (vencimientos, pagos, avisos y cron).
