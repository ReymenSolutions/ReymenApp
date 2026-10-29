# Guía de demostración y aceptación

Usar un negocio de prueba y clientes ficticios. Registrar fecha, versión y responsable de cada resultado. Esta guía es un guion de aceptación, no una afirmación de que ya se completó.

| Producto | Demostración | Criterio de aceptación |
|---|---|---|
| Reymen Foods | Crear un platillo con variantes, precio y receta; revisar una sucursal | POS muestra el menú y precio de esa sucursal; inventario insuficiente avisa sin impedir cobro |
| Reymen POS | Identificar cliente, cobrar, emitir comprobante y cerrar venta | Totales y descuentos correctos; ninguna pantalla bloqueada; venta única |
| ReymenApp CRM | Consultar al cliente después de la venta | Compra visible, importe y sucursal correctos; datos conservados |
| Reymen Loyalty | Elegir programa, registrar compras válidas y alcanzar meta | Progreso del programa seleccionado según intervalo configurado; recompensa disponible |
| POS + Loyalty | Canjear recompensa de artículo gratuito o descuento | Se aplica al concepto correcto y solo una vez; un segundo dispositivo no puede duplicar el canje |
| Integración | Cancelar una venta asociada | Reversión coherente de importes, existencias y progreso según política; historial trazable |
| Continuidad | Cobrar sin conexión y reconectar | Cobro local disponible y sincronización única; no prometer canje online sin conexión |
| Permisos | Probar cajero, administrador y otro negocio | Cada perfil ve y modifica exclusivamente lo autorizado |
| Móvil | Recorrer alta de cliente, cumpleaños, cobro, canje e historial | Campos accesibles, sin scroll horizontal ni modales vacíos |

## Material que se entrega al cliente
- Manual de inicio: configurar negocio, sucursal, menú, personal y programa.
- Explicación del intervalo entre visitas y del programa elegido por cada miembro.
- Explicación de recompensas, cancelaciones y sincronización pendiente.
- Contacto de soporte y procedimiento de reporte con hora y folio, sin contraseñas.
- Acta de aceptación con observaciones y resultados reales.

## Condición de salida
No utilizar datos reales ni anunciar lanzamiento hasta cerrar las pruebas del informe técnico, comprobar restauración del respaldo y validar la versión candidata en staging. Las funciones de IA privadas no forman parte de esta demostración comercial.
