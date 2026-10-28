# Programar el pase a producción

Estado: NO PROGRAMAR DESPLIEGUE mientras SEC-01 y SEC-02 permanezcan abiertos. Main es la rama de entrega; un PR permite revisar y validar cambios antes de incorporarlos a main. Fusionar no reinicia el VPS.

1. Definir candidato: registrar SHA exacto de App y POS, CI aprobado y lista de migraciones desde la versión actualmente instalada. No usar un main que cambie durante el pase.
2. Cerrar bloqueos de seguridad y probar el candidato en staging. Prueba conjunta de ventas, CRM, visitas, canje único con dos cajas, cancelación, red interrumpida y recuperación. Registrar folios sintéticos y resultados.
3. Preparar recuperación: respaldo PostgreSQL, configuración privada, almacenamiento POS y versión de imágenes anteriores; copia fuera del VPS y restauración probada en base separada. No copiar secretos al chat.
4. Acordar ventana con el negocio fuera del horario de cobro; responsable de ejecución y responsable que valida. Estimar duración según ensayo, no prometer cero interrupción. Confirmar ventas pendientes sincronizadas y disponibilidad de soporte.
5. Ejecutar actualización aprobada: App antes de POS si el contrato sigue siendo compatible, comprobar salud y logs después de cada servicio. El script App actual hace pull de main y puede aplicar migraciones automáticamente; revisar y congelar el candidato antes de usarlo. No ejecutarlo para una simple inspección.
6. Aceptación: login, módulos, menú/precios/sucursal, venta/CRM/Loyalty/canje, cancelación y sincronización; revisar errores y trabajos pendientes. Confirmar versión servida, no solo que el contenedor está running.
7. Si falla: detener expansión, conservar evidencia y recuperar imagen anterior únicamente si es compatible con el esquema. Restaurar DB requiere evaluar ventas posteriores al respaldo; nunca restaurarla a ciegas ni ejecutar down -v. Reanudar tras conciliación y aceptación.
8. Vigilar errores, colas, duplicados y costos durante la primera jornada. Entregar al cliente manual y acta de aceptación con versión y limitaciones.

## Consulta previa segura en Termius
Este comando solo muestra versiones y estado; no actualiza ni revela variables de entorno:

```bash
sudo bash -c 'set -e; sudo -u emilianorm git -C /home/emilianorm/reymen-ai-ops-preview status --short --branch; sudo -u emilianorm git -C /home/emilianorm/reymen-ai-ops-preview rev-parse HEAD; sudo -u reynolrm git -C /home/reynolrm/reymen-pos status --short --branch; sudo -u reynolrm git -C /home/reynolrm/reymen-pos rev-parse HEAD; docker ps --format "table {{.Names}}\t{{.Status}}"; df -h /; free -h'
```

Los comandos de actualización definitiva deben entregarse al cerrar bloqueos, con SHA de candidato verificado y plan de recuperación. No hay despliegue autorizado ni ejecutado por este documento.
