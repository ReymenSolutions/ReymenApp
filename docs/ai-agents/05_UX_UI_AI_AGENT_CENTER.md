# 05 — UX/UI de AI Agent Center

**I — wireframes y especificación, no interfaz implementada.** C: componentes/tokens existentes en [globals.css](../../src/app/globals.css), [UI](../../src/components/ui), [PortalSectionTabs](../../src/components/portal/PortalSectionTabs.tsx), [RulebookEditor](../../src/components/portal/RulebookEditor.tsx). Conservar identidad brand azul/slate, modo claro/oscuro y componentes Radix; no añadir framework visual.

## Navegación y lenguaje

Overview / My Agents / Channels / Knowledge Base / Playground / Usage & Analytics. En español: Resumen / Mis agentes / Canales / Conocimiento / Probar / Uso y resultados. Workflows se incorpora después de demostrar dos flujos reales reutilizables; no tab vacío en MVP.

Escribir para personas no técnicas: “Cómo responde”, “Qué puede hacer”, “Información que puede consultar”, “Cuándo te pide ayuda”. Configuración avanzada para administradores muestra instrucciones/modelos/políticas sin trasladar seguridad al prompt. Explicar que canal es por dónde escribe el cliente y agente es quien atiende; contacto CRM continúa siendo la persona con su historial, no otra ficha duplicada.

## Wireframe de resumen — escritorio

```text
AI Agent Center                         [Probar asistente]
Resumen | Mis agentes | Canales | Conocimiento | Probar | Uso

[ Conversaciones atendidas: 42 ] [ Esperan a tu equipo: 3 ]
[ Capacidad del ciclo: 31 % — renueva 20 nov               ]

Tu asistente                    Canales
Sofía · Comunicación (Mark)      WhatsApp · Conexión verificada
Sugiere respuestas              Instagram · Sin conectar
[Configurar] [Ver actividad]     [Administrar canales]

Necesita atención
• Una respuesta no pudo enviarse [Ver conversación]
• Revisa las reglas antes de activar respuestas automáticas

Actividad reciente (5)                          [Ver toda]
```

Cifras ilustrativas, nunca datos reales de producción. “Operativo” requiere evidencia de conexión/heartbeat; sin ella “Sin actividad verificada”. No usar cero errores como prueba de salud. Métricas definen canal/periodo y distinguen atendida, resuelta, enviada y entregada.

## Mis agentes y perfil

```text
Mis agentes                       [Explorar disponibles]
Activos (1)    Disponibles
[Sofía - Mark / Comunicación  | Sugiere | Configurar]
[Alex / Ventas                | Disponible | Ver funciones]
```

Catálogo muestra qué incluye el plan, capacidades, dependencias y permisos. Activación de 3 pasos: elegir función → configurar nombre/fuentes → revisar canales y efectos. Al final resumen explícito “Puede consultar X; necesita tu aprobación para Y; usará estos canales”. Por defecto sugerir; AUTO separado y confirmado.

```text
Sofía                           [Pausar] [Probar]
Mark · Comunicación             Estado: Sugiere respuestas
General | Conocimiento | Capacidades | Canales | Actividad

Nombre que verá tu cliente [Sofía                         ]
Cómo responde            [Cercano ▼] [Breve ▼]
Saludo                   [Hola, ¿en qué te ayudo?         ]
Si no sabe una respuesta [Pasa a mi equipo ▼]
[Ver configuración avanzada]
                                      [Guardar cambios]
```

Perfil incluye identidad interna/publicName, especialidad/descripcion/estado, personalidad e instrucciones; permisos/capabilities, asignaciones KB, canales/delegación, horarios y humano, rendimiento/ejecuciones. Mostrar solo secciones soportadas; no fingir agenda, herramientas o especialistas operativos. “Ver actividad” abre historial paginado, detalle lateral con estado y resultado, sin prompts/PII excesiva.

## Canales

```text
WhatsApp · +52 …                 [Administrar conexión]
Conexión: Verificada hace 3 min  Atención: Sugiere respuestas
Agente principal: [Sofía ▼]      Ventas: [Alex ▼ / Sin asignar]
Fuera de horario: [Equipo / Aviso configurado ▼]
[Guardar reglas]
```

Número/cuenta se edita aquí, no en perfil exclusivo de Mark. Separar cuatro dimensiones: conexión, modo de atención, agente responsable y presupuesto. Estados: Sin conectar / Validando / Conectado / Requiere reconectar / Pausado. Un modo AUTO no prueba que canal esté conectado. Enquiries se presenta “Consultas de formularios” y explica cómo se responderá según datos y consentimiento, no burbuja de chat obligatoria.

Cambiar conexión/routing muestra impacto sin borrar historial. Si falta OAuth/scope/conector, botón “Revisar conexión” con pasos concretos; no mostrar token, variable de entorno o detalles n8n al cliente final. Información técnica solo para operador autorizado.

## Conocimiento

Lista compacta con búsqueda/filtro/categoría, 10–20 filas/página, no cientos de tarjetas abiertas. Cada fila: título, revisión publicada, última actualización, agentes autorizados, estado y menú accesible Editar/Desactivar/Historial. Reusar un artículo marcando agentes autorizados; no duplicar documento. MVP mantiene artículos de texto; carga de archivos no aparece como disponible si no hay extracción segura.

“Reglas del negocio” comunes y “Instrucciones de Sofía” específicas se diferencian visualmente. Al editar una fuente compartida: “Este cambio afectará a 2 agentes” y publicar revisión. Preview indica qué fuentes fueron recuperadas y por qué, sin afirmar que todo artículo se leyó. Avisar truncado/ausencia y no esconder información importante al usuario.

