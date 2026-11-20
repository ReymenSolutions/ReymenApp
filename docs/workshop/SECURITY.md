# Seguridad y autorización

- Toda lectura del portal debe filtrar por `organizationId` de sesión y exigir el entitlement `WORKSHOP`.
- Las acciones de escritura vuelven a comprobar módulo, rol y pertenencia de cada ID. No deben confiar en las guardas de página.
- Dueño: costos, utilidad, precios y caja. Mecánico probable: solo datos operativos, sin campos financieros. El segundo usuario no se crea hasta confirmación.
- El PDF de cotización se sirve solo tras autenticación, con consulta limitada a la organización y campos visibles al cliente; no selecciona costo ni utilidad. Las fotos se normalizan a JPEG sin EXIF, se guardan privadas en PostgreSQL y se sirven con autorización por organización y `Cache-Control: private, no-store`.
- Una línea de trabajo adicional requiere autorización registrada. Entrega con saldo exige crédito explícito. El estado `ENTREGADA` no puede reabrirse para edición.
- Formularios públicos futuros requieren rate limit, validación de origen, protección contra spam y vínculo inequívoco con la organización Taller Wolf.

Faltan pruebas negativas más amplias para órdenes, inventario, caja y fotos, y una revisión final de seguridad. Consultar `PROGRESS.md` antes de habilitar el módulo para clientes.
