# Lealtad: programas por miembro y descuentos en POS

## Despliegue

Actualizar App antes del POS. `deploy/update.sh` exige main, respalda antes de
migrar y verifica salud. Las dos migraciones agregan columnas/tablas, conservan
historial y eligen un programa predeterminado por negocio y una membresía
seleccionada por cliente. No ejecutar seed de demostración en producción.

El POS requiere su propia actualización. La versión anterior puede seguir
reportando ventas; el canje automático requiere ambas versiones. Para revertir
código, mantener las columnas nuevas y usar la imagen anterior; no borrar tablas
ni restaurar una base antigua sobre ventas posteriores. Cancelaciones de ventas
con total cero necesitan el productor nuevo y la columna isCancellation.

## Operación

- Admin → Planes/organización: habilitar LOYALTY y REYMEN_POS según los permisos
  existentes. Crear varios programas activos desde Lealtad → Programa.
- El predeterminado solo define la opción inicial de inscripción y la vista.
  Cada miembro puede cambiar su elección en su tarjeta privada. Las nuevas
  visitas se suman a su elección; historial y premios anteriores permanecen.
  Una venta ya recibida conserva la elección capturada al recibirla aunque se
  procese después. Las ventas offline usan la elección al sincronizarse.
- Configurar valor fijo MXN o porcentaje. Los cambios afectan premios nuevos;
  los anteriores conservan su valor, incluidos los que siguen con canje manual.
- El POS propone el premio monetario disponible más antiguo de los programas
  activos del cliente, limitado a la sucursal cuando corresponda. Puede quitarse
  antes de cobrar; no se combina con otro descuento ni con cuenta dividida.
- Reserva por venta, bloqueo por miembro e índices únicos impiden gastar el
  mismo premio simultáneamente. La confirmación y devolución pasan por eventos
  durables; el cron existente debe seguir ejecutándose.
- Las reservas no vencen: una venta local pagada puede llegar tarde. Una cuenta
  abandonada puede liberar su reserva desde la misma caja con conexión. Cobrar
  sin canje sigue disponible si Lealtad no responde.
- CP opcional se sincroniza a Customer y sus membresías. Cumpleaños opcional se
  captura con consentimiento; no se da de alta automáticamente una membresía.
- Visitas manuales se ven en el historial de Lealtad de Business Customers;
  no representan ventas POS ni inflan sus estadísticas contables.

## Validación en producción

Con un cliente de prueba: elegir entre dos programas, registrar una venta con
su teléfono y verificar una sola visita en el seleccionado tras el tick. Obtener
un premio, aplicarlo al cobrar y cancelar: confirmar descuento y devolución una
sola vez. Repetir con total cero y con reintento de sincronización. Verificar CP
con cero inicial, cumpleaños opcional y separación entre organizaciones.

En móvil, abrir/cerrar menú y navegar atrás varias veces; el gesto desde el borde
queda reservado al navegador, el menú se abre con el botón. La vista Cocina no
cambia; la bandeja flotante se retira del modo de caja. Se incluyen skeletons,
error con reintento y preservación de scroll. Validar también en iPhone real.

## Identificación en caja y ficha de clientes

El POS consulta al cliente al completar su teléfono y muestra nombre, consentimiento
registrado, programa elegido y recompensas. Es una consulta, no una nueva visita.
La compra sigue generando la visita mediante el evento existente al sincronizarse.
El consentimiento anterior no se sustituye si el cajero no cambia la casilla.

En CRM, Clientes reúne compras y Lealtad; Contactos sirve para seguimiento comercial.
La ficha de cada cliente muestra cinco movimientos por página y visitas de Lealtad
en apartados desplegables. Se conserva todo el historial, incluidas compras antiguas;
no existe borrado ni filtro de retención a los 30 días. No requiere migraciones.
