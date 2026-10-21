# 06 — Seguridad y gobernanza

Estado actual C/P remite a 01/02; controles futuros son **I**. No pentest externo, escaneo activo de producción, lectura de secretos o modificación de BD.

## Modelo de amenazas

Activos: credenciales de canal/proveedor, mensajes/PII, CRM/compras/agenda, conocimiento privado, consentimiento, auditoría, presupuesto y reputación del negocio. Actores: usuario autenticado sin permiso, tenant adversario, remitente externo, fuente KB maliciosa, operador comprometido, conector con token filtrado, modelo que devuelve instrucciones inesperadas. El modelo y su salida no son un principal autorizado.

Fronteras: navegador→Server Action; proveedor→n8n; n8n→webhook; App→modelo; modelo→tool executor; ejecución→canal; App→BD; operador global→tenant. Office futuro constituye otra frontera, no bypass administrativo.

| Amenaza | Control C actual / hueco | Control propuesto y comprobación |
|---|---|---|
| Suplantación/sesión obsoleta | auth/session-guard revalida con caché15s; H01 omite permiso en acciones | Guardia backend uniforme, no confiar en UI; revocación y cambio rol probados entre procesos |
| IDOR/BOLA entre tenants | Muchos findFirst id+org y API key por org | Tenant inmutable en ExecutionContext; FKs compuestas/grants; probar cada ID de instancia/fuente/tool/trace/approval de otro tenant |
| Elevación de rol | VIEWER modifica KB/identidad en prueba simulada | H01 antes del piloto, auditoría y deny-by-default |
| Replay/webhook falsificado | HMAC timestamp, dedup firma/evento; ID opcional | ID externo obligatorio por conexión; firma proveedor verificada en borde; no fiarse de orgId en body sin credencial ligada |
| Credencial plataforma comprometida | /n8n/ai usa secreto global, org seleccionado por emisor | Mantener solo backend confiable; scope por conexión/servicio, rotación/revocación/versionado. Nunca distribuir secreto a browser/POS físico |
| Prompt injection directa o KB | Prompts/regex, no grants por fuente | Separar instrucciones de datos; fuentes aprobadas y mínimo contexto; validación de tools/ACL independiente del texto; casos adversariales |
| Output malicioso | Texto React y JSON parseado; guardrails respuesta | Schema estricto, enum/longitudes, no eval/SQL/shell/HTML libre; tool output tratado como datos no confiables |
| Exfiltración | Contexto puede incluir nombre/status/oportunidades; sin política por agente | Minimización por tool/fuente, redacción, destino permitido, no enviar tenant secret al modelo; trazas bajo RBAC |
| SSRF/media | n8n path restringido; adjunto URL libre en acción | Resolver archivos por ID firmado y propiedad; egress/allowlist, DNS/IP privado/redirect, MIME/tamaño; conector no descarga URL arbitraria |
| CSRF/CORS/embed | Server Actions/NextAuth y CSP; sin widget encontrado | Verificar origin/host/proxy y cookies en despliegue; endpoints state-changing protegidos. Widget separado con token visitante tenant+dominio+sesión, no credencial org |
| Abuso/DoS | rate-limit BD en webhook/tester, lectura cuerpo previa | Límites proxy/aplicativos cuerpo/tokens, cuotas tenant/usuario/conexión y concurrencia; política explícita en fallo limiter |
| Costos descontrolados | Reserva lock y ledger; desconocidos/fallback H08 | Límite por raíz/paso, conciliación de costos desconocidos, presupuesto prueba separado; alerts antes de bloqueo |
| Doble ejecución/carrera | Dedup parcial, after, control humano pre-LLM | Idempotencia + lease durable + precondiciones al escribir/enviar; reconciliar aceptación ambigua |
| PII/logs/retención | Ledger sin prompts; Message/WebhookEvent sí contienen datos; logs error libres | Allowlist campos de logs, redacción, acceso/retención por tipo y borrado aprobado; auditar exportaciones |
| Cadena de suministro | Dependencias declaradas/lockfile existentes | SCA sobre lockfile en CI autorizado; no declarar sin vulnerabilidades: no se consultó advisories ni actualizó dependencias |

