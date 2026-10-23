# Mark: Anthropic y conocimiento publicado para revisión privada

## Comportamiento

La ruta `/portal/mark-pilot` permite al OWNER/MANAGER autorizado solicitar un borrador de una sola generación con Anthropic. Se deriva la organización de la sesión y se vuelve a comprobar el rol, actividad del usuario, organización y módulo en base de datos. No recibe IDs de clientes ni permite seleccionar otra organización, herramientas, modelo o instrucciones desde el navegador.

El administrador prepara Mark pausado y asigna explícitamente una versión publicada desde `/admin/ai-pilot`. El lector usa exclusivamente grants de esa instancia y organización: no hereda los del asistente anterior, no lee borradores ni busca directamente clientes/ventas. Requiere política de conocimiento habilitada. Para evitar activar asignaciones legacy al configurar el piloto, no habilita una política desactivada que ya tenga grants habilitados de otros asistentes: exige revisar esa política por su flujo existente.

Cada pregunta exige aceptación de uso ficticio y costo. Se toman como máximo cuatro fragmentos publicados de 1200 caracteres cada uno, consulta de 500 caracteres y respuesta de hasta 512 tokens. Sin fuentes coincidentes se solicita atención humana sin llamar al proveedor ni reservar presupuesto. El contenido de fuentes se presenta como datos no confiables; no se afirma que eso elimine el riesgo de prompt injection. El resultado requiere revisión humana y se presenta como texto, sin HTML ejecutable, herramientas ni botón de envío.

## Presupuesto, permisos e idempotencia

Usa las reservas y ledger de 21: 25 MXN diarios, 500 por ciclo y 1 por turno, sujetos también al presupuesto general. Una raíz admite un solo paso para este formulario. La misma llave no repite una generación ya iniciada o cerrada; un doble envío concurrente permite una sola admisión. La pantalla deshabilita el envío y requiere preparar explícitamente otra prueba tras un resultado o error. No recupera una respuesta perdida cobrando otra llamada.

Las fuentes se leen bajo su lock y versión, se revalidan en la admisión financiera y antes de entregar el borrador a la pantalla. Revocar una fuente durante la generación oculta el resultado tardío, pero registra el costo del trabajo ya autorizado. La admisión es el punto de autorización del envío de texto al proveedor; una revocación posterior no puede retirar datos ya enviados a Anthropic. El servicio no mantiene locks de base durante la petición HTTP.

El provider no reintenta ni cambia de modelo. Una llamada incierta conserva su reserva y pausa admisión para revisión administrativa. Fallos previos al despacho pueden cerrar la raíz sin gasto; no se libera una llamada de costo desconocido. No se almacenan preguntas/respuestas en el ledger ni se crean conversaciones. El hash de entrada no anonimiza el contenido. Solo se permite información ficticia en esta etapa, con confirmación explícita; esa confirmación es una responsabilidad del operador y no un detector automático de datos personales.

## Red y credenciales

El staging predeterminado continúa aislado y simulado. El archivo optativo `docker/docker-compose.staging-review.yml` añade únicamente variables del driver al servicio app y un listener privado 8081 en el ingress existente. No conecta app a la red exterior ni crea broker, base o microservicio.

Ese listener no publica otro puerto del host. Permite solo POST `/v1/messages` a `https://api.anthropic.com/v1/messages` y GET `/fx` a la consulta fija USD/MXN de Frankfurter. Verifica TLS, desactiva reintentos de upstream y logs del proxy privado; otros métodos/rutas se rechazan. No permite CONNECT ni un host arbitrario. El SDK solo acepta la URL interna exacta `http://ingress:8081`, exclusivamente en staging; sin ella conserva el endpoint oficial directo.

El tipo de cambio se consulta antes de reclamar un paso y queda fijado en el registro. Sin FX válido o tarifa no se llama a Anthropic. El precio por tokens y conversión son estimaciones, no una conciliación de factura. El precio configurado por el operador debe corresponder a su contrato y al modelo exacto.

`configure-review.sh` pide modelo y clave en la terminal, oculta la clave, usa permisos 600 y lock, y rechaza sobrescribir configuración existente. No activa servicios. La clave no entra al repositorio, contexto de build, argumentos del comando ni al servicio tools. `check-provider.py` hace únicamente GET del modelo al host oficial con TLS, sin redirecciones ni proxy de entorno; muestra identificador/estado, nunca clave ni cuerpo de error del proveedor. No genera texto. Un identificador no disponible o un alias que devuelve otro ID debe resolverse antes de activar pruebas; también se debe corregir su tarifa.

## Validación operativa en staging

Solo después de CI aprobado y código integrado:

