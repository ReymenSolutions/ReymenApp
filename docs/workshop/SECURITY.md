# Seguridad y autorización

- Toda lectura del portal debe filtrar por `organizationId` de sesión y exigir el entitlement `WORKSHOP`.
- Las acciones de escritura vuelven a comprobar módulo, rol y pertenencia de cada ID. No deben confiar en las guardas de página.
- Dueño: costos, utilidad, precios y caja. Mecánico probable: solo datos operativos, sin campos financieros. El segundo usuario no se crea hasta confirmación.
- El PDF público nunca incluye costo ni utilidad. Las fotos y documentos deben almacenarse de manera privada y servirse con control de organización; mecanismo aún pendiente.
- Una línea de trabajo adicional requiere autorización registrada. Entrega con saldo exige crédito explícito. El estado `ENTREGADA` no puede reabrirse para edición.
- Formularios públicos futuros requieren rate limit, validación de origen, protección contra spam y vínculo inequívoco con la organización Taller Wolf.

La base actual no satisface todavía todos esos controles; consultar `PROGRESS.md` antes de habilitar el módulo para clientes.
