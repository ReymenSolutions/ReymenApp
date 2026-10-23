/**
 * Detección de bots/crawlers/previews para `events.is_bot` (Fase 2, columna
 * pensada exactamente para esto -- ver comentario original: "true cuando el
 * user_agent coincide con un bot/crawler/preview conocido"). No es
 * infalible (ningún detector por user-agent lo es) -- el objetivo es filtrar
 * el ruido más común: motores de búsqueda, y sobre todo los "unfurlers" de
 * apps de mensajería (WhatsApp, Telegram, Slack, iMessage) que abren la URL
 * de una tarjeta para generar la vista previa del link, cosa que pasa
 * constantemente en un producto que se comparte por WhatsApp y no debería
 * contarse como un escaneo real.
 */
const BOT_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /googlebot/i,
  /bingbot/i,
  /yandexbot/i,
  /duckduckbot/i,
  /baiduspider/i,
  /facebookexternalhit/i,
  /whatsapp/i,
  /telegrambot/i,
  /slackbot/i,
  /discordbot/i,
  /twitterbot/i,
  /linkedinbot/i,
  /pinterest/i,
  /applebot/i,
  /embedly/i,
  /quora link preview/i,
  /outbrain/i,
  /vkshare/i,
  /w3c_validator/i,
  /preview/i,
  /headlesschrome/i,
  /lighthouse/i,
  /pingdom/i,
  /uptimerobot/i,
]

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false
  return BOT_PATTERNS.some((pattern) => pattern.test(userAgent))
}
