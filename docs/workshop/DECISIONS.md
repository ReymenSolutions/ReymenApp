# Decisiones

- Realty es el patrón técnico comprobado. Contractors aún no existe y queda fuera de este trabajo, conforme a la aclaración del usuario.
- El código actual usa Next.js 16, no la versión 15 mencionada en el prompt.
- El ejemplo de cotización muestra netos que suman $3,793.11, frente al subtotal declarado de $3,793.10. El motor toma el total bruto $4,400 como referencia, deriva $3,793.10 netos y distribuye el centavo de ajuste en la última línea con importe positivo. Es una prueba de formato, no una orden real.
- La tarifa de $1,999 mensual para Taller Wolf es tentativa y no se codifica como precio contratado; fecha de inicio pendiente.
- No se crea usuario mecánico ni se inventan costos, precios o fotografías.
- El ZIP v8 entregado después de la especificación inicial es la fuente para el sitio web. Sustituye la propuesta anterior de una sola página y nueve servicios en la web; incluye nueve páginas y once servicios. El logotipo limpio del ZIP ya está en `sites/taller-wolf/v8/` y en `public/`. No se usa la imagen con puntos.
- Los HTML y el diccionario inglés se regeneran desde `sites/taller-wolf/herramientas/paginas-v8.js`; `assets/app.js` conserva las interacciones editables. El formulario guarda un Lead y una solicitud en CRM. WhatsApp queda como opción directa. El sitio de prueba consume el endpoint por el mismo origen y el servidor fija la organización.
- La revisión general de seis meses es una sugerencia interna derivada de la última entrega. No se enviará nada hasta tener reglas, historial, consentimiento vigente, control de duplicados y un canal verificado. n8n solo entregará los mensajes; ReymenApp decidirá qué y cuándo enviar.
- Costo y precio de venta de refacciones permanecen separados. La utilidad de la cotización es estimada hasta conciliar el costo efectivamente consumido por orden.
- A petición posterior del usuario, placas y kilometraje son opcionales **en la solicitud pública**. Se conservan como requisitos al convertir la solicitud en vehículo completo para cotizar, junto con el VIN; no se inventan valores faltantes. Marca y modelo usan sugerencias buscables compartidas entre web y Workshop y aceptan texto libre para vehículos no listados.
- Realty sigue siendo el patrón de permisos, tenant y navegación, pero Taller Wolf solicitó acentos rojos en su módulo. Encabezado, pestaña activa, enlaces y acciones principales de Workshop usan la paleta negro/rojo de su identidad; los colores que representan ingresos o errores conservan su significado.
- El PDF del cliente para la organización configurada como Taller Wolf usa su logo limpio exacto en el encabezado y una silueta tenue derivada del mismo archivo como marca de agua. El archivo maestro no se modifica. Otras organizaciones con Workshop mantienen el PDF genérico. Costos y utilidad nunca entran al contrato de datos del PDF.
- El nombre del PDF de Taller Wolf se forma con los datos reales `cotizacion-servicio-marca-modelo-año-tallerwolf.pdf`; el folio oficial permanece visible dentro. Sin año registrado se omite esa parte, sin inventarlo. Las notas del formulario se etiquetan como visibles para el cliente.

## 27 nov 2026: vínculo entre solicitud y cotización

Para distinguir de forma durable las solicitudes pendientes de las cotizadas, se permite una relación opcional y única `WorkshopQuote.requestId`. Para Descartar se conservan la solicitud y el Lead y se marca `discardedAt`/`discardedById`. Es una excepción aditiva y mínima al pedido de no modificar el modelo: sin estos campos no era posible cumplir el contador, la persistencia del descarte y el vínculo con el Lead tras reintentos. No se agregan estados de cotización. El requisito de VIN y kilometraje aplica al PDF con folio, no al alta del vehículo ni al borrador. Un Lead fusionado se re-vincula solo si hay exactamente un candidato activo por teléfono dentro de la organización.

## 27 nov 2026: IVA opcional por cotización

El nuevo booleano `incluyeIva` está en `WorkshopQuote` y tiene default `true` a nivel de base y Prisma, de modo que las cotizaciones anteriores mantienen su cálculo. No se almacena precio bruto como neto. La orden deriva la opción de su cotización original; las líneas autorizadas después de convertir respetan esa misma opción. Una solicitud de factura con IVA apagado genera advertencia visual y permite continuar, según instrucción del cliente. El PDF sin IVA omite el renglón de impuesto y etiqueta explícitamente el total.
