# Reymen Talleres — Spec del módulo

**Decisión confirmada el 20 de noviembre de 2026:** Talleres se construye dentro de Reymen App, como un módulo más. No es una aplicación aparte.

**Piloto:** Taller Wolf — Servicio Automotriz, Monterrey, N.L.
**Estado:** Spec para desarrollo con Codex / Claude. Sin código todavía.
**Modelo comercial propuesto:** Implementación $0 MXN, exenta como piloto familiar. Suscripción tentativa de MXN 1,999 al mes, a confirmar. Sin fecha de inicio de cobro definida y sin otros cargos en este spec.

## Por qué dentro de Reymen y no aparte

Taller Wolf hoy trabaja sin sistemas ni controles, todo manual y al tanteo. Ya existe un prototipo improvisado, Control Taller Wolf, con Panel, Órdenes, Cotizaciones y Clientes, y un PDF de cotización con folio TW-2026-1120. Ese prototipo validó el flujo, pero no es un sistema de producción: no tiene la base de datos de Reymen, no es multiusuario con permisos, no descuenta inventario, no separa costo de precio de venta y no está conectado a caja.

Crear un sistema aparte implicaría duplicar login, base de datos, clientes, pagos, WhatsApp, automatizaciones con n8n y mantenimiento. Dentro de Reymen se reutiliza todo eso y Talleres queda como una vertical más, igual que Foods, Loyalty, Realty y Contractors.

Taller Wolf sería el primer cliente de la vertical Talleres, del mismo modo que la empresa de house leveling de Huntsville, Texas, es el primer caso de Contractors.

## Qué resuelve el módulo

- Cada vehículo que entra deja una orden con folio. Sin orden, no se trabaja.
- Cada cotización se aprueba por escrito antes de desarmar.
- Cada refacción que sale se descuenta de inventario contra una orden.
- Cada peso que entra o sale queda en caja, con corte diario.
- Cada vehículo tiene historial por placas y por número de serie (VIN, Vehicle Identification Number), no solo por nombre del cliente.
- Cada trabajo muestra utilidad real, porque guarda costo y precio por separado.

## Arquitectura en Reymen App

Talleres sigue el mismo patrón ya usado por Realty y Contractors en el repositorio ReymenSolutions/ReymenApp.

- Agregar `WORKSHOP` al enumerado `PlatformModule` en `prisma/schema.prisma`.
- Registrar el módulo en `src/lib/modules.ts` con nombre visible Talleres.
- Activar el módulo por organización con `OrganizationModule`. Una organización sin Talleres activo no ve el módulo.
- Proteger todas las rutas y acciones del servidor con `requireModule` para `WORKSHOP`.
- Crear la ruta `/portal/workshop` y sus pestañas.
- Los contactos viven en el sistema de gestión de clientes (CRM, Customer Relationship Management) de Reymen, en los modelos existentes de cliente y prospecto. Talleres no crea su propia tabla de personas; solo guarda lo propio del taller y enlaza al cliente del CRM.
- Base de datos PostgreSQL, multi-tenant por `organizationId` en todas las tablas nuevas. Ninguna consulta del módulo devuelve datos de otra organización.
- Archivos y fotos de recepción se guardan con el mecanismo de almacenamiento privado ya previsto en Reymen. Si se reutiliza el precedente de guardar archivos en la base de datos, debe quedar documentado en la implementación; no se asume un bucket externo que no esté confirmado.

### Pestañas del módulo

| Pestaña | Qué muestra |
|---|---|
| Panel | Órdenes activas, listas para entregar, cotizaciones pendientes, clientes, compras, balance e ingresos del día |
| Cotizaciones | Lista, creación, envío, aprobación y conversión a orden |
| Órdenes | Trabajo en curso por estado, mecánico y fecha prometida |
| Vehículos | Historial por placas y VIN |
| Inventario | Refacciones, existencias, mínimos y movimientos |
| Compras | Compras a proveedores ligadas o no a una orden |
| Caja | Ingresos, egresos, anticipos, saldos y corte diario |
| Configuración | Servicios, paquetes, vigencia y garantía por defecto |

La pestaña Clientes del prototipo improvisado se resuelve en Reymen desde el CRM, con una vista filtrada de clientes que tienen vehículos u órdenes en Talleres.

### Usuarios y permisos en el piloto

Confirmado el 20 de noviembre de 2026: el módulo lo utilizará el dueño del taller. Es probable, no confirmado al 100 %, que también lo utilice un mecánico encargado. El piloto se diseña para 2 usuarios:

