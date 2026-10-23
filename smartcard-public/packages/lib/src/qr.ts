import QRCode from 'qrcode'

/**
 * Fase 12 -- generación del código QR real de una tarjeta. Hasta ahora
 * `/q/{code}` (Fase 11) ya sabía qué hacer con un scan, pero no existía
 * nada que produjera la IMAGEN que alguien de verdad escanea: ni en el
 * panel, ni para imprimir en la tarjeta física.
 *
 * Se genera del lado del servidor (Node, vía la librería `qrcode`, sin
 * dependencia de canvas nativo) en vez de con una librería de cliente --
 * consistente con el resto del proyecto (ver FASE11.md sección 3): no hace
 * falta JavaScript en el navegador para ver ni descargar el código.
 */

/** El QR de una tarjeta siempre codifica su entrypoint de QR (`/q/{code}`),
 * nunca el de NFC (`/n/{code}`) -- son canales físicos distintos (sección 5
 * de ARCHITECTURE.md: "flujo de resolución NFC/QR"), y solo el de QR
 * necesita convertirse en una imagen. `siteUrl` es la URL pública real de
 * `apps/public` (nunca la del panel) -- quien la resuelve es quien llama a
 * esta función. */
export function buildCardQrTargetUrl(siteUrl: string, cardCode: string): string {
  return `${siteUrl.replace(/\/$/, '')}/q/${cardCode}`
}

/**
 * PNG listo para `<img>` o para descargar e imprimir. `errorCorrectionLevel:
 * 'M'` (15% de tolerancia a daño/suciedad) es el nivel por defecto de la
 * librería y el que recomienda la propia documentación de QR para uso
 * general impreso -- 'H' (30%) solo hace falta si el código va a llevar un
 * logo superpuesto encima, que no es el caso aquí.
 */
export function generateCardQrPng(targetUrl: string): Promise<Buffer> {
  return QRCode.toBuffer(targetUrl, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
  })
}