Referencias C: [auth](../../src/lib/auth.ts#L134), [session guard](../../src/lib/session-guard.ts), [API auth](../../src/lib/api-key-auth.ts), [webhook validator](../../src/lib/webhook-validator.ts), [rate limit](../../src/lib/rate-limit.ts), [n8n](../../src/lib/n8n.ts), [CSP/headers](../../next.config.ts), [gateway](../../src/lib/ai/gateway.ts). CSP permite inline scripts por diseño actual: no certifica ausencia XSS; frame-ancestors none impide asumir iframe widget listo.

## Autorización de herramientas

Contexto propuesto: `{organizationId, actorId/serviceIdentity, agentInstanceId, connectionId, conversationId, executionId, configVersion, policyVersion}` construido en backend. Tenant nunca parámetro elegido por LLM. Orden obligatorio:

1. Sesión/servicio activo y organización activa; módulo/plan vigente.
2. Instancia activa, capability asignada y tool implementada en allowlist.
3. Permiso de operación, objeto del tenant, alcance de datos/filas/campos.
4. Validación schema y precondiciones/versiones; consentimiento cuando contacto saliente lo requiere.
5. Presupuesto/límites de ejecución; aprobación válida si riesgo exige.
6. Claim/idempotencia; transacción de efecto local y auditoría. Efecto externo con outbox y reconciliación.
7. Resultado mínimo, redacción y seguimiento. Revocar grant cancela efectos aún no ejecutados.

No “proteger” una tool escribiendo en el prompt “no accedas a otros clientes”. No dar al agente permisos de SUPER_ADMIN ni pasarle cookie de quien lo activó.

## Matriz de políticas inicial

| Operación | Autonomía propuesta | Aprobar / ejecutar / revertir / auditar |
|---|---|---|
| Leer FAQ público asignado | Automática | Grant fuente+tenant; registrar IDs/revisiones, no aprobación cada lectura |
| Leer CRM/pedido/estadística | Solo scope mínimo | Tool de consulta predefinida; impedir SQL libre; traza sin PII innecesaria |
| Respuesta rutinaria por canal | AUTO explícito o borrador humano | Comprobar modo/turno/ventana/conector al enviar; no hay reversión fiable de mensaje entregado; compensación humana |
| Crear/avanzar oportunidad | Política por tenant, inicialmente sugerir | Preview + precondiciones; atomicidad; undo solo si no cambió después |
| Cerrar venta/oportunidad, cancelar cita | Aprobación por rol autorizado | Propuesta inmutable/expiración; ejecutar una vez; compensar sin borrar historia |
| Reservar cita | Confirmación y reglas de disponibilidad | Validar carrera/solapamiento en BD; aprobación no garantiza disponibilidad futura; devolver conflicto |
| Publicar/campaña de Mia | Siempre aprobación humana | Contenido, canal, audiencia y consentimiento ligados a hash; cambio invalida aprobación; no despublicar automático sin política |
| Reembolsar, cobrar, canjear loyalty | Fuera de tools MVP | Integración posterior con permisos y flujos existentes; nunca autorizar por texto |
| Exportar datos/borrar información/cambiar permisos | Admin explícito, fuera de autonomía | Doble control según riesgo y registro; backup/política de retención; no ofrecer eliminación masiva a modelo |

La aprobación guarda quién/cuándo/por qué/qué argumentos exactos y policyVersion. Caduca si cambian datos, destinatario, permisos, tenant o configuración. Acción aprovada no se reintenta a ciegas. Aprobación humana tampoco autoriza violar permisos de objeto.

## Consentimiento y contacto

**C:** el ecosistema dispone de consentimiento y conversión de Customer a contacto. No confundir consentimiento de contacto, términos de loyalty y permiso para campañas. Herramientas salientes deben consultar estado actual del contacto/DNC y restricciones del canal; haber contestado inbound no autoriza campaña. Fuentes a reutilizar: [customer-contacts](../../src/lib/customer-contacts.ts), [webhook POS](../../src/app/api/webhooks/pos/orders/route.ts), [pipeline](../../src/lib/ai-pipeline.ts). **V:** campos y políticas exactos se validan por caso antes de habilitar tool.

## Secretos, trazas y retención

Credenciales en gestor/configuración server existente, referencias en ChannelConnection; no introducir un almacén nuevo sin necesidad. Encriptación en reposo/backup, rotación y egress real son **V**: esquema/variables no demuestran política del VPS. No volcar `.env` ni exports n8n con secretos a docs.

AiUsage preserva metadata contable, no prompts. ExecutionTrace guarda IDs/estado/latencia/errorCode/fuentes y resumen redactado; debug con contenido solo opt-in autorizado, TTL definido y acceso auditado. Evitar console.error de error proveedor sin saneado; message/knowledge/raw webhook contienen PII y requieren clasificación. Retención por tabla acordada, no 30 días arbitrarios ni eliminación de compras/historial solicitado por el negocio. Exportaciones con anti-formula CSV existente y permisos.

## Operación e incidentes

Feature flag por tenant/instancia/conexión; kill switch detiene efectos nuevos, conserva Inbox/CRM/POS manual. Dashboard interno: cola pendiente/edad máxima, ejecuciones sin cierre, duplicados suprimidos, mensajes fallidos/ambiguos, presupuesto reservado/vencido, handoffs sin asignar, cambios de permisos, drift de configuración.

Incidente: pausar instancia/conexión afectada → preservar eventos/auditoría → identificar tenant/impacto → conciliar envíos/costos → corregir en staging → reanudar piloto. No borrar clientes, rehacer semillas ni restaurar producción indiscriminadamente. Rotación de credencial no es sinónimo de reproducir eventos sin dedup.

**Gate:** no multiagentes con writes antes de cerrar H01/H02/H03/H04/H05/H06/H08 y verificar n8n del canal piloto. Modelo no es control de seguridad; pruebas negativas obligatorias.

## Controles implementados en Fase 0

[Documento 12](12_IMPLEMENTACION_FASE_0.md) registra guardias server-side, IDs/cursor/borrador con scope, claims/leases, bloqueo de admisión contra toma humana, trabajo durable y tratamiento de envíos inciertos. Los grants/Tool Registry/modelo multiagente de este documento siguen siendo propuestas. La alerta por correo mantiene el servicio best-effort actual; estado y auditoría son durables.

## Controles locales de Fase 3

[15](15_IMPLEMENTACION_FASE_3.md) añade RBAC/CAS y FKs por cuenta, HMAC estricto, generación/secuencia/frescura, propiedad verificada única entre tenants, lock de pausa/admisión, aislamiento del hilo y callbacks v1 monotónicos. El conector sigue siendo la frontera confiable que debe verificar al proveedor. Especificación en [contrato v1](../crm/CANAL-CONEXIONES-V1.md); firma/scopes/ventanas reales y despliegue de n8n siguen pendientes del sandbox.


## Seguimiento de Fase 4

Los nuevos controles exigen gestión de conocimiento, módulo y organización activa; FKs compuestas evitan asignaciones cruzadas. La publicación/grants/política usan CAS y bloqueo; la respuesta automática revalida la versión después de inferencia y antes de envío. AuditLog registra referencias/hash, no contenido. La revisión humana de PII sigue pendiente de política operativa. Ver [16_IMPLEMENTACION_FASE_4.md](16_IMPLEMENTACION_FASE_4.md).