## Playground

```text
Probar [Sofía ▼] [WhatsApp ▼] [Simulación segura ▼]
Prueba individual | Canal | Flujo entre agentes

Mensaje de ejemplo [¿Tienen citas mañana?                ]
[Ejecutar prueba]       No enviará mensajes ni cambiará datos

Respuesta / Necesita aprobación / Pasa al equipo
[Ver pasos] [Fuentes consultadas] [Consumo de esta prueba]
```

Modo por defecto mock/read-only: sin escribir CRM, canjear, reservar o enviar. Modo proveedor real explícito informa gasto antes de usarlo y lo registra como prueba. Tres modalidades: instancia individual; simulación de reglas de canal/delivery; workflow con límites/derivación y herramientas simuladas. “Reiniciar” cancela/ignora generación anterior por execution/session ID, no solo borra pantalla. Guardar caso opcional con PII redactada y versión exacta. Semáforo no equivale a certificación; mostrar criterios y fallos.

## Uso y resultados

Cliente ve periodo, agentes/canales, conversaciones únicas, solicitudes, errores/tiempo de respuesta, capacidad y renovación; detalle técnico de tokens/modelos según rol/producto acordado. Costos internos/proveedor no se filtran a CLIENT por añadir gráfico. Admin conserva tarifa/FX/estimado/confirmado/desconocido y precio comercial separado. No sumar conversaciones por agente para total del tenant. Historial en paginación/cursor y filtros, conservar todos los datos.

Solicitud de capacidad muestra revisión pendiente y no simula compra. Reutilizar Request existente; confirmación explica “No se ha realizado ningún cargo”.

## Especificación reutilizable de componentes

| Componente propuesto | Props/contrato y estados | Reutiliza |
|---|---|---|
| AgentCard | Identidad/estado/capacidad; sin control para rol sin permiso; activar/configurar | Card/Badge/Button |
| ConnectionStatus | estado real + checkedAt + acción de recuperación; no confundir con AUTO | Badge/StatusBadge |
| CapabilityList | permitido/solo lectura/requiere aprobación/no disponible y motivo | Switch/Label/Dialog existentes |
| KnowledgeAssignmentPicker | búsqueda, selección paginada, revisions; error conserva elección | Input/Dialog |
| ExecutionTimeline | pasos, latencia, humano, fuente y efecto; PII redactada | Card/Badge/ScrollArea |
| ApprovalPanel | propuesta legible, destinatario/efecto, expiración, confirmar/cancelar | Dialog/Button con foco |
| ResponsiveMetricGrid | n columnas según ancho; último ítem solitario ocupa fila completa | MetricCard + utilidades grid |
| DataState | loading skeleton, success, empty con próximo paso, error con reintento | EmptyState y skeleton existente |

## Móvil y accesibilidad

- Layout fluido, `min-width:0`, padding proporcional (`clamp` como especificación), números tabulares; no alturas fijas de página. Dos columnas de métricas cuando cada tarjeta conserva ancho mínimo legible, una en pantallas muy estrechas.
- **Ítem solitario:** reutilizable para cualquier número de columnas. Ejemplo n=5, columnas=2 → filas 2/2/1, el último abarca 2; columnas=3 → 3/2, no agrandar arbitrariamente uno de dos. Calcular resto por breakpoint (o reglas CSS equivalentes), no `:last-child` a ciegas. Probar n=1…9 en 1/2/3/4 columnas. Ningún scroll horizontal de página.
- Tabs móviles pueden usar navegación con wrap o selector “Sección”; si se permite scroll de tabs, es contenido intencional con indicación visible, nunca overflow global accidental.
- Drawer detalle 100% ancho pequeño, scroll interno con altura dinámica de viewport y teclado; foco visible, cierre accesible, botón guardar alcanzable. Respetar safe-area y reduced-motion; no flash blanco al cargar tema.
- Touch targets ≥44px; texto de formulario ≥16px en iOS; iconos normalizados 16/20px con texto/nombre accesible; no color como única señal.
- Label y aria-describedby en campos; errores asociados, aria-busy/polite en carga; tabs con aria-current; radio keyboard completo; confirmación Radix con foco/escape/restauración.
- ES/EN con longitudes variables y pluralización; no cortar nombre, importes o mensajes críticos; títulos de cards permiten wrap.

## Cuatro estados por pantalla

| Pantalla | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Overview | skeleton de métricas y actividad | “Conecta un canal para comenzar” | Datos no disponibles, reintentar | Métricas con periodo/fuente |
| My Agents | cards skeleton | Activar primer agente | Fallo al cargar, sin perder configuración | Activos/disponibles claramente distintos |
| Channels | filas skeleton | Sin conectar | Reconectar/ver incidencia | Estado verificado con fecha |
| Knowledge | filas skeleton | Crear primer artículo | Texto editado conservado | Publicado/revisión/agentes afectados |
| Playground | progreso/tiempo y cancelar | Caso de ejemplo | Reintentar con misma clave cuando aplique | Respuesta/derivación y pasos |
| Usage | gráficos skeleton | Sin consumo en periodo | No mostrar cero si falla consulta | Cifras conciliables y etiquetas de costo |

**V:** estas propuestas requieren prototipo/navegador, dispositivos 320/360/390/768/1280, teclado virtual, lector, contraste claro/oscuro y zoom 200%. No se implementaron componentes ni se generaron screenshots ficticios.
