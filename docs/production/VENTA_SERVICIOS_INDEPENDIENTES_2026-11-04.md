# Venta de Automatizaciones y Chatbot por separado

Fecha: 2026-11-04. Base inspeccionada: 9ec758c (correcciones del PR 173, reportado como integrado en main en la sesión anterior). No se verificó el HEAD remoto ni la versión del VPS en esta revisión.

## Dictamen
Preparado para alta y administración manual de clientes por organización y módulo. No es todavía un proceso comercial totalmente automático ni se certificó una conexión externa de extremo a extremo. Foods, POS y Lealtad no son requisitos para activar AUTOMATIONS o AI_WHATSAPP. CRM puede añadirse si el servicio necesita que el cliente consulte y gestione contactos; no se exige para gestionar artículos del chatbot.

## Recorrido reproducible en la interfaz
1. Admin → Planes: crear oferta Automatizaciones con solo AUTOMATIONS; oferta Chatbot con solo Agente IA (AI_WHATSAPP). Definir precio, usuarios, capacidad de automatizaciones y presupuesto de IA. Son decisiones comerciales: esta revisión no creó ofertas en producción.
2. Admin → Clientes: crear organización y propietario. El alta crea usuario OWNER, pipeline y configuración de canales; no crea derechos a módulos.
3. En el cliente, Cambiar plan. Esto guarda precio/plan pero NO activa sus módulos.
4. Sincronizar módulos del cliente con el plan. Revisar todos los módulos: la sincronización es ADITIVA, conserva derechos anteriores y reactiva los suspendidos incluidos en el plan. Suspender explícitamente cualquier acceso no contratado; no borrar datos.
5. Automatizaciones: el administrador configura una automatización para esa organización y su workflow. El dueño solo modifica parámetros declarados ownerEditable. Verificar secretos y conexión externa con datos ficticios antes del uso real. Las automatizaciones de cumpleaños, recuperación o ventas necesitan sus datos/eventos correspondientes; habilitar el módulo no crea esas fuentes.
6. Chatbot: configurar conocimiento publicado/autorizado, asistente y canal verificado. Empezar con aprobación humana; establecer proveedor, tarifa y límites por organización/instancia según la pantalla correspondiente. No confundir el presupuesto mensual del plan con los topes diarios o por turno del piloto. La prueba aquí creó un artículo: no publicó conocimiento ni habilitó envíos.
7. Entrar como propietario: Automatizaciones debe mostrar ese módulo; Chatbot debe mostrar Asistente e Inbox. Foods/POS/Lealtad/CRM no están habilitados. El menú conserva funciones compartidas (Inicio, Citas, métricas, reportes, configuración, solicitudes y onboarding); no es un portal totalmente exclusivo de un producto.
8. Suscripción: fijar vencimiento y registrar pago/referencia si se cobra manualmente. Stripe requiere claves, precio y webhook configurados. Cambiar plan por Stripe no sincroniza derechos automáticamente. La mora no suspende por sí sola.
9. Probar operación real en staging: ejecución n8n con callback, conversación de canal verificado, respuesta/aprobación, consumo y factura/pago sandbox. Estas conexiones no se ejecutaron en esta revisión.

## Evidencia ejecutada
Base PostgreSQL local desechable reymen_remediation_test, contenedor de auditoría local; sin clientes reales ni llamadas pagadas.

- 7 archivos / 47 pruebas: clients, plans, modules, lib/modules, ai-authorization, automation-config y portal-nav-tabs.
- 4 archivos / 17 pruebas: nuevo service-offerings, admin/billing, lib/billing y webhook Stripe (eventos simulados).
- Total: 64 pruebas aprobadas.
- Recorrido añadido en src/actions/admin/service-offerings.test.ts: crear planes y clientes con las acciones reales, comprobar falta de derechos inicial, asignar plan, sincronizar exclusivamente el módulo contratado, crear automatización/artículo, denegar otros módulos y operaciones administrativas al propietario, denegar edición de artículo de otra organización, suspender y reactivar. Autenticación y revalidación de Next simuladas, persistencia real local. Los registros sintéticos se limpian al finalizar.
- Inspección del menú: src/components/portal/PortalSidebar.tsx; guards de páginas en portal/automations, conversations, ai-lab, food y leads. Esto no sustituye una prueba visual con navegador.

## Brechas y límites
- Alta, plan y derechos son pasos separados. No prometer activación/desactivación automática por contratación.
- maxAutomations cuenta capacidad de automatizaciones, no un contador de ejecuciones facturables. Además, createAutomation administrativo no invoca assertPlanCapacity: el administrador puede superar ese límite mediante esa ruta. No vender ese valor como tope duro universal.
- Cobro por excedentes y una cuota de implementación no fueron demostrados. El precio mensual pactado existe; checkout personalizado y recargas online constan pendientes en docs/COBRO.md.
- No se ejecutó navegador, n8n, canal real ni pago real. No se verificaron credenciales/configuración del VPS. El recorrido operativo externo permanece pendiente.
- Para un portal estrictamente reducido a lo contratado, definir tratamiento comercial de Citas y las otras funciones compartidas antes de cambiar navegación.

## Cambios y despliegue
Solo se añadieron una prueba de integración y este documento. No hay cambios de producto, migraciones, envíos ni cambios de producción; no se necesita actualizar el VPS por esta revisión. No se publicó ni fusionó esta rama.
