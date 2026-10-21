# 18 — Publicación y siguiente piloto recomendado

Fecha: 21 de octubre de 2026. Esta entrega publica el trabajo acumulado de Fases 0–4 y el inicio simulado de Fase 5. No activa Mark real, no despliega el VPS ni configura un proveedor. Las siguientes decisiones son recomendaciones, no ajustes ya aplicados a un negocio.

## 1. Publicación e integración

La rama `codex/ai-center-phase5-mark-sandbox` incorpora `origin/main` en `a79990d`, incluidas las mejoras recientes de Realty, SmartCard y API pública. Los tres conflictos de integración fueron adiciones independientes en `.env.example`, esquema Prisma y traducciones; se conservaron ambas partes. El PR conserva los commits de cada fase para revisar su historia.

El CI comprueba tres escenarios independientes: interfaz legacy con flags apagados, centro con flags encendidos y rollback independiente de conexiones/conocimiento/Mark. Así las pruebas de la interfaz nueva no se ejecutan accidentalmente contra una interfaz desactivada. Las migraciones solo se ejecutan sobre PostgreSQL desechable de CI.

Validación posterior a integrar main: **210 archivos / 1484 pruebas aprobadas** (528.99 s), TypeScript y build local correctos; lint con 0 errores y 51 advertencias existentes. Las 84 migraciones se aplicaron desde cero en una BD sintética. En GitHub pasaron lint/tipos/pruebas/build sobre Node 22, el navegador del centro habilitado y rollback independiente. El estado final del navegador legacy debe comprobarse en el PR. Los resultados anteriores de [Fase 5](17_INICIO_FASE_5_MARK.md) corresponden al código previo a incorporar main y se conservan como evidencia histórica.

## 2. Cómo llevar el código al VPS

El script existente `deploy/update.sh` actualiza exclusivamente desde `main`, construye la imagen, consulta migraciones pendientes, respalda la BD antes de migrar y comprueba `/api/health`. Publicar la rama o crear el PR no cambia lo instalado en el VPS.

Antes de ejecutar el comando: integrar el PR en `main` después de revisar CI; validar una copia reciente de la BD del servidor con las migraciones pendientes; conservar respaldo externo y ensayo de restauración. Esta entrega integra 84 migraciones en total, no significa que el servidor tenga 84 pendientes. No usar seeds, reset, `db push` ni restaurar una BD vieja como parte de la actualización.

Con el PR integrado y esa validación completada, en la ruta del VPS identificada en esta conversación:

```sh
sudo bash /home/emilianorm/reymen-ai-ops-preview/deploy/update.sh
```

Ese comando actualiza **ReymenApp**; no actualiza ReymenPOS. No se ejecutó durante esta publicación.

Mantener inicialmente apagados los cinco flags nuevos (también en el compose si sobrescribe `.env`):

```dotenv
AI_AGENT_MODEL_ENABLED=false
AI_AGENT_CENTER_UI_ENABLED=false
AI_CHANNEL_CONNECTIONS_ENABLED=false
AI_KNOWLEDGE_ACCESS_ENABLED=false
AI_MARK_SANDBOX_ENABLED=false
```

Esto permite instalar el código preservando los modos comerciales legacy configurados; no apaga el asistente anterior. La Fase 0 sí introduce correcciones de permisos y recuperación independientemente de estos flags. Para revisar solo la interfaz y simulación después del ensayo, pueden habilitarse UI y sandbox; el sandbox sigue siendo ficticio. Observar el modelo, vincular cuentas reales o cambiar el lector de conocimiento requiere sus pasos específicos de revisión por organización. Ver [12](12_IMPLEMENTACION_FASE_0.md), [13](13_IMPLEMENTACION_FASE_1.md), [15](15_IMPLEMENTACION_FASE_3.md), [16](16_IMPLEMENTACION_FASE_4.md) y [17](17_INICIO_FASE_5_MARK.md).

Rollback preferido: apagar el flag afectado conservando datos y esquema. Las correcciones de Fase 0 requieren su procedimiento específico; los flags no las revierten. No hacer down/drop. Un binario anterior a conexiones no entiende hilos vinculados; no sustituirlo sin drenar/aislar esas cuentas.

## 3. Canal recomendado

Empezar con **Website Chat privado en staging**, una organización de prueba y participantes internos. Primero respuestas simuladas; luego inferencia real en modo Sugerir y revisión humana. WhatsApp sería el segundo piloto con número de prueba, después de verificar credenciales, propiedad, entrega, deduplicación y ventanas del proveedor.

Motivo: permite repetir pruebas y controlar sesiones/turnos sin exponer de inmediato respuestas en el número comercial. El chat público que llegó de main conserva su ruta legacy; **no está conectado automáticamente a Mark ni queda certificado por estas pruebas**. El primer piloto no debe habilitar Mark en `reymen.mx` ni cambiar ese endpoint sin validar control humano, sesión y presupuesto. Website Chat tampoco sustituye una prueba externa del conector WhatsApp/n8n: esa aceptación sigue pendiente.