| Usuario | Rol en el piloto | Permisos |
|---|---|---|
| Dueño del taller | Administrador total | Acceso completo: cotizaciones, órdenes, inventario, compras, caja, configuración, costos, precios y utilidad |
| Mecánico encargado (probable) | Operativo | Ver órdenes asignadas y del taller, actualizar estados de orden, subir fotos de recepción, proceso y entrega. Sin acceso a costos, utilidad ni caja completa, y sin poder cambiar precios |

El segundo usuario no se crea hasta que el taller confirme quién será el mecánico encargado. Los permisos anteriores aplican desde el diseño del MVP para que, cuando se active, no pueda ver información financiera interna.

## Modelo de datos

Convenciones para todas las tablas nuevas: `id`, `organizationId`, `createdAt`, `updatedAt`, y borrado lógico cuando aplique. Los montos se guardan en centavos o en decimal con dos decimales, nunca en número flotante. La moneda por defecto es MXN.

Regla fiscal que aplica a todo el módulo: **el precio se guarda neto, sin Impuesto al Valor Agregado (IVA).** El IVA del 16 % se calcula al mostrar y al generar el PDF. El costo también se guarda neto. Guardar precios ya con IVA incluido, como hacía el prototipo, rompe la facturación y el cálculo de utilidad.

### Vehículo — `WorkshopVehicle`

Un cliente del CRM puede tener varios vehículos. El historial se consulta por vehículo.

| Campo | Tipo | Notas |
|---|---|---|
| `customerId` | Relación al CRM | Cliente propietario, obligatorio |
| `placas` | Texto | Obligatorio al abrir orden |
| `vin` | Texto | Obligatorio al abrir orden |
| `marca` / `modelo` / `anio` | Texto / entero | Ejemplo: Audi, A1, 2021 |
| `version` | Texto | Versión exacta, confirma el precio final |
| `motor` | Texto | Ejemplo: TFSI gasolina, turbo |
| `kilometrajeActual` | Entero | Se actualiza en cada recepción |
| `color` | Texto | Opcional |
| `proximoServicioKm` | Entero | Opcional |
| `proximoServicioFecha` | Fecha | Opcional, alimenta recordatorios |

Índices únicos por organización: `placas` y `vin` no se repiten para el mismo cliente sin aviso; si unas placas ya existen, se reutiliza el vehículo.

### Cotización — `WorkshopQuote`

| Campo | Tipo | Notas |
|---|---|---|
| `folio` | Texto único | Formato propuesto `TW-AAAA-####`, secuencia desde cero en Reymen |
| `customerId` / `vehicleId` | Relaciones | Cliente y vehículo |
| `estado` | Enumerado | Ver estados abajo |
| `servicioTitulo` | Texto | Ejemplo: Afinación mayor |
| `tiempoEstimado` | Texto | Ejemplo: 3 a 4 horas |
| `vigenciaDias` | Entero | Por defecto 15 días naturales |
| `garantiaDias` / `garantiaKm` | Entero | Por defecto 90 días o 5,000 km en mano de obra |
| `subtotalNeto` | Decimal | Suma de líneas netas |
| `iva` | Decimal | 16 % sobre el subtotal neto |
| `total` | Decimal | Subtotal neto más IVA |
| `costoTotalNeto` | Decimal | Solo interno, nunca en el PDF del cliente |
| `utilidadNeta` | Decimal | Subtotal neto menos costo total neto |
| `aprobadaEn` / `aprobadaVia` | Fecha / texto | WhatsApp, en persona o llamada |
| `workOrderId` | Relación | Se llena al convertir a orden |
| `notas` | Texto | Condiciones y notas técnicas |

Estados: `BORRADOR`, `ENVIADA`, `APROBADA`, `RECHAZADA`, `VENCIDA`, `CONVERTIDA`.

Una cotización vencida no se convierte; se duplica en una nueva con precios actualizados.

### Línea de cotización y de orden — `WorkshopQuoteItem` / `WorkshopOrderItem`

Las dos tablas comparten la misma forma. Al convertir la cotización, las líneas se copian a la orden y a partir de ahí viven en la orden.

