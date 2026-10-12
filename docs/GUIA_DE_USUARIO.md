# Reymen Solutions — Guía de Usuario

> **Versión del documento:** 1.3 | **Fecha:** Septiembre 2026 (actualizado con categorías y modificadores de menú, conexión con POS externo, cancelaciones y llave de solo lectura para POS, módulos Food y SmartCard, y gestión de usuarios)  
> **Idioma:** Español | **Aplicable a:** Portal de Clientes y Panel de Administración

---

## Tabla de Contenidos

### Sección A — Guía del Cliente (Portal)
1. [¿Qué es la plataforma?](#1-qué-es-la-plataforma)
2. [Cómo iniciar sesión](#2-cómo-iniciar-sesión)
3. [Onboarding: primeros pasos](#3-onboarding-primeros-pasos)
4. [Dashboard](#4-dashboard)
5. [Módulo de Leads](#5-módulo-de-leads)
6. [Automatizaciones](#6-automatizaciones)
7. [WhatsApp AI](#7-whatsapp-ai)
8. [Base de Conocimiento](#8-base-de-conocimiento)
9. [Instrucciones del Agente IA](#9-instrucciones-del-agente-ia-antes-prompts)
10. [Conversaciones](#10-conversaciones)
11. [Templates](#11-templates)
12. [Citas](#12-citas)
13. [Reportes](#13-reportes)
14. [Solicitudes](#14-solicitudes)
15. [Configuración](#15-configuración)
16. [Módulo de Food (Restaurantes)](#16-módulo-de-food-restaurantes)
17. [SmartCard](#17-smartcard)

### Sección B — Guía del Administrador (Panel Admin)
18. [Acceso al Panel Admin](#18-acceso-al-panel-admin)
19. [Dashboard Admin](#19-dashboard-admin)
20. [Gestión de Clientes](#20-gestión-de-clientes)
21. [Gestión de Usuarios](#21-gestión-de-usuarios)
22. [Automatizaciones Globales](#22-automatizaciones-globales)
23. [Conversaciones Escaladas](#23-conversaciones-escaladas)
24. [Solicitudes de Clientes](#24-solicitudes-de-clientes)
25. [Métricas Globales](#25-métricas-globales)
26. [Templates (Admin)](#26-templates-admin)
27. [Auditoría](#27-auditoría)
28. [API Docs](#28-api-docs)
29. [Configuración del Sistema](#29-configuración-del-sistema)

---

# SECCIÓN A — GUÍA DEL CLIENTE (Portal de Clientes)

---

## 1. ¿Qué es la Plataforma?

**Reymen Solutions** es un sistema de operaciones con inteligencia artificial diseñado para que negocios de cualquier industria puedan automatizar sus procesos de ventas, atención al cliente y seguimiento de prospectos desde un solo lugar.

### ¿Para qué sirve?

La plataforma centraliza en un único portal:

- **CRM de Leads:** gestión completa del ciclo de vida de tus prospectos, desde el primer contacto hasta el cierre.
- **Asistente de WhatsApp con IA:** un chatbot entrenado con tu información que responde 24/7, califica prospectos y agenda citas automáticamente.
- **Automatizaciones n8n:** flujos de trabajo inteligentes que conectan tu negocio con WhatsApp, calendarios, correo y otras herramientas.
- **Base de Conocimiento:** el repositorio de información que alimenta a tu asistente de IA.
- **Conversaciones:** historial completo de todas las interacciones de tus clientes con el asistente.
- **Reportes y KPIs:** métricas en tiempo real para tomar decisiones basadas en datos.

### Principio de privacidad

Los flujos de automatización (n8n) se ejecutan de forma completamente transparente en segundo plano. Como usuario del portal, **nunca verás URLs, tokens ni detalles técnicos** de las integraciones; solo verás los resultados: leads capturados, citas agendadas, conversaciones respondidas.

### ¿Quién usa la plataforma?

| Rol | Descripción |
|-----|-------------|
| OWNER | Propietario de la organización, acceso total al portal |
| MANAGER | Gerente, puede gestionar leads, conocimiento y prompts |
| AGENT | Agente de ventas/atención, puede ver y actualizar leads |
| VIEWER | Solo lectura, puede ver reportes y conversaciones |

---

## 2. Cómo Iniciar Sesión

### URL de acceso

Ingresa a tu plataforma en la URL que te proporcionó Reymen (por ejemplo: `https://app.reymen.io`).

### Página de Login

1. Abre la URL en tu navegador.
2. Verás la pantalla de inicio de sesión con dos campos:
   - **Email:** tu correo electrónico registrado.
   - **Contraseña:** la contraseña que te fue asignada o que estableciste.
3. Haz clic en el botón **"Iniciar sesión"**.

### Credenciales de demostración

Si estás en el entorno de pruebas, puedes usar:

| Tipo | Email | Contraseña |
|------|-------|------------|
| Cliente (Owner) | `carlos@clinicasanrafael.com` | `client123456` |

> **Importante:** Cambia tu contraseña en la primera sesión. Si olvidaste tu contraseña, contacta a tu administrador de Reymen.

### ¿Qué pasa después de iniciar sesión?

El sistema detecta tu rol automáticamente:

- Si eres **OWNER, MANAGER, AGENT o VIEWER** → serás redirigido al **Portal** (`/portal/dashboard`).
- Si eres **ADMIN o SUPER_ADMIN** → serás redirigido al **Panel de Administración** (`/admin/dashboard`).

---

## 3. Onboarding: Primeros Pasos

La primera vez que accedes al portal, encontrarás la página de **Onboarding** (`/portal/onboarding`) con una guía de 3 pasos para configurar tu cuenta.

### Paso 1: Configura tu Asistente de WhatsApp

Ve a la sección **WhatsApp AI** desde el menú lateral y completa:

- **Nombre del asistente:** cómo se llamará tu bot (ej. "Ana — Asistente Virtual").
- **Mensaje de bienvenida:** el primer mensaje que verá cada usuario al iniciar una conversación.
- **Personalidad:** una descripción breve del tono y estilo de comunicación del bot.
- **Capacidades:** selecciona las funciones que activará el asistente (agendamiento, FAQ, captura de leads, seguimiento, escalación).

Haz clic en **"Guardar configuración"** y luego activa el interruptor **"Asistente activo"**.

### Paso 2: Crea tu Base de Conocimiento

Ve a **Base de Conocimiento** y añade artículos con la información esencial de tu negocio:

- Horarios de atención
- Servicios y precios
- Preguntas frecuentes
- Políticas y procedimientos

El asistente de IA leerá estos artículos para responder las preguntas de tus clientes con información precisa y actualizada.

### Paso 3: Instala tu Primera Automatización

Ve a la sección **Templates** y explora el marketplace. Encontrarás automatizaciones pre-configuradas para tu industria. Haz clic en **"Instalar"** sobre el template que mejor se ajuste a tu negocio.

Una vez instalada, la automatización aparecerá en la sección **Automatizaciones** con estado **ACTIVE** y comenzará a funcionar de inmediato.

---

## 4. Dashboard

El dashboard es la pantalla principal del portal (`/portal/dashboard`). Muestra un resumen en tiempo real del estado de tu negocio.

### Métricas que verás

| Métrica | Qué significa |
|---------|---------------|
| **Total de Leads** | Número de prospectos capturados (excluye leads eliminados) |
| **Automatizaciones Activas** | Flujos de trabajo en ejecución |
| **Conversaciones Abiertas** | Chats activos sin resolver |
| **Tasa de Conversión** | Porcentaje de leads que llegaron al estado WON vs. total |

### Cómo interpretar los números

- **Leads nuevos esta semana:** si el número sube constantemente, tus canales de captación funcionan bien.
- **Automatizaciones con ERROR:** un número mayor a 0 requiere atención. Ve a la sección de Automatizaciones para revisar el historial de eventos.
- **Conversaciones ESCALADAS:** son chats donde el cliente pidió hablar con un humano. Revísalos de inmediato.

### Acceso rápido

Desde el dashboard puedes navegar directamente a cualquier sección usando el menú lateral izquierdo.

---

## 5. Módulo de Leads

El CRM de leads (`/portal/leads`) es el corazón de la plataforma. Aquí gestionas todos tus prospectos.

### Ver la lista de Leads

La tabla principal muestra todos tus leads activos con las siguientes columnas:

| Columna | Descripción |
|---------|-------------|
| Nombre | Nombre completo del prospecto |
| Email | Correo electrónico (si está disponible) |
| Teléfono | Número de contacto |
| Fuente | De dónde llegó el lead (whatsapp, web, referido, manual) |
| Estado | Etapa actual en el embudo de ventas |
| Score AI | Puntuación de calidad asignada por la IA (0-100) |
| Fecha | Fecha de creación |

### Crear un Lead Manualmente

1. Haz clic en el botón **"Nuevo Lead"** (esquina superior derecha).
2. Completa el formulario:
   - **Nombre** (obligatorio)
   - **Email** (opcional)
   - **Teléfono** (opcional)
   - **Fuente** (de dónde vino el prospecto)
   - **Notas** (información adicional relevante)
3. Haz clic en **"Crear Lead"**.

El lead aparecerá inmediatamente en la tabla con estado **NEW**.

### Buscar y Filtrar

- **Búsqueda por texto:** usa el campo de búsqueda para encontrar leads por nombre, email o teléfono.
- **Filtro por estado:** haz clic en los botones de filtro para ver solo leads en un estado específico (NEW, CONTACTED, etc.).

### Actualizar el Estado de un Lead

El ciclo de vida de un lead sigue este orden recomendado:

```
NEW → CONTACTED → QUALIFIED → PROPOSAL → WON
                                        ↘ LOST
```

Para cambiar el estado:

1. En la tabla de leads, localiza el lead que deseas actualizar.
2. Haz clic en el botón de acciones (ícono de puntos suspensivos o directamente en el selector de estado).
3. Selecciona el nuevo estado del menú desplegable.
4. El cambio se guarda inmediatamente.

| Estado | Significado |
|--------|-------------|
| **NEW** | Lead recién capturado, sin contacto previo |
| **CONTACTED** | Ya se realizó un primer contacto |
| **QUALIFIED** | El lead cumple con el perfil de cliente ideal |
| **PROPOSAL** | Se envió una cotización o propuesta |
| **WON** | Venta cerrada exitosamente |
| **LOST** | El lead no se convirtió en cliente |

### Eliminar un Lead

1. En la fila del lead, haz clic en el botón de eliminar (ícono de papelera).
2. Confirma la acción en el diálogo de confirmación.

> **Nota:** Los leads eliminados no desaparecen permanentemente de la base de datos (soft delete). Se ocultan de tu vista pero el administrador puede auditarlos si es necesario.

### Exportar a CSV

Para exportar toda tu lista de leads a un archivo Excel/CSV:

1. Haz clic en el botón **"Exportar CSV"** en la parte superior de la tabla.
2. El archivo se descargará automáticamente con el nombre `leads-YYYY-MM-DD.csv`.
3. El archivo incluye las columnas: Nombre, Email, Teléfono, Fuente, Estado, Score AI, Notas, Fecha.

> El CSV respeta las reglas de formato estándar (valores con comas se envuelven entre comillas).

### ¿Qué es el Score AI?

El **Score AI** es una puntuación de 0 a 100 que el sistema de inteligencia artificial asigna a cada lead en función de factores como:

- Información de contacto completa
- Comportamiento en la conversación (interés, urgencia)
- Perfil del negocio (tamaño, presupuesto, timeline)
- Fuente de origen del lead

| Rango | Interpretación |
|-------|----------------|
| 80 - 100 | Lead de muy alta calidad. Prioridad máxima |
| 60 - 79 | Lead calificado. Dar seguimiento pronto |
| 40 - 59 | Lead tibio. Nurturing recomendado |
| 0 - 39 | Lead frío o información insuficiente |

Al hacer hover sobre el score, verás la **razón** que explica por qué la IA le dio esa puntuación.

---

## 6. Automatizaciones

Las automatizaciones (`/portal/automations`) son los flujos de trabajo inteligentes que operan tu negocio en segundo plano.

### ¿Qué son las Automatizaciones?

Cada automatización representa un proceso automatizado: captura de leads, agendamiento de citas, seguimiento post-venta, retención de clientes, etc. Están impulsadas por **n8n**, pero como usuario del portal solo ves los resultados y el estado, no los detalles técnicos.

### Estados de una Automatización

| Estado | Color | Significado |
|--------|-------|-------------|
| **ACTIVE** | Verde | Funcionando correctamente |
| **PAUSED** | Amarillo | Detenida temporalmente |
| **ERROR** | Rojo | Se detectó un fallo. Requiere atención |
| **ARCHIVED** | Gris | Desactivada permanentemente |

### Ver la Lista de Automatizaciones

La página principal muestra todas tus automatizaciones con su nombre, tipo, estado y fecha de última actualización.

Si alguna tiene estado **ERROR**, se mostrará de forma destacada para que la atiendas con prioridad. En ese caso, contacta a tu equipo de Reymen a través de la sección **Solicitudes**.

### Ver el Detalle de una Automatización

Haz clic sobre el nombre de cualquier automatización para abrir su página de detalle (`/portal/automations/[id]`). Ahí encontrarás:

- **Información general:** nombre, descripción, tipo, estado.
- **Historial de eventos:** lista cronológica de todas las ejecuciones de este flujo de trabajo.

### Historial de Eventos

Cada vez que una automatización se ejecuta, genera un **evento** con la siguiente información:

| Campo | Descripción |
|-------|-------------|
| Tipo | Qué acción realizó (ej. `lead_captured`, `appointment_created`) |
| Estado | Si fue exitosa (SUCCESS), fallida (FAILED) o pendiente (PENDING) |
| Duración | Cuánto tardó en ejecutarse (en milisegundos) |
| Error | Mensaje de error si la ejecución falló |
| Fecha | Cuándo ocurrió |

> Si ves muchos eventos **FAILED** seguidos, es señal de que la automatización necesita revisión. Crea una Solicitud de soporte.

---

## 7. WhatsApp AI

La sección de WhatsApp AI (`/portal/whatsapp`) te permite configurar y controlar el asistente virtual que atiende a tus clientes en WhatsApp las 24 horas.

### Configurar el Asistente

Haz clic en **"Editar configuración"** para abrir el formulario de configuración:

#### Nombre del Asistente
Es el nombre con el que el bot se presentará ante tus clientes. Elige un nombre que refleje la identidad de tu marca.

**Ejemplo:** `Ana — Asistente de Clínica San Rafael`

#### Mensaje de Bienvenida (Greeting)
El primer mensaje que recibe cada usuario al iniciar una conversación. Debe ser amigable, presentar al asistente y dejar claro qué puede hacer.

**Ejemplo:**
```
¡Hola! Soy Ana, el asistente virtual de Clínica San Rafael. Puedo ayudarte a agendar citas, informarte sobre nuestros servicios y precios. ¿En qué puedo ayudarte hoy?
```

#### Personalidad
Una descripción del tono y estilo de comunicación que debe usar el asistente. Esto alimenta directamente al modelo de IA.

**Ejemplo:**
```
Soy amable, empático y profesional. Hablo en español formal pero accesible. Me dirijo al paciente por su nombre cuando lo conozco. Nunca doy diagnósticos médicos.
```

#### Capacidades
Selecciona las funciones que habilitarás en el asistente:

| Capacidad | Descripción |
|-----------|-------------|
| `appointments` | Puede agendar y consultar citas |
| `faq` | Responde preguntas frecuentes usando la Base de Conocimiento |
| `lead_capture` | Captura datos de nuevos prospectos |
| `follow_up` | Hace seguimiento automático a prospectos |
| `escalation` | Puede transferir la conversación a un agente humano |

#### Número de WhatsApp
El número de teléfono asociado a tu cuenta de WhatsApp Business (para referencia interna).

### Activar/Desactivar el Asistente

En la parte superior de la página verás el interruptor **"Asistente activo"**:

- **Activado (verde):** el asistente responde mensajes de WhatsApp automáticamente.
- **Desactivado (gris):** los mensajes no reciben respuesta automática.

> **Importante:** Desactivar el asistente solo afecta las respuestas automáticas. Los mensajes y conversaciones previos seguirán visibles en la sección Conversaciones.

---

## 8. Base de Conocimiento

La Base de Conocimiento (`/portal/knowledge-base`) es el repositorio de artículos que alimenta a tu asistente de IA. Cuanto más completa y precisa sea, mejor responderá el bot.

### ¿Para qué sirve?

Cuando un cliente hace una pregunta, el asistente busca en tu Base de Conocimiento para dar una respuesta basada en información real de tu negocio, en lugar de respuestas genéricas.

### Ver los Artículos

La página muestra todos tus artículos organizados con:
- Título
- Categoría
- Estado (Activo/Inactivo)
- Tags

### Crear un Artículo

1. Haz clic en **"Nuevo Artículo"**.
2. Completa el formulario:
   - **Título:** nombre descriptivo del artículo (ej. "Horarios de atención").
   - **Categoría:** agrupa el artículo (ej. `general`, `servicios`, `precios`, `citas`).
   - **Tags:** palabras clave separadas por coma (facilitan la búsqueda del bot).
   - **Contenido:** el texto completo del artículo. Sé específico y claro.
3. Haz clic en **"Guardar"**.

**Ejemplo de artículo bien escrito:**
```
Título: Horarios de atención
Categoría: general
Tags: horario, atención, apertura

Contenido:
Atendemos de lunes a viernes de 8:00am a 8:00pm, y sábados de 9:00am a 2:00pm. 
Los domingos y días festivos permanecemos cerrados.
Para urgencias fuera de horario, comunícate al 55 1234 0000.
```

### Editar un Artículo

1. Localiza el artículo en la lista.
2. Haz clic en el ícono de edición (lápiz).
3. Modifica los campos necesarios.
4. Haz clic en **"Guardar"**.

### Activar/Desactivar un Artículo

Si quieres que el asistente deje de usar un artículo temporalmente (sin eliminarlo):

1. Localiza el artículo.
2. Haz clic en el interruptor de estado.
3. El artículo quedará **Inactivo** y el bot ya no lo consultará.

Puedes reactivarlo en cualquier momento siguiendo el mismo proceso.

### Eliminar un Artículo

1. Haz clic en el ícono de eliminar (papelera) junto al artículo.
2. Confirma la acción.

> **Precaución:** La eliminación es permanente. Si no estás seguro, desactiva el artículo en lugar de eliminarlo.

### Categorías recomendadas

| Categoría | Uso sugerido |
|-----------|-------------|
| `general` | Información general del negocio |
| `servicios` | Descripción de productos y servicios |
| `precios` | Costos y tarifas |
| `citas` | Proceso de agendamiento |
| `politicas` | Políticas de cancelación, garantías |
| `faq` | Preguntas frecuentes |

---

## 9. Instrucciones del Agente IA (antes "Prompts")

Los prompts se unificaron: el Agente IA tiene **una sola fuente de instrucciones**, el **Rulebook** y los artículos de la **Base de Conocimiento** (sección 8). Ya no hay pantalla de Prompts; `/portal/prompts` lleva a la Base de Conocimiento.

- Lo que antes era el prompt de **sistema** pasó a "Cómo hablas" y el de **saludo** a "Saludo". Los de calificación, citas, preguntas frecuentes y escalación se copiaron a "Reglas" (solo si esa sección estaba vacía o añadiéndolos al final).
- En **Agente IA → Probador** escribes un mensaje de cliente y ves qué respondería el agente (o por qué pasaría la conversación a una persona), sin enviar nada.
- En **Agente IA** eliges por canal si el agente está **Apagado**, **Sugiere** o responde en **Automático**.

---

## 10. Conversaciones

La sección de Conversaciones (`/portal/conversations`) muestra el historial completo de todos los chats entre tus clientes y el asistente de WhatsApp.

### Estados de una Conversación

| Estado | Descripción |
|--------|-------------|
| **OPEN** | Conversación activa, siendo atendida por el bot |
| **ESCALATED** | El cliente solicitó (o el bot decidió) transferir a un humano |
| **RESOLVED** | Un agente resolvió la situación |
| **CLOSED** | Conversación finalizada |

### Ver la Lista de Conversaciones

La página principal muestra todas las conversaciones con:
- Nombre y teléfono del contacto
- Canal (whatsapp)
- Estado
- Si está siendo manejada por IA o un humano
- Fecha de inicio

Puedes filtrar por estado usando los botones en la parte superior.

### Ver el Detalle de una Conversación

Haz clic sobre cualquier conversación para abrir el hilo completo de mensajes (`/portal/conversations/[id]`).

El historial muestra los mensajes en orden cronológico:
- Mensajes del **usuario** (cliente) aparecen en un estilo diferente
- Mensajes del **asistente** (IA) aparecen marcados con el nombre del bot
- Mensajes de **sistema** (eventos internos como escalaciones) aparecen en gris

### Escalar una Conversación

Si detectas que una conversación OPEN necesita atención humana:

1. Abre el detalle de la conversación.
2. Haz clic en el botón **"Escalar"**.
3. El estado cambia a **ESCALATED** y el asistente deja de responder automáticamente.
4. Un agente puede tomar el control del chat.

> Solo se pueden escalar conversaciones con estado **OPEN**.

### Resolver una Conversación

Una vez que el agente atendió al cliente:

1. Abre el detalle de la conversación.
2. Haz clic en **"Resolver"**.
3. El estado cambia a **RESOLVED** y se registra la hora de resolución.

### Conversaciones ESCALATED que requieren atención urgente

Las conversaciones escaladas aparecen destacadas en la lista. Son clientes que esperan atención humana. Respóndelas tan pronto como sea posible.

---

## 11. Templates

La sección de Templates (`/portal/templates`) es el marketplace donde puedes instalar automatizaciones pre-configuradas para tu industria con un solo clic.

### ¿Qué son los Templates?

Los templates son automatizaciones pre-construidas por el equipo de Reymen para industrias específicas. Incluyen el flujo de trabajo completo; solo necesitas instalarlos y empezarán a funcionar.

### Explorar el Marketplace

La galería muestra todos los templates disponibles con:
- Ícono representativo de la industria
- Nombre y descripción breve
- Industria (clínica, inmobiliaria, gimnasio, legal, taller, e-commerce)
- Categoría (captura de leads, citas, seguimiento, retención)

### Buscar y Filtrar

- **Búsqueda por texto:** escribe en el buscador para filtrar por nombre o descripción.
- **Filtro por industria:** selecciona tu sector para ver solo los templates relevantes.
- **Filtro por categoría:** filtra por tipo de automatización.

### Instalar un Template (1 clic)

1. Encuentra el template que quieres usar.
2. Haz clic en el botón **"Instalar"**.
3. El sistema:
   - Descarga la versión más reciente del template.
   - Crea una nueva Automatización en tu cuenta.
   - La vincula con el flujo de n8n correspondiente.
4. Verás una confirmación de éxito.

La automatización aparecerá inmediatamente en tu sección de **Automatizaciones** con estado **ACTIVE**.

### Desinstalar un Template

Si ya no necesitas una automatización instalada desde templates:

1. En la galería de templates, pasa el cursor sobre el template instalado.
2. Aparecerá el botón **"Desinstalar"** (hover).
3. Haz clic y confirma.
4. La automatización asociada se archivará automáticamente.

> **Nota:** Solo puedes tener una instalación activa por template. Si desinstalas y vuelves a instalar, se crea una nueva automatización.

---

## 12. Citas

La sección de Citas (`/portal/appointments`) muestra todas las citas gestionadas en tu organización, tanto las agendadas por el asistente de IA como las creadas manualmente.

### Ver Próximas y Pasadas Citas

La página muestra dos secciones:
- **Próximas citas:** las que están agendadas para el futuro.
- **Citas pasadas:** historial de citas completadas, canceladas o con no show.

Cada cita muestra:
- Título de la cita
- Fecha y hora de inicio y fin
- Estado actual
- Fuente (si fue creada por IA o manualmente)

### Crear una Cita Manual

1. Haz clic en **"Nueva Cita"**.
2. Completa el formulario:
   - **Título:** nombre descriptivo (ej. "Consulta general — Juan Pérez").
   - **Descripción:** detalles adicionales (opcional).
   - **Fecha y hora de inicio:** selecciona del selector de fecha/hora.
   - **Fecha y hora de fin:** debe ser posterior a la hora de inicio.
3. Haz clic en **"Crear cita"**.

La cita aparece inmediatamente en la lista con estado **SCHEDULED**.

### Estados de una Cita

| Estado | Descripción |
|--------|-------------|
| **SCHEDULED** | Agendada, pendiente de confirmación |
| **CONFIRMED** | Confirmada por el cliente o el equipo |
| **CANCELLED** | Cancelada |
| **COMPLETED** | La cita se realizó exitosamente |
| **NO_SHOW** | El cliente no se presentó |

### Actualizar el Estado de una Cita

1. Localiza la cita en la lista.
2. Haz clic en el selector de estado junto a la cita.
3. Selecciona el nuevo estado.
4. El cambio se guarda automáticamente.

---

## 13. Reportes

La sección de Reportes (`/portal/reports`) ofrece visualizaciones y métricas para entender el rendimiento de tu negocio.

### KPIs Principales

En la parte superior encontrarás las métricas clave:

| KPI | Qué mide |
|-----|----------|
| Total de Leads | Prospectos capturados en el periodo seleccionado |
| Tasa de Conversión | % de leads que llegaron a WON |
| Citas Agendadas | Total de citas creadas |
| Conversaciones Resueltas | Chats atendidos y cerrados satisfactoriamente |

### Gráfica de Tendencia de Leads

La gráfica de línea muestra la evolución de leads capturados en el tiempo. Permite identificar:
- Días o semanas con mayor captación
- El impacto de campañas o acciones específicas
- Tendencias de crecimiento

### Gráfica de Embudo de Ventas

El gráfico de embudo (funnel) muestra cuántos leads hay en cada etapa del ciclo de ventas:

```
NEW (total) → CONTACTED → QUALIFIED → PROPOSAL → WON
```

Esto permite identificar en qué etapa se pierden más oportunidades.

### Gráfica de Salud de Automatizaciones

Un gráfico de barras que muestra el estado de tus automatizaciones: cuántas están activas, con error o archivadas. Te permite detectar rápidamente problemas operativos.

### Simulador de ROI

El simulador de Retorno de Inversión (ROI) te ayuda a calcular el valor que genera la plataforma para tu negocio.

**Cómo usarlo:**

1. Ingresa el **número de leads mensuales** que captura el sistema.
2. Ingresa tu **tasa de conversión** (porcentaje de leads que se convierten en clientes, ej. 15%).
3. Ingresa el **ticket promedio** de venta (valor promedio de cada cliente).
4. Ingresa el **costo mensual** de la plataforma.

El simulador calculará automáticamente:
- **Ingresos estimados:** leads × tasa de conversión × ticket promedio.
- **ROI:** (ingresos − costo) / costo × 100.

**Ejemplo:**
- 100 leads × 15% conversión × $5,000 ticket = $7,500 de ingresos
- Costo: $500/mes
- ROI = (7,500 − 500) / 500 × 100 = **1,400%**

---

## 14. Solicitudes

La sección de Solicitudes (`/portal/requests`) es el canal oficial para comunicarte con el equipo de Reymen cuando necesitas soporte, cambios o nuevas automatizaciones.

### Crear una Solicitud

1. Haz clic en **"Nueva Solicitud"**.
2. Completa el formulario:
   - **Título:** resumen breve del problema o necesidad.
   - **Descripción:** explica con detalle qué necesitas o qué problema estás experimentando (mínimo 10 caracteres).
   - **Tipo:** selecciona el tipo de solicitud.
   - **Prioridad:** indica la urgencia.
3. Haz clic en **"Enviar Solicitud"**.

### Tipos de Solicitud

| Tipo | Cuándo usarlo |
|------|---------------|
| `support` | Reportar un problema técnico o error |
| `new_automation` | Solicitar un flujo de trabajo nuevo |
| `change` | Modificar una automatización existente |
| `question` | Consultas o dudas generales |

### Prioridades

| Prioridad | Descripción |
|-----------|-------------|
| `low` | Sin urgencia, puede atenderse en días |
| `medium` | Normal, atención en 24-48 horas |
| `high` | Urgente, impacta la operación del negocio |

### Seguimiento de Estado

La lista de solicitudes muestra el estado de cada una:

| Estado | Descripción |
|--------|-------------|
| **OPEN** | Recibida, pendiente de asignación |
| **IN_PROGRESS** | El equipo de Reymen está trabajando en ella |
| **RESOLVED** | Se resolvió el problema |
| **CLOSED** | Caso cerrado |

Puedes ver el historial completo de todas tus solicitudes en cualquier momento.

---

## 15. Configuración

La sección de Configuración (`/portal/settings`) centraliza la administración de tu cuenta y equipo.

### Información de la Organización

Puedes ver los datos de tu organización:
- Nombre
- Industria
- Identificador único (slug)

Para cambiar estos datos, contacta al administrador de Reymen.

### Plan Actual y Límites

Verás el plan contratado y los límites de uso:

| Plan | Leads | Usuarios | Automatizaciones |
|------|-------|----------|------------------|
| **Starter** | 500 | 2 | 3 |
| **Professional** | 5,000 | 10 | 15 |
| **Enterprise** | Ilimitado | 99 | 99 |

Si necesitas más capacidad, crea una solicitud de tipo `change` para actualizar tu plan.

### Gestión de Equipo

#### Invitar un Usuario

1. En la sección **"Equipo"**, haz clic en **"Invitar Usuario"**.
2. Completa:
   - **Nombre:** nombre completo del nuevo usuario.
   - **Email:** correo electrónico (será su usuario de acceso).
   - **Rol:** selecciona el nivel de acceso.
   - **Contraseña:** contraseña inicial (el usuario puede cambiarla después).
3. Haz clic en **"Invitar"**.

#### Roles disponibles al invitar

| Rol | Qué puede hacer |
|-----|----------------|
| **MANAGER** | Gestionar leads, automatizaciones (vista), conocimiento, prompts, solicitar soporte, ver reportes |
| **AGENT** | Crear y actualizar leads, ver automatizaciones, gestionar conversaciones, crear solicitudes |
| **VIEWER** | Solo puede actualizar estado de leads, ver automatizaciones y reportes |

> **Nota:** No puedes invitar usuarios con rol OWNER. El OWNER se crea al momento de crear la organización y solo el administrador de Reymen puede modificarlo.

#### Remover un Usuario

1. En la lista de miembros del equipo, localiza al usuario.
2. Haz clic en el botón **"Remover"** junto a su nombre.
3. Confirma la acción.

El usuario quedará desactivado y no podrá iniciar sesión. No se eliminan sus datos históricos.

> **Restricciones:**
> - No puedes removerte a ti mismo.
> - No puedes remover al propietario (OWNER) de la organización.
> - Solo usuarios con permiso `team:manage` (OWNER, MANAGER) pueden invitar/remover usuarios.

---

## 16. Módulo de Food (Restaurantes)

> Solo visible si tu organización tiene el módulo **Food** activo (Reymen lo activa desde el panel admin).

El módulo de Food está pensado para restaurantes: ventas del día, inventario de insumos, proveedores, recetas con costeo real, y un panel de rentabilidad.

### Dashboard de Food (`/portal/food`)

Resumen visual con ventas de hoy, ticket promedio, pedidos, insumos en stock bajo, ventas por hora, y un widget de SmartCard si también tienes ese módulo. Dos bloques ("Platillos más vendidos", "Compras recientes") muestran datos de ejemplo mientras no haya suficiente historial real — están marcados con una etiqueta **"Datos de ejemplo"**, nunca se presentan como reales.

### Ventas (`/portal/food/sales`)

Registra el total en pesos vendido por día (bruto y neto, con canal opcional: mostrador, domicilio, app). Es el registro simple de "cuánto vendí hoy" — no requiere saber qué platillos se vendieron.

### Inventario (`/portal/food/inventory`)

Lista de insumos con unidad, stock actual, mínimo, costo unitario, y categoría (**Comestible** / **No comestible**). Un insumo por debajo de su mínimo se marca como "Stock bajo".

### Proveedores (`/portal/food/suppliers`)

Directorio simple de contactos de proveedores (nombre, contacto, teléfono, email).

### Recetas (`/portal/food/recipes`)

Aquí se arma el menú real:

1. **Crear un platillo**: nombre (ej. "Berry Bloom") + una o más **variantes** — si el platillo no tiene tamaños, deja una sola variante llamada "Único"; si tiene tamaños u opciones (Chico/Grande, Salmón/Pollo), agrega una variante por cada una.
2. **Cada variante tiene su propia receta**: elige los insumos del inventario y la cantidad que usa esa porción. El costo y el margen se calculan solos, en vivo, mientras capturas.
3. **Ventas de hoy por platillo**: un campo de cantidad por cada variante activa — cuántas unidades vendiste hoy de cada una. Guardar de nuevo reemplaza el número (no lo suma), para poder corregir un error de captura.

> Un platillo sin receta capturada muestra costo $0.00 y margen 100% — no es un error, es que todavía no le has agregado insumos.

**Categorías y grupos de modificadores** (en la misma página, debajo de la lista de platillos):

- **Categorías**: agrupa tus platillos (ej. "Bebidas", "Entradas", "Postres"). Créalas con el botón
  "Nueva categoría" y asígnalas a un platillo desde su formulario de edición, en el selector
  "Categoría". Un platillo puede tener una categoría o ninguna. Borrar una categoría no borra sus
  platillos — solo quedan sin categoría.
- **Grupos de modificadores**: opciones que el cliente elige al pedir un platillo (ej. "Término de
  cocción", "Extras"). Cada grupo tiene un mínimo y un máximo de opciones a elegir (0 mínimo =
  opcional, 1 máximo = elección única) y una lista de opciones, cada una con un precio adicional
  opcional. Se asignan a un platillo con los botones de la sección "Grupos de modificadores" en su
  formulario de edición — un platillo puede tener varios grupos asignados. Borrar un grupo lo quita
  de cualquier platillo que lo tuviera.

Ambas cosas alimentan el menú que un punto de venta (POS) externo puede consultar, si tu
organización tiene uno conectado — ver más abajo.

### Rentabilidad (`/portal/food/profitability`)

- **Gastos fijos mensuales**: renta, nómina, servicios — súmalos aquí para que el resto de los cálculos los tome en cuenta.
- **Punto de equilibrio**: cuántas unidades de cada platillo necesitas vender para cubrir tus gastos fijos, por platillo y (si ya tienes historial de ventas) combinado según tu mezcla real de ventas.
- **Utilidad neta**: ingresos − costo de insumos − gastos fijos, con selector de período (Hoy / 7 días / 30 días). Si no todos tus platillos tienen venta registrada en el período, te avisa que el cálculo es parcial.
- **Reducción de costos**: qué platillos dejan menor margen y qué insumos pesan más en el costo total de tu menú.
- **Recomendaciones para mejorar utilidad**: alertas automáticas generadas a partir de margen + volumen de venta real (ej. "se vende mucho pero deja poco margen — considera subir el precio").
- **Promociones recomendadas**: platillos que casi no se venden, para que consideres un descuento o combo.
- **Calculadora de precio recomendado**: elige un platillo (o captura un costo manual) y tu % de costo objetivo — te sugiere el precio de venta ideal.

### Conexión con un punto de venta (POS) externo

Si tu restaurante usa (o va a usar) un punto de venta propio, Reymen puede conectarse con él para
recibir automáticamente las ventas de cada orden, sin que tengas que capturarlas a mano en
"Ventas de hoy por platillo". Contacta a tu proveedor de Reymen para obtener las claves de
conexión de tu organización — hay dos: una que el propio dispositivo del punto de venta usa para
leer tu menú (con categorías y modificadores incluidos), y otra, distinta, que solo debe vivir en
el servidor de quien administra tu punto de venta, para reportar cada orden cerrada (y sus
cancelaciones, si una orden se anula después de reportada). Esto es opcional: mientras no tengas
un POS conectado, todo sigue funcionando igual con captura manual.

---

## 17. SmartCard

> Solo visible si tu organización tiene el módulo **SmartCard** activo.

SmartCard es la tarjeta digital NFC/QR de tu negocio (menú, contacto, ubicación en un solo toque). Vive en un sistema separado (`reymen-smartcard`); el portal te da acceso a ella de dos formas:

- **Estadísticas** (`/portal/smartcard`): escaneos, clics a WhatsApp, y (si aplica) reseñas y clics a ubicación, directamente en el portal — no necesitas salir de aquí para verlas.
- **Panel completo**: un botón te lleva al panel completo de SmartCard ya con tu sesión iniciada automáticamente (no necesitas una segunda contraseña).

---

---

# SECCIÓN B — GUÍA DEL ADMINISTRADOR (Panel de Administración)

---

## 18. Acceso al Panel Admin

El Panel de Administración está diseñado exclusivamente para el equipo interno de Reymen. **Los clientes no tienen acceso a este panel.**

### Requisito de acceso

Solo pueden acceder los usuarios con rol:
- `SUPER_ADMIN`
- `ADMIN`

### URL de acceso

El panel está disponible en `/admin/dashboard`. Si intentas acceder con un rol de cliente, el sistema te redirigirá automáticamente al portal.

### Credenciales de administrador (demo)

| Email | Contraseña | Rol |
|-------|------------|-----|
| `admin@reymen.io` | `admin123456` | SUPER_ADMIN |

> **IMPORTANTE:** Cambia las credenciales de administrador inmediatamente en un entorno de producción.

### Navegación del Panel Admin

El menú lateral del panel incluye:

- Dashboard
- Clientes
- Automatizaciones
- Escalaciones
- Solicitudes
- Métricas
- Templates
- Auditoría
- API Docs
- Configuración

---

## 19. Dashboard Admin

El Dashboard administrativo (`/admin/dashboard`) muestra métricas globales de toda la plataforma.

### Métricas globales

| Métrica | Descripción |
|---------|-------------|
| Total de Organizaciones | Número de clientes activos en la plataforma |
| Total de Leads | Suma de todos los leads de todos los clientes |
| Automatizaciones Activas | Total de automatizaciones funcionando en toda la plataforma |
| Conversaciones Escaladas | Escalaciones pendientes de atención en todos los clientes |

### ¿Para qué sirve?

El dashboard admin te da una visión macro de la salud de la plataforma: si hay muchas automatizaciones con error, muchas escalaciones sin atender, o un crecimiento inusual de algún cliente.

---

## 20. Gestión de Clientes

La sección de Clientes (`/admin/clients`) es donde gestionas todas las organizaciones que usan la plataforma.

### Lista de Clientes

La tabla muestra todos los clientes con:
- Nombre de la organización
- Slug (identificador único)
- Industria
- Plan actual
- Estado (Activo/Inactivo)
- Fecha de creación
- Número de leads y automatizaciones

### Crear un Cliente

1. Haz clic en **"Nuevo Cliente"**.
2. Completa el formulario **Crear Organización + Usuario**:

**Datos de la organización:**
- **Nombre:** razón social o nombre del negocio.
- **Industria:** sector al que pertenece (clinic, real_estate, gym, legal, workshop, ecommerce).

**Datos del usuario propietario (OWNER):**
- **Nombre:** nombre completo del propietario.
- **Email:** correo que usará para iniciar sesión.
- **Contraseña:** contraseña inicial (mínimo 8 caracteres).

3. Haz clic en **"Crear"**.

El sistema creará automáticamente:
- La organización con un slug único basado en el nombre.
- El usuario con rol OWNER vinculado a la organización.

El cliente podrá iniciar sesión de inmediato.

### Ver el Detalle de un Cliente

Haz clic en el nombre de cualquier cliente para abrir su página de detalle (`/admin/clients/[clientId]`). Aquí verás:

- **Información general:** plan, estado, fecha de creación.
- **Equipo:** lista de todos los usuarios de la organización.
- **Automatizaciones:** las automatizaciones instaladas para este cliente.
- **Leads:** resumen de leads.
- **Solicitudes:** solicitudes abiertas del cliente.

### Credenciales de integración (webhooks y POS)

Desde el botón **"Credenciales n8n"** en la página de detalle del cliente puedes ver y rotar:

- **x-reymen-secret**: el secreto que autentica los webhooks de n8n (leads, conversaciones, scoring) de esa organización. Rotarlo invalida el valor anterior de inmediato — hay que actualizarlo también en el workflow de n8n.
- **X-API-KEY (solo lectura, POS)**: solo visible si el cliente tiene el módulo **Food** activo. Es una llave aparte, pensada para que el punto de venta del restaurante lea su menú sin necesitar el secreto que firma órdenes. Haz clic en **"Generar"** la primera vez, o en **"Rotar"** para reemplazarla — en ambos casos, comparte el nuevo valor con quien administre el punto de venta.

### Cambiar el Plan de un Cliente

1. En la página de detalle del cliente, haz clic en **"Cambiar Plan"**.
2. Selecciona el nuevo plan: **Starter**, **Professional** o **Enterprise**.
3. Confirma el cambio.

El cambio aplica inmediatamente y los nuevos límites entran en vigor de inmediato.

| Plan | Límite de Leads | Límite de Usuarios | Límite de Automatizaciones |
|------|-----------------|---------------------|---------------------------|
| Starter | 500 | 2 | 3 |
| Professional | 5,000 | 10 | 15 |
| Enterprise | 99,999 | 99 | 99 |

### Activar/Inactivar un Cliente

En la página de detalle o en la lista de clientes:

1. Haz clic en el interruptor de estado del cliente.
2. Confirma la acción.

**Efecto de inactivar:**
- El cliente no podrá iniciar sesión.
- Los webhooks de n8n rechazarán solicitudes de esa organización.
- Los datos se conservan intactos.

Para reactivar, sigue el mismo proceso.

---

## 21. Gestión de Usuarios

El directorio de usuarios (`/admin/users`) muestra **todos** los usuarios de la plataforma — los que pertenecen a un cliente y los usuarios internos de Reymen sin organización — en un solo lugar, distinto de la pestaña "Equipo" dentro del detalle de cada cliente.

### Usuarios de un cliente específico

Desde la página de detalle de un cliente (§20), en la pestaña **Equipo** puedes:
1. **Agregar un usuario**: nombre, email, rol, contraseña inicial.
2. **Editar** nombre o rol de un usuario existente.
3. **Activar/Desactivar**: un usuario desactivado no puede iniciar sesión, pero sus datos se conservan.

### Usuarios internos (sin organización)

Desde el directorio global (`/admin/users`) puedes además **crear un usuario administrador sin organización** — para el propio equipo de Reymen, no para un cliente. Este tipo de usuario no aparece en ningún cliente y no cuenta contra el límite de usuarios de ningún plan.

Desde el mismo directorio puedes activar/desactivar **cualquier** usuario de la plataforma, sea de un cliente o interno, sin tener que entrar primero al detalle de su organización.

---

## 22. Automatizaciones Globales

La sección de Automatizaciones (`/admin/automations`) muestra **todas las automatizaciones de todos los clientes** en una sola vista.

### ¿Para qué sirve?

Permite identificar rápidamente:
- Clientes con automatizaciones en estado ERROR.
- Distribución de tipos de automatizaciones en la plataforma.
- Automatizaciones inactivas o archivadas que pueden necesitar limpieza.

### Columnas de la tabla

| Columna | Descripción |
|---------|-------------|
| Nombre | Nombre de la automatización |
| Cliente | Organización a la que pertenece |
| Tipo | Categoría del flujo (lead_capture, appointments, etc.) |
| Estado | ACTIVE / PAUSED / ERROR / ARCHIVED |
| ID de Workflow n8n | Identificador en el sistema n8n (oculto para clientes) |
| Fecha | Fecha de creación |

---

## 23. Conversaciones Escaladas

La sección de Escalaciones (`/admin/escalations`) muestra todas las conversaciones con estado **ESCALATED** en toda la plataforma.

### ¿Por qué es importante?

Las conversaciones escaladas son clientes que están esperando atención humana. Esta vista centralizada permite:
- Ver todas las escalaciones pendientes de todos los clientes.
- Coordinarte con el equipo de soporte.
- Asegurarte de que ningún cliente quede sin respuesta.

### Información mostrada

Por cada conversación escalada:
- Cliente (organización)
- Nombre y teléfono del contacto
- Canal (whatsapp)
- Hora de escalación
- Tiempo de espera transcurrido

---

## 24. Solicitudes de Clientes

La sección de Solicitudes (`/admin/requests`) centraliza todas las solicitudes de soporte de todos los clientes.

### Lista de Solicitudes

La tabla muestra todas las solicitudes con:
- Título
- Cliente (organización)
- Tipo
- Prioridad
- Estado actual
- Fecha de creación

Las solicitudes de **alta prioridad** aparecen destacadas.

### Actualizar el Estado Inline

Puedes actualizar el estado de una solicitud directamente desde la lista sin abrir un formulario separado:

1. En la columna de estado, haz clic en el selector.
2. Selecciona el nuevo estado:
   - **OPEN** → **IN_PROGRESS** → **RESOLVED** → **CLOSED**
3. El cambio se guarda automáticamente y el cliente verá el estado actualizado en su portal.

> El sistema registra automáticamente la fecha de resolución cuando el estado cambia a RESOLVED o CLOSED.

---

## 25. Métricas Globales

La sección de Métricas (`/admin/metrics`) ofrece gráficas agregadas de toda la plataforma.

### Qué encontrarás

- **Gráfica de leads por organización:** qué clientes tienen más actividad.
- **Distribución de planes:** cuántos clientes hay en cada plan.
- **Tendencia de automatizaciones:** evolución del uso de automatizaciones en el tiempo.
- **Salud de automatizaciones:** porcentaje de automatizaciones activas vs. con error en toda la plataforma.

---

## 26. Templates (Admin)

La sección de Templates del Admin (`/admin/templates`) es donde el equipo de Reymen crea y publica los templates que los clientes pueden instalar desde su marketplace.

### Crear un Template

1. Haz clic en **"Nuevo Template"**.
2. Completa:
   - **Nombre:** nombre descriptivo del template.
   - **Emoji:** ícono representativo (ej. `🏥`, `🏠`, `💪`).
   - **Descripción corta:** resumen de una línea para el marketplace.
   - **Descripción larga:** descripción detallada de qué hace el template.
   - **Industria:** a qué sector aplica.
   - **Categoría:** tipo de automatización.
   - **Tags:** palabras clave para búsqueda.
3. Haz clic en **"Crear"**.

El template se crea como **borrador** (no publicado). Los clientes no lo verán hasta que lo publiques.

**Industrias disponibles:** `clinic`, `real_estate`, `gym`, `legal`, `workshop`, `ecommerce`

**Categorías disponibles:** `lead_capture`, `appointments`, `follow_up`, `crm`, `retention`

### Añadir una Versión (Semver)

Un template sin versiones no puede publicarse. Cada versión contiene el flujo de trabajo n8n real.

1. Abre el detalle del template.
2. Haz clic en **"Añadir Versión"**.
3. Completa:
   - **Versión:** número en formato semver (ej. `1.0.0`, `1.1.0`, `2.0.0`).
   - **Changelog:** qué cambió en esta versión.
   - **n8n Workflow JSON:** el JSON completo del workflow exportado desde n8n.
   - **Configuración por defecto:** variables predeterminadas del flujo.
4. Haz clic en **"Guardar versión"**.

> El sistema marca automáticamente la nueva versión como `isLatest: true` y actualiza el campo `currentVersion` del template, usando una transacción atómica para evitar inconsistencias.

> Si la versión ya existe (mismo número), el sistema rechazará la operación con un error.

### Publicar/Despublicar un Template

En la página de detalle del template:

- **Publicar:** haz clic en **"Publicar"**. El template aparecerá en el marketplace de todos los clientes.
  - *Requisito:* el template debe tener al menos una versión.
- **Despublicar:** haz clic en **"Despublicar"**. El template desaparecerá del marketplace, pero las instalaciones existentes siguen funcionando.

### Instalar para un Cliente

Como administrador, puedes instalar un template directamente para un cliente sin que el cliente lo haga:

1. Abre el detalle del template.
2. Haz clic en **"Instalar para Cliente"**.
3. Selecciona:
   - La organización cliente.
   - La versión a instalar.
   - Configuración personalizada (opcional).
4. Confirma la instalación.

El sistema creará la automatización en la cuenta del cliente y la vinculará al template.

---

## 27. Auditoría

La sección de Auditoría (`/admin/audit`) muestra un registro inmutable de todas las acciones importantes realizadas en la plataforma.

### ¿Para qué sirve?

El log de auditoría permite:
- Rastrear quién hizo qué y cuándo.
- Investigar incidentes.
- Cumplir con requisitos de compliance.

### Columnas del log

| Columna | Descripción |
|---------|-------------|
| Fecha | Cuándo ocurrió la acción |
| Acción | Qué se hizo (ver tipos abajo) |
| Recurso | Sobre qué entidad (Lead, User, Organization) |
| ID del recurso | ID específico del registro afectado |
| Usuario | Quién realizó la acción (ID) |
| Cliente | A qué organización pertenece |
| Metadata | Datos adicionales del evento |

### Filtrar por Cliente

Usa el selector de cliente en la parte superior para filtrar el log de una organización específica.

### Tipos de Eventos Auditados

| Evento | Descripción |
|--------|-------------|
| `lead.create` | Creación de un nuevo lead |
| `lead.delete` | Eliminación (soft delete) de un lead |
| `client.create` | Creación de una nueva organización cliente |
| `client.plan_change` | Cambio de plan de un cliente |
| `team.invite` | Invitación de un nuevo miembro al equipo |
| `team.remove` | Desactivación de un usuario del equipo |
| `template.install` | Instalación de un template por un cliente |
| `template.uninstall` | Desinstalación de un template |

> El log de auditoría es de **solo lectura**. Los registros nunca se modifican ni eliminan para garantizar su integridad.

---

## 28. API Docs

La sección de API Docs (`/admin/api-docs`) contiene la referencia técnica de los webhooks disponibles para la integración con n8n.

### Para qué sirve

Cuando el equipo de Reymen configura un flujo de trabajo en n8n, necesita saber cómo enviar datos de vuelta a la plataforma. Esta documentación describe los endpoints disponibles.

### Autenticación de Webhooks (HMAC)

Todos los webhooks requieren autenticación mediante firma HMAC-SHA256.

**Header requerido:** `X-Reymen-Signature`

**Formato:** `sha256={firma_hex}`

**Cómo generar la firma:**
```javascript
const crypto = require('crypto');
const signature = 'sha256=' + crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(rawBodyString)
  .digest('hex');
```

**Header adicional:** `X-Reymen-OrgId` con el ID de la organización destino.

### Endpoints disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/webhooks/n8n/leads` | Crear un lead desde n8n |
| POST | `/api/webhooks/n8n/automations` | Reportar evento de automatización |
| POST | `/api/webhooks/n8n/conversations` | Crear/actualizar conversación y mensajes |
| POST | `/api/webhooks/n8n/scoring` | Actualizar el score AI de un lead |

---

## 29. Configuración del Sistema

La sección de Configuración (`/admin/settings`) muestra el estado técnico de la plataforma.

### Información del sistema

- **Versión de la plataforma**
- **Estadísticas globales:** número de organizaciones, usuarios, leads, automatizaciones y conversaciones totales.
- **Variables de entorno:** estado de las variables críticas (presentes/ausentes).

### Variables de entorno monitoreadas

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Conexión a PostgreSQL |
| `AUTH_SECRET` | Clave de cifrado de sesiones JWT |
| `N8N_BASE_URL` | URL interna de la instancia n8n |
| `N8N_WEBHOOK_SECRET` | Secreto compartido para webhooks |
| `KNOWLEDGE_BASE_API_KEY` | Clave API para el endpoint de Base de Conocimiento |

> **Nota de seguridad:** Esta pantalla muestra si cada variable está configurada, pero **nunca** muestra los valores reales para proteger la seguridad del sistema.

---

*Fin de la Guía de Usuario — Reymen Solutions v1.0*

*Para soporte técnico, crea una solicitud desde tu portal o contacta a support@reymen.io*