## 4. Presupuesto propuesto

El propietario autorizó continuar estas propuestas y ajustó el límite diario a $25 MXN. Para una primera organización, el techo acordado es **$500 MXN por mes, $25 MXN por día y $1 MXN por turno raíz**, sujeto a comprobar tarifas y tamaño real de contexto antes de adoptarlo. Son límites de costo interno, no precios ni estimaciones de cuántas respuestas compran. Si la reserva del peor caso de dos llamadas excede el límite del turno, bloquear y pasar a humano; no llamar de todas formas.

Reutilizar el gateway, reservas y ledger existentes por organización. Ya existen alertas 50/75/90/100 % y bloqueo por presupuesto global. Falta implementar/validar subcuotas de Mark y pruebas, límite diario, atribución por instancia/raíz/paso y conciliación de llamadas inciertas. Reservar antes de inferir, incluir fallback, y no tratar un timeout como consumo cero ni liberar una reserva incierta sin conciliación. El presupuesto de organización manda sobre cualquier subcuota.

Registrar organización, instancia/versión, raíz, paso, canal, modo de prueba/real, proveedor/modelo servido, tokens, tarifa, moneda/tipo de cambio, costo y estado. No duplicar el ledger ni guardar conversaciones en sus metadatos. Separar cuota de evaluación de cuota comercial dentro del mismo control de costos. Llegar al techo deriva a humano y mantiene operativos CRM, Inbox y POS.

## 5. Proveedor y datos autorizados

Usar el proveedor que ya esté contratado y registrado en el gateway (Anthropic/OpenAI), con un modelo explícito, disponible en la cuenta y con tarifa vigente. Evaluar un modelo económico antes de elegir; no asumir que el modelo predeterminado ni sus precios son adecuados para Mark. No cambiar globalmente el proveedor de los asistentes actuales para hacer el piloto.

Conectar primero FAQ publicadas y asignadas de Fase 4. Después permitir lecturas mínimas del CRM únicamente para un cliente cuya identidad esté verificada y vinculada por backend. Un visitante de webchat o un número escrito en el chat no demuestra identidad: sin verificación no se revela historial de compras, teléfono, cumpleaños ni datos de otro cliente. El modelo no elige tenant, customerId, herramientas ni permisos.

Mantener el contrato estricto, citas a fuentes autorizadas y derivación por falta de datos. En el primer piloto no habilitar escrituras de CRM, descuentos, canjes, pagos o acciones arbitrarias. El sandbox ficticio actual debe seguir separado de una prueba facturable con proveedor real y mostrar su costo correctamente.

## 6. Conversaciones y control humano

Reutilizar la infraestructura existente de turno, trabajos durables, canal/cuenta y envío. Revalidar organización, permisos, cuenta, versión de conversación y control humano después de inferencia y justo antes de admitir el envío. Una toma humana o mensaje nuevo invalida la respuesta anterior. Debe haber una sola respuesta final por turno y un solo emisor.

La deduplicación debe abarcar webhook, ejecución, llamada al modelo y admisión/acuse del envío. Ante un resultado de entrega incierto, consultar/reconciliar el recibo antes de reintentar: no prometer exactamente una entrega si el proveedor no permite comprobarla. Probar caída del proceso y recuperación sin volver a enviar ni cobrar el mismo trabajo lógico.

## 7. Criterios propuestos para autorizar el piloto

- Corpus mínimo de 100 preguntas normales y 50 adversariales/errores, con respuestas esperadas revisadas por el negocio; añadir casos reales anonimizados conforme se revisen.
- Cero accesos entre organizaciones/clientes, envíos tras toma humana, escrituras no autorizadas o duplicados en las pruebas de concurrencia y recuperación.
- Al menos 95 % de respuestas correctas en FAQ respondibles; derivación segura cuando no hay una fuente suficiente. Es objetivo de aceptación, no resultado ya obtenido por el simulador.
- Costos atribuibles por turno, reservas concurrentes correctas y bloqueo probado al agotar cada cuota. Las llamadas inciertas no se cuentan como gratuitas.
- Medir latencia y porcentaje de timeout con el proveedor real; conservar inicialmente los límites 4 pasos/2 llamadas/2 lecturas/1 derivación y el deadline del núcleo. Ajustar el plazo solo con evidencia y una revisión del contrato.
- Piloto supervisado de una semana, revisar diariamente fallos/costos y mantener un interruptor por organización/canal. Resolver o acotar el fallo intermitente de actualización de Conocimiento antes del uso comercial.

Orden recomendado: presupuesto/atribución mínima → evaluación de proveedor y conocimiento en staging → sesión/CRM autorizado → conversaciones en Sugerir → piloto supervisado → decisión explícita sobre Automático. No comenzar Alex, delegación ni marketplace con esta publicación.