| Campo | Tipo | Notas |
|---|---|---|
| `tipo` | Enumerado | `REFACCION`, `MANO_DE_OBRA`, `SERVICIO` |
| `partId` | Relación | Solo si es refacción de inventario |
| `concepto` | Texto | Nombre visible al cliente |
| `detalle` | Texto | Especificación, marca o alcance |
| `cantidad` | Decimal | Con su unidad: pza, L, serv. |
| `unidad` | Texto | pza, L, serv., etc. |
| `precioUnitarioNeto` | Decimal | Precio de venta sin IVA |
| `costoUnitarioNeto` | Decimal | Costo sin IVA, solo interno |
| `importeNeto` | Decimal | Cantidad por precio unitario neto |
| `ivaImporte` | Decimal | 16 % del importe neto |
| `importeConIva` | Decimal | Importe neto más IVA |

Ningún trabajo adicional se agrega a una orden sin una línea nueva autorizada por el cliente. Esa autorización queda registrada con fecha y medio.

### Orden de servicio — `WorkshopWorkOrder`

| Campo | Tipo | Notas |
|---|---|---|
| `folio` | Texto único | Folio propio de orden, enlazado a la cotización origen |
| `quoteId` | Relación | Cotización origen, si existe |
| `customerId` / `vehicleId` | Relaciones | Cliente y vehículo |
| `estado` | Enumerado | Ver estados abajo |
| `fallaReportada` | Texto | Lo que dice el cliente al llegar |
| `diagnostico` | Texto | Lo que encuentra el taller |
| `kilometrajeIngreso` | Entero | Obligatorio en recepción |
| `nivelCombustible` | Texto | Registrado en el checklist |
| `checklistRecepcion` | JSON | Daños previos, testigos, pertenencias |
| `fotosRecepcion` | Archivos | Fotos de ingreso, obligatorias |
| `fotosProceso` / `fotosEntrega` | Archivos | Antes y después del trabajo |
| `mecanicoAsignadoId` | Relación a usuario | Opcional en el MVP |
| `fechaPrometida` | Fecha y hora | Compromiso de entrega |
| `anticipo` / `saldo` | Decimal | El saldo se deriva de pagos registrados |
| `entregadaEn` | Fecha | Cierre de la orden |
| `garantiaDias` / `garantiaKm` | Entero | Se heredan de la cotización |

Estados: `RECEPCION`, `DIAGNOSTICO`, `ESPERA_AUTORIZACION`, `EN_REPARACION`, `LISTA_PARA_ENTREGA`, `ENTREGADA`, `CANCELADA`.

Una orden `ENTREGADA` no se edita. Cualquier corrección se hace con una nota o una orden de garantía nueva enlazada a la original.

### Refacción e inventario — `WorkshopPart` y `WorkshopInventoryMovement`

| Campo de `WorkshopPart` | Tipo | Notas |
|---|---|---|
| `sku` | Texto | Código interno, único por organización |
| `nombre` | Texto | Ejemplo: Filtro de aceite |
| `descripcion` | Texto | Marca, especificación, equivalencias |
| `unidad` | Texto | pza, L, kit |
| `costoNeto` | Decimal | Último costo de compra, sin IVA |
| `precioVentaNeto` | Decimal | Precio al cliente, sin IVA |
| `existencia` | Decimal | Se deriva de movimientos, no se edita a mano |
| `stockMinimo` | Decimal | Alerta de reposición |
| `proveedorHabitual` | Texto | Opcional |

Toda entrada o salida pasa por `WorkshopInventoryMovement`: `partId`, `tipo` (`ENTRADA_COMPRA`, `SALIDA_ORDEN`, `DEVOLUCION`, `AJUSTE`), `cantidad`, `costoUnitarioNeto`, `workOrderId` cuando sale para una orden, `purchaseId` cuando entra por compra, `motivo` obligatorio en ajustes.

Sin movimiento no hay cambio de existencia. Un ajuste sin motivo es una fuga que el sistema debe impedir.

### Compra — `WorkshopPurchase`

Registra refacciones compradas a proveedor: `proveedor`, `fecha`, `folioProveedor`, líneas con `partId`, `cantidad`, `costoUnitarioNeto`, `subtotalNeto`, `iva`, `total`, y `workOrderId` opcional cuando la compra es para un trabajo concreto. Al guardar, genera los movimientos de entrada a inventario y, si se paga al momento, el egreso de caja.

### Movimiento de caja — `WorkshopCashMovement`

Una sola caja por organización en el MVP. Todo anticipo, pago, compra y gasto pasa por aquí.

