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
