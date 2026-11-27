# Trabajo pendiente

- [ ] Validar la web v8 y su formulario CRM en navegador contra el dominio de test; confirmar aviso legal, DNS y TLS antes de publicar `tallerwolf.com`.
- [ ] Implementar reglas e historial de mantenimiento estructurados, vista de recomendaciones para mecánicos y salida idempotente a n8n con consentimiento verificado.
- [ ] Conciliar costo real de refacciones consumidas con compras/inventario y mostrar utilidad final por orden separada de la estimada en cotización.
- [ ] Simplificar captura operativa para personal con poca experiencia digital: pasos guiados de recepción, diagnóstico, trabajo y entrega; probarlos con mecánicos.

- [x] Copiar y auditar la especificación.
- [x] Crear esquema inicial, migración y registro del módulo.
- [x] Crear ruta protegida y etiquetas español/inglés.
- [x] Crear vehículo de un Customer del CRM y borrador de cotización con cálculo neto/IVA.
- [x] Validar migración y el flujo vehículo/cotización con PostgreSQL desechable; probar IDOR de cliente entre organizaciones.
- [x] Ampliar las pruebas de IDOR a órdenes, inventario, compras, caja y archivos; verificar reintento concurrente de línea adicional.
- [x] Recepción, diagnóstico, checklist y fotos privadas en flujo básico.
- [x] Folios transaccionales, emisión, vigencia y PDF de cotización sin costos.
- [x] Aprobación y conversión única a orden; líneas adicionales con autorización, cargo e inventario transaccionales e idempotentes.
- [x] Inventario derivado, compras y caja en transacciones, sin stock negativo en el flujo de orden.
- [x] Pagos, crédito explícito, entrega inmutable e historial paginado de vehículo.
- [x] Panel con balance e ingresos del día calculados de caja.
- [x] PDF de orden, solicitud de factura, vigencia/garantía, datos de próximo servicio y catálogo editable de servicios provisionales. Los recordatorios automáticos son de la fase siguiente.
- [ ] Landing bilingüe y conexión a CRM implementadas con compuerta cerrada; falta el logotipo limpio verificable y la validación del flujo real en navegador antes de publicarla.
- [ ] Pruebas de aceptación y revisión de seguridad antes de activar `WORKSHOP` en producción.