| Campo | Tipo | Notas |
|---|---|---|
| `tipo` | Enumerado | `INGRESO`, `EGRESO` |
| `concepto` | Texto | Anticipo, pago de orden, compra, gasto, etc. |
| `monto` | Decimal | Positivo, el signo lo da el tipo |
| `metodo` | Enumerado | `EFECTIVO`, `TRANSFERENCIA`, `TARJETA` |
| `workOrderId` / `purchaseId` | Relaciones | Origen del movimiento, cuando aplica |
| `fecha` | Fecha y hora | Para el corte diario |
| `registradoPorId` | Relación a usuario | Quién lo capturó |
| `notas` | Texto | Opcional, obligatorio en ajustes |

El Panel calcula desde caja y órdenes: compras del periodo, balance, ingresos de hoy, saldo pendiente por orden y corte diario (ingresos menos egresos, separado por método de pago). Ninguno de esos totales se captura a mano.

### Catálogos iniciales

El módulo arranca vacío, sin datos del prototipo improvisado. Al activar Talleres para una organización solo se crean los catálogos base editables: tipos de línea, métodos de pago, estados, unidades (pza, L, serv.) y la configuración por defecto de vigencia de 15 días y garantía de 90 días o 5,000 km en mano de obra. Refacciones, clientes y vehículos se capturan desde cero en Reymen.

#### Servicios básicos provisionales

Confirmado el 20 de noviembre de 2026: mientras el taller comparte su lista completa y definitiva, el catálogo inicial y la landing trabajan con una lista básica y general. Esta lista es provisional y se reemplaza por la lista real en cuanto el taller la entregue. No se espera a esa lista para avanzar.

- Afinación mayor
- Afinación menor
- Cambio de aceite y filtros
- Frenos
- Suspensión
- Diagnóstico electrónico / escaneo
- Revisión de 20 puntos
- Cambio de batería
- Rotación y balanceo

Estos servicios se precargan como conceptos editables sin costo ni precio cerrados. Costo y precio de cada servicio se capturan en Reymen con los datos reales del taller.

### Facturación

Confirmado el 20 de noviembre de 2026: Taller Wolf sí factura cuando el cliente lo requiere.

En el MVP no hay facturación electrónica integrada dentro del módulo. La factura se genera fuera del módulo, por el medio que el taller ya utilice, solo bajo demanda del cliente. El módulo registra en la orden si el cliente pidió factura y conserva el total neto, el IVA y el total con IVA ya separados para que esa factura externa cuadre, pero no promete timbrado ni integración con un proveedor de facturación en esta primera versión.

La integración de facturación electrónica dentro de Reymen queda como requisito a evaluar para la fase siguiente, fuera del alcance del MVP.

## Flujo cotización a orden

El flujo es lineal y no permite saltarse la autorización del cliente.

1. **Recepción.** Se busca al cliente en el CRM o se crea, se busca el vehículo por placas o VIN o se crea, y se captura kilometraje, nivel de combustible, checklist de daños y fotos. Sin placas, VIN y kilometraje no se abre la cotización completa; solo un estimado sin folio.

2. **Diagnóstico.** Se registra la falla reportada y el diagnóstico. Si el diagnóstico cambia el alcance, se ajusta la cotización antes de enviarla.

3. **Cotización en borrador.** Se agregan líneas de refacción, mano de obra y servicio, cada una con costo neto y precio neto. El sistema calcula subtotal neto, IVA y total, y también la utilidad interna.

4. **Envío y aprobación.** La cotización pasa a `ENVIADA`, se genera el PDF y se envía al cliente, por ejemplo por WhatsApp. La aprobación se registra con fecha y medio y la cotización pasa a `APROBADA`. Sin aprobación registrada no se desarma ni se compra refacción para ese trabajo.

5. **Conversión a orden en un clic.** Desde una cotización `APROBADA`, el botón Convertir crea la orden copiando cliente, vehículo, líneas, precios, costos, vigencia y garantía. No se recaptura nada. La cotización queda en `CONVERTIDA` con el enlace a la orden, y la orden nace en `EN_REPARACION` o en `RECEPCION` según si el vehículo ya está en el taller.

6. **Inventario y compras.** Al iniciar el trabajo, las líneas de refacción con `partId` generan movimientos `SALIDA_ORDEN` y descuentan existencia. Si no hay existencia, se crea una compra ligada a la orden; al recibirla entra a inventario y enseguida sale a la orden, dejando ambos movimientos.

7. **Trabajo y evidencia.** Se asigna mecánico, se suben fotos de proceso y se agregan líneas nuevas solo con autorización registrada del cliente.

