# Para investigar en el futuro (NO es trabajo actual)

El trabajo actual es `docs/crm/ROADMAP-CRM.md`. Aquí quedan las opciones
discutidas, con la recomendación del momento, para retomarlas después.

## A. Cliente que pide un CRM "a medida" (ej. una clínica)

Recomendación: **ajustar dentro de Reymen por capas**; construir aparte solo
con una razón fuerte.

| Opción | Cuándo conviene | Contras |
|---|---|---|
| Ajustar dentro de Reymen | Casi siempre: lo mismo que otros clientes con otro vocabulario y algunos campos | Mantenerlo genérico, sin casos especiales |
| Construir desde cero | Casi nunca para un solo cliente | Costo alto, otro sistema que mantener, se pierde WhatsApp/citas/automatizaciones/facturación |
| Construir aparte y conectarlo | El cliente ya tiene un sistema que no dejará | Dos fuentes de verdad, sincronización, duplicados |

Capas, en orden:
1. Configuración por cliente (campos, etapas, plantillas de mensajes,
   vocabulario: "paciente" en vez de "lead"). Es la mejora 4 del roadmap.
2. Plantillas por industria (clínica, restaurante, despacho), sobre la idea
   existente de paquetes de plantillas.
3. Pantallas a medida dentro de Reymen solo para lo que no encaje
   (expediente/historial clínico). **Datos de salud**: aviso de privacidad,
   consentimiento y más seguridad; tratarlo como módulo aparte, no mezclado
   con el CRM general.
4. Conectar uno externo solo si el cliente ya usa uno: API y webhooks firmados
   (n8n) existentes, con una única dirección de verdad definida de antemano.

Criterio rápido: ¿cabe en campos/etapas/mensajes distintos? → ajustar. ¿Ya
tiene sistema que no cambiará? → conectar. ¿Otro modelo de datos (expediente)?
→ módulo propio y decidir si es negocio que se quiere tener.

## B. Diseño distinto por cliente (ej. "tipo Apple")

Reymen usa variables de color `brand-*` y el modo oscuro remapea esas
variables (`globals.css`), así que un tema por cliente usa el mismo mecanismo.
Hoy existe logo por cliente (`Organization.logoUrl`), no colores/fuente.

- **Nivel 1 — marca del cliente (bajo costo):** colores, logo, fuente, esquinas
  por cliente. No cambia la estructura. Recomendado hacerlo primero.
- **Nivel 2 — tema completo (costo medio):** un segundo tema de diseño
  elegible (mucho espacio en blanco, tipografía grande y delgada, esquinas muy
  redondeadas, sombras suaves, tarjetas en vez de tablas densas). Se construye
  una vez como tema de Reymen ("Claro minimalista") y lo usa cualquier cliente.
  No copiar la identidad de Apple (tipografía, íconos, nombre): estilo
  inspirado sí, clon no. Una mejora al CRM llega a todos los temas.
- **Nivel 3 — interfaz propia (costo alto):** el cliente construye su pantalla
  y usa Reymen como motor vía API/webhooks. Hoy la API pública es limitada
  (seguimientos, citas, Foods); cada pantalla nueva puede pedir endpoints.
  Dos interfaces que mantener. Solo casos especiales y cobrado aparte.

Recomendación: Nivel 1 pronto; Nivel 2 como tema "premium" cuando un cliente
lo pague; Nivel 3 solo excepcional.

## Pendiente de investigar
- Alcance exacto del Nivel 1 (qué se configura, dónde, esfuerzo).
- Qué endpoints de API pública harían falta para el Nivel 3.
- Requisitos legales/técnicos para datos de salud (módulo clínico).
