# Seguridad y autorización

- Toda lectura del portal debe filtrar por `organizationId` de sesión y exigir el entitlement `WORKSHOP`.
- Las acciones de escritura vuelven a comprobar módulo, rol y pertenencia de cada ID. No deben confiar en las guardas de página.
- Dueño: costos, utilidad, precios y caja. Mecánico probable: solo datos operativos, sin campos financieros. El segundo usuario no se crea hasta confirmación.
- El PDF de cotización se sirve solo tras autenticación, con consulta limitada a la organización y campos visibles al cliente; no selecciona costo ni utilidad. Las fotos se normalizan a JPEG sin EXIF, se guardan privadas en PostgreSQL y se sirven con autorización por organización y `Cache-Control: private, no-store`.
- Una línea de trabajo adicional requiere autorización registrada. Su clave de solicitud única por organización evita cargos e inventario duplicados ante reintentos concurrentes. Entrega con saldo exige crédito explícito. El estado `ENTREGADA` no puede reabrirse para edición.
- La landing permanece cerrada hasta que `WORKSHOP_WOLF_LANDING_ENABLED=true`, `WORKSHOP_WOLF_ORG_ID` sea el ID exacto de la organización, `WORKSHOP` esté activo y exista el archivo limpio `public/taller-wolf-logo-limpio.png`. Su POST exige mismo origen, límite por IP, cuerpo máximo, campo trampa, validación e idempotencia. Los datos públicos nunca contienen un `organizationId` seleccionable por el visitante.

Hay pruebas negativas de rol y organización para órdenes, inventario, compras, caja, PDF, fotos y servicios. Falta la revisión final de seguridad y la aceptación integral del MVP. Consultar `PROGRESS.md` antes de habilitar el módulo para clientes.