8. **Lista para entrega y cobro.** Al terminar, la orden pasa a `LISTA_PARA_ENTREGA`. Cada anticipo y pago crea un movimiento de caja `INGRESO` ligado a la orden. La orden no pasa a `ENTREGADA` si tiene saldo pendiente, salvo que se registre explícitamente como crédito con nota.

9. **Entrega.** Se registra fecha de entrega, kilometraje, fotos de entrega y entrega de refacciones reemplazadas. Se genera el documento de orden con la garantía aplicable.

10. **Postventa.** Con `proximoServicioKm` y `proximoServicioFecha` del vehículo se crea el recordatorio de próximo servicio, listo para automatizar con n8n en una fase posterior.

## PDF de cotización corregido

La cotización que el cuñado generó en su propia cuenta de Muse — folio TW-2026-1120, Audi A1 2021, afinación mayor, total MXN 4,400.00 con IVA incluido — se usa en este spec **solo como referencia de formato y contenido**. No es un dato a importar ni a migrar. Sirve para definir cómo debe verse el PDF de Reymen y qué debe corregir.

### Qué conserva el PDF de Reymen

- Encabezado con nombre del taller, giro y ciudad: Taller Wolf, Servicio Automotriz, Monterrey, N.L.
- Folio, fecha, vigencia en días naturales y moneda MXN.
- Bloques separados de vehículo, cliente y servicio, con tiempo estimado y próximo servicio.
- Desglose por concepto con cantidad, precio unitario e importe, y detalle técnico por línea.
- Sección de qué incluye sin costo extra, cuando el paquete la tenga.
- Notas técnicas específicas del vehículo y condiciones: vigencia, tiempo estimado, garantía, autorización previa para trabajo adicional y formas de pago.
- Espacio de firma y nombre del cliente, con fecha.

### Qué corrige el PDF de Reymen

- **Precios netos, IVA calculado.** En el documento de referencia las líneas ya sumaban el total con IVA, pero se presentaban junto a un subtotal neto de $3,793.10 e IVA de $606.90, lo que hacía ver los precios unitarios como netos cuando en realidad eran brutos. En Reymen cada línea se captura y se muestra con precio unitario neto, y el PDF muestra subtotal neto, IVA del 16 % y total. El cliente ve el total con IVA incluido de forma destacada.
- **Costo y utilidad fuera del PDF del cliente.** El costo por línea y la utilidad solo se ven en la vista interna de Reymen. Nunca se imprimen en el documento que recibe el cliente.
- **Datos obligatorios sin espacios en blanco.** Nombre y teléfono o WhatsApp del cliente, placas, kilometraje y VIN deben estar capturados antes de generar un PDF con folio. Si falta alguno, el sistema solo genera un estimado sin folio.
- **Folios desde cero en Reymen.** La secuencia de folios nace con el módulo, con el formato que defina la configuración de la organización. El folio de referencia no se reutiliza ni se continúa.

### Ejemplo recalculado con la referencia

La tabla siguiente toma los importes con IVA del documento de referencia y los convierte a neto dividiendo entre 1.16, para validar que el cálculo de Reymen cuadra con el mismo total. Los costos no venían en el documento de referencia, por lo que no se inventan: en Reymen se capturan por línea y la utilidad se calcula cuando existen.

| Concepto | Cant. | Importe con IVA | Precio neto | IVA |
|---|---:|---:|---:|---:|
| Aceite de motor 100 % sintético 5W-30 | 4 L | $1,095.00 | $943.97 | $151.03 |
| Filtro de aceite | 1 pza | $230.00 | $198.28 | $31.72 |
| Filtro de aire de motor | 1 pza | $360.00 | $310.34 | $49.66 |
| Bujías de iridio | 3 pzas | $810.00 | $698.28 | $111.72 |
| Filtro de cabina / polen | 1 pza | $320.00 | $275.86 | $44.14 |
| Mano de obra de afinación mayor | 1 serv. | $1,200.00 | $1,034.48 | $165.52 |
| Limpieza de inyectores y cuerpo de aceleración | 1 serv. | $385.00 | $331.90 | $53.10 |
| Escaneo y borrado de códigos | 1 serv. | $0.00 | $0.00 | $0.00 |
| **Total** |  | **$4,400.00** | **$3,793.10** | **$606.90** |

La suma línea por línea puede variar un centavo por redondeo. El total oficial es el del encabezado: subtotal neto $3,793.10, IVA $606.90 y total $4,400.00. El sistema debe ajustar el redondeo en la última línea para que el PDF siempre cuadre con esos totales.

En la vista interna, cada línea de este ejemplo mostraría además costo unitario neto, costo total y utilidad. En el PDF del cliente solo aparecen precio neto, IVA y total.