1. Actualizar checkout, ejecutar `bash deploy/staging/run.sh build`, `database` y `migrate` conservando la misma base/volumen. Este incremento no agrega migraciones; main incorporó dos migraciones de Lealtad que se validaron solo en la base sintética local (89 en total). No aplicar estas instrucciones a producción.
2. Con permisos sobre `.env.staging` (usar `sudo` si se creó como root): `bash deploy/staging/configure-review.sh`. Introducir el ID exacto y pegar la clave en la terminal privada. No compartir `.env.staging`, `docker inspect` de entorno ni `docker compose config` renderizado.
3. Con los mismos permisos: `python3 deploy/staging/check-provider.py`. Requerir confirmación del modelo exacto. Si falla, no activar el overlay ni probar generación.
4. `bash deploy/staging/review.sh start`; comprobar `/api/health`. Este paso habilita infraestructura, no la política presupuestaria del negocio ni canales.
5. OWNER de **Reymen Piloto**: crear artículos con horarios/precios ficticios en `/portal/knowledge-base`, revisar y publicar su versión con los controles existentes. No cargar datos reales.
6. Superadmin: `/admin/ai-pilot`, seleccionar **Reymen Piloto**, asignar cada versión publicada a Mark y revisar tarifa/presupuesto. Aceptar el costo y habilitar admisión de pruebas privadas. No ampliar el presupuesto general sin una decisión explícita si resulta insuficiente.
7. OWNER: `/portal/mark-pilot`, preguntar por el horario publicado, confirmar información ficticia y costo, y ejecutar una sola prueba. Revisar texto, fuentes/versiones y costo estimado; comprobar atribución por Mark/instancia/paso en el ledger. No afirmar calidad real sin observar esta ejecución.
8. Probar pregunta sin fuente, datos de compras y petición de humano. No debe inventar compras ni acciones. Para casos con fuente, la calidad/handoff sigue siendo una propiedad del modelo que requiere evaluación humana.
9. Si hay error incierto, detener pruebas y conciliar con comprobante en el panel administrativo. No reintentar para recuperar la misma respuesta. No declarar gratuito un timeout.

Los pasos que usan la clave y cualquier generación real los realiza el operador; esta implementación no ejecuta llamadas pagadas ni modifica el VPS.

## Rollback

Pausar admisión en `/admin/ai-pilot`. Ejecutar `bash deploy/staging/run.sh start` para recrear app/ingress sin overlay: desaparece el listener privado y se apagan los flags de revisión/gateway/presupuesto. Las credenciales pueden conservarse privadas o revocarse desde Anthropic si corresponde; nunca se imprimen para diagnóstico.

Conservar reservas, usos, auditoría, fuentes y base. No ejecutar reset, bootstrap, `down -v` ni borrar registros. Para un rollback del binario, detener solo app/ingress, cambiar a la versión anterior compatible con los compromisos existentes, reconstruir e iniciar. No hay migración que revertir.

## Evidencia y límites

Validación del 23 de octubre de 2026, tras integrar `main` en `35932d1`:

- Suite completa: **219 archivos, 1551 pruebas aprobadas**, con dos workers y base local sintética. Incluye FX restringido, concurrencia, permisos, fuente revocada durante generación, costo incierto y ausencia de consultas CRM/envíos.
- Typecheck y build de producción: aprobados. Lint: cero errores y 51 advertencias existentes.
- Chromium sobre ese build: tres casos aprobados con staging/revisión habilitados (preparación, fuente publicada, ausencia de cargo sin coincidencias, permisos y móvil); dos aprobados con staging/revisión apagados (ambas pantallas no disponibles). Los casos del entorno contrario se omiten expresamente en cada ejecución; CI ejecuta ambos escenarios.
- Scripts de aislamiento y secretos: cinco comprobaciones aprobadas; sintaxis Bash correcta. Credenciales ficticias y metadatos simulados, sin llamada al proveedor.
- Las 89 migraciones de main se aplicaron correctamente a la base sintética. No se ejecutaron migraciones en el VPS.
- CI añade el roundtrip de overlay con clave ficticia: ruta/método no permitidos rechazados y listener privado inaccesible después de regresar al staging aislado. Ese smoke depende del resultado de GitHub; no se presenta como ejecutado localmente.

Las pruebas del driver simulan Anthropic; no prueban disponibilidad de `claude-sonnet-5-5` ni facturación real. La interfaz privada nueva está en español. La primera prueba pagada debe validar el modelo, su precio contratado y la respuesta con el operador.

Se mantiene pendiente la primera ejecución pagada revisada, evaluación de calidad/latencia/costo real, retención para datos reales, CRM con identidad final verificada, integración a conversaciones con control humano/cancelación y piloto de canal. No hay autorización de despliegue productivo, envío al cliente ni agentes adicionales. El incremento deja explícitamente separados el laboratorio simulado, el driver de revisión pagada y la futura entrega a conversaciones.