## Modelo comercial propuesto para Taller Wolf

Decisión del 20 de noviembre de 2026:

| Concepto | Monto | Estado |
|---|---:|---|
| Implementación | $0 MXN | Exenta como piloto familiar |
| Suscripción mensual | MXN 1,999 / mes | Tentativa, a confirmar |

No se define en este spec fecha de inicio de cobro de la suscripción ni ningún otro cargo. La suscripción tentativa no es un precio cerrado para otros talleres; cada cliente futuro de la vertical Talleres se cotiza por separado.

A cambio del piloto sin implementación, lo que se espera de Taller Wolf es uso real diario y retroalimentación: qué falta en recepción, qué frena la cotización y qué reporte de caja se revisa al cierre. Ese aprendizaje es el que convierte el módulo en un producto vendible para otros talleres.

## Alcance y fases

### Arranque desde cero

El módulo arranca vacío. No se migra ningún dato del sistema improvisado que el cuñado hizo en su propia cuenta de Muse, porque ese sistema no es de Reymen ni está bajo su control. No se importa el cliente, ni la orden, ni la cotización que se veían en las capturas. Todo — clientes, vehículos, refacciones, servicios, paquetes y folios — se captura y se numera desde cero dentro de Reymen.

### MVP — primera versión usable

- Activación del módulo `WORKSHOP` por organización, con ruta `/portal/workshop` y pestañas Panel, Cotizaciones, Órdenes, Vehículos, Inventario, Compras, Caja y Configuración.
- Vehículos con placas, VIN y kilometraje obligatorios para abrir orden.
- Cotizaciones con líneas de costo y precio netos, cálculo de IVA, PDF corregido y estados completos.
- Conversión de cotización aprobada a orden en un clic, sin recaptura.
- Inventario con movimientos y descuento automático contra orden.
- Compras ligadas a inventario y a caja.
- Caja con anticipos, pagos, egresos y corte diario, y Panel calculado desde datos reales.
- Historial por vehículo.
- Roles del piloto: dueño con acceso total y, si se confirma, mecánico encargado con acceso operativo sin costos, utilidad ni cambio de precios.
- Registro en la orden de si el cliente pidió factura. La factura misma se genera fuera del módulo en el MVP.

### Fuera del MVP

- Facturación electrónica integrada. El taller sí factura bajo demanda cuando el cliente lo pide, pero en el MVP esa factura se genera fuera del módulo. La integración queda para la fase siguiente.
- Agenda de citas con calendario y recordatorios automáticos por WhatsApp.
- Comisiones por mecánico y nómina.
- Varias cajas, varias sucursales y traspasos entre sucursales.
- Portal del cliente para aprobar cotizaciones en línea.

Esas funciones se evalúan después de que el MVP se use a diario en Taller Wolf. Agregarlas antes repetiría el error del prototipo: verse completo sin controlar lo básico.

### Fase siguiente, solo con uso real comprobado

- Recordatorios de próximo servicio automatizados con n8n.
- Envío de cotización y avisos de vehículo listo por WhatsApp desde Reymen.
- Reportes de utilidad por orden, por servicio y por mecánico.
- Paquetes de servicio reutilizables, por ejemplo afinación mayor, con líneas precargadas de costo y precio editables.

## Landing page de Taller Wolf

Como parte del mismo proyecto se incluye una landing page profesional para Taller Wolf. No es un sitio aparte desconectado: es la entrada pública del módulo Talleres para ese taller, integrada con Reymen. Está incluida en la implementación de $0 MXN del piloto familiar, salvo indicación contraria posterior.

### Objetivo

Que un cliente potencial entienda en una pantalla qué hace el taller, por qué confiar y cómo pedir una cotización, y que esa solicitud entre directo al CRM de Reymen sin capturas manuales posteriores.

### Estructura propuesta

- **Hero.** Taller Wolf, Servicio Automotriz, Monterrey, N.L., con una frase corta de servicio y un botón principal para pedir cotización por WhatsApp o por formulario. Sin promesas ni cifras que el taller no haya confirmado.
- **Servicios.** Lista básica y provisional confirmada el 20 de noviembre de 2026 para avanzar sin esperar la lista completa del taller: afinación mayor, afinación menor, cambio de aceite y filtros, frenos, suspensión, diagnóstico electrónico / escaneo, revisión de 20 puntos, cambio de batería, y rotación y balanceo. Esta lista se publica como servicios generales del taller y se reemplaza por la lista real y definitiva en cuanto el cuñado la comparta.
- **Por qué elegirlo.** Garantía de 90 días o 5,000 km en mano de obra, lo que ocurra primero, como consta en la cotización de referencia, y refacciones con la garantía de su fabricante. Ningún trabajo adicional se realiza sin autorización previa del cliente. No se agregan años de experiencia, número de clientes ni testimonios que no estén confirmados.
- **Cómo funciona.** Cuatro pasos: el cliente pide cotización por WhatsApp o formulario con los datos de su vehículo, el taller hace el diagnóstico, el cliente aprueba la cotización por escrito y, al terminar, se entrega el vehículo con su garantía. Ese flujo es el mismo que ejecuta el módulo por dentro.
- **Formulario de cotización.** Nombre, teléfono o WhatsApp, marca, modelo, año, placas, kilometraje y servicio o falla que reporta. Al enviarlo se crea la solicitud en Reymen.
- **Ubicación, horarios y contacto.** Dirección: Burocratas 515, Colonia Burócratas del Estado, Monterrey, N.L. Teléfono / WhatsApp: 8711079931. Horarios: lunes a viernes de 9am a 7pm, sábados de 9am a 3pm.

Datos de dirección, teléfono / WhatsApp y horarios confirmados el 20 de noviembre de 2026.

### Conexión con Reymen

- Cada envío del formulario crea un Lead en el CRM de Reymen, asociado a la organización de Taller Wolf y con origen landing.
- El botón de WhatsApp abre la conversación con un mensaje prellenado con los datos del vehículo capturados en el formulario, cuando el cliente ya los escribió.
- Desde ese Lead, el taller puede crear el cliente, el vehículo y la cotización en Talleres sin volver a capturar marca, modelo, año, placas y kilometraje.
- La landing respeta la activación del módulo: si Talleres no está activo para la organización, la landing no se publica.

### Diseño

- Logotipo confirmado el 20 de noviembre de 2026: cabeza de lobo blanca sobre fondo negro, texto WOLF en plata / blanco, y eslogan MECÁNICA QUE TE RESPALDA en blanco con líneas rojas a los lados.
- Los puntos blancos del lado izquierdo de la imagen original no forman parte del logotipo. Se quitan en la versión limpia, guardada como `taller-wolf-logo-limpio.png`, que es la que se usa en la landing y en los documentos.
- Colores de Taller Wolf tomados del logotipo confirmado: negro de fondo, blanco y plata para el lobo y el texto, y rojo como acento en las líneas del eslogan.
- La marca Reymen aparece solo como plataforma que opera el sistema, sin competir con la marca del taller frente al cliente final.
- Diseño responsive, pensado primero para celular, porque la mayoría de las solicitudes llegará desde WhatsApp y redes sociales.
- Una sola página, sin blog ni secciones adicionales en el piloto.

### Pendientes para publicar la landing

- Lista real y definitiva de servicios, validada con el taller, para reemplazar la lista básica provisional ya definida en este spec. La falta de esta lista no bloquea el avance de la landing.
- Fotografías reales del taller, si se van a mostrar. No se usan fotografías de archivo presentadas como si fueran del taller.

## Criterios de aceptación del MVP

- Una organización sin el módulo activo no ve Talleres ni puede abrir sus rutas; una con el módulo activo entra a `/portal/workshop` sin errores.
- Se puede crear un cliente en el CRM, agregarle un vehículo con placas, VIN y kilometraje, y abrirle una cotización.
- Una cotización con líneas de costo y precio netos calcula subtotal neto, IVA del 16 %, total y utilidad interna, y genera un PDF que cuadra al centavo y no muestra costos.
- Sin nombre, teléfono, placas, kilometraje y VIN completos, no se genera PDF con folio.
- Una cotización aprobada se convierte en orden en un clic, copiando todas sus líneas, y no se puede convertir dos veces.
- Al trabajar la orden, las refacciones ligadas a inventario descuentan existencia con su movimiento; sin existencia, el sistema obliga a registrar la compra.
- Todo anticipo, pago y compra pagada se refleja en caja, y el Panel muestra órdenes activas, listas para entregar, cotizaciones pendientes, compras, balance e ingresos del día calculados desde los datos, no capturados.
- Una orden con saldo pendiente no se marca entregada sin registrar el crédito de forma explícita.
- El historial de un vehículo muestra todas sus cotizaciones y órdenes en orden cronológico.
- La landing de Taller Wolf, con sus datos confirmados, publica las secciones definidas en este spec y cada envío de su formulario crea un Lead en el CRM con los datos del vehículo.
- El dueño ve costos, precios, utilidad y caja; un usuario con rol de mecánico encargado no ve costos ni utilidad y no puede cambiar precios.
- Una orden puede marcarse como que requiere factura y sus totales neto, IVA y total quedan listos para facturar fuera del módulo, sin que el MVP prometa timbrado integrado.
- La landing y el catálogo inicial muestran solo la lista básica provisional de servicios definida en este spec, identificada internamente como provisional hasta que llegue la lista completa.

## Lista de trabajo para desarrollo

1. Esquema de base de datos: enumerado `WORKSHOP`, tablas de vehículo, cotización, líneas, orden, refacción, movimientos de inventario, compra y movimientos de caja, todas con `organizationId`.
2. Registro del módulo en `src/lib/modules.ts`, entitlement por organización y guardas con `requireModule`.
3. Rutas y pestañas de `/portal/workshop`, con Panel calculado.
4. Formularios de vehículo, cotización y orden, con validaciones de campos obligatorios.
5. Motor de cálculo neto, IVA, total, costo y utilidad, con ajuste de redondeo.
6. Generador de PDF de cotización y de orden con la estructura corregida.
7. Conversión cotización a orden, movimientos de inventario y de caja en transacciones.
8. Landing de Taller Wolf conectada al CRM, con creación de Lead por solicitud.
9. Pruebas con el ejemplo recalculado de afinación mayor de este spec: el total debe ser $4,400.00 con subtotal neto de $3,793.10 e IVA de $606.90.
10. Documentación del módulo en el repositorio, siguiendo el precedente de documentar por módulo para que el trabajo pueda continuarse en otra sesión.

## Decisiones cerradas y pendientes

### Cerradas el 20 de noviembre de 2026

- Talleres va dentro de Reymen, como módulo. No es un sistema aparte.
- Se empieza desde cero en Reymen. No se migra el sistema improvisado de la cuenta del cuñado.
- La cotización del Audi A1 2021 por $4,400.00 es solo referencia de formato y contenido para el PDF.
- Implementación para Taller Wolf: $0 MXN, exenta como piloto familiar.
- Se incluye la landing page de Taller Wolf en el proyecto, conectada al CRM.
- Datos de la landing confirmados: dirección Burocratas 515, Colonia Burócratas del Estado, Monterrey, N.L.; teléfono / WhatsApp 8711079931; horarios: lunes a viernes de 9am a 7pm, sábados de 9am a 3pm.
- Logotipo confirmado el 20 de noviembre de 2026: cabeza de lobo blanca sobre fondo negro, texto WOLF en plata / blanco, eslogan MECÁNICA QUE TE RESPALDA en blanco con líneas rojas a los lados. Los puntos blancos del lado izquierdo de la imagen original no forman parte del logotipo y se quitan en la versión limpia, `taller-wolf-logo-limpio.png`.
- Facturación: el taller sí factura cuando el cliente lo requiere, bajo demanda. En el MVP no hay facturación electrónica integrada; la factura se genera fuera del módulo y la integración queda para la fase siguiente.
- Usuarios del piloto: el dueño del taller como administrador total, y probablemente un mecánico encargado como usuario operativo (ver órdenes, actualizar estados y subir fotos, sin ver costos ni utilidad y sin cambiar precios). El segundo usuario es probable, no confirmado al 100 %.
- Servicios para arrancar: se usa la lista básica y provisional de este spec (afinación mayor, afinación menor, cambio de aceite y filtros, frenos, suspensión, diagnóstico electrónico / escaneo, revisión de 20 puntos, cambio de batería, rotación y balanceo) mientras llega la lista completa.

### Pendientes, sin inventar respuesta

- Confirmación de la suscripción tentativa de MXN 1,999 al mes y, en su momento, su fecha de inicio de cobro.
- Lista real y completa de servicios del taller, para reemplazar la lista básica provisional en la landing y en el catálogo.
- Fotografías reales del taller para la landing, si se van a mostrar.
- Confirmación de si habrá mecánico encargado con acceso al módulo y, en ese caso, su nombre. El rol y sus permisos ya están definidos en este spec.
- Catálogo inicial de refacciones y servicios con costo y precio reales, capturado desde cero en Reymen.

Con esas respuestas, el siguiente paso es pasar esta lista de trabajo a Codex o Claude sobre el repositorio, empezando por el esquema de datos y la activación del módulo.
