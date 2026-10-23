/**
 * Genera un .vcf (vCard 3.0 -- el que más ampliamente soportan Contactos de
 * iOS y Android; 4.0 todavía tiene soporte irregular en algunos clientes) a
 * partir de exactamente los campos que devuelve `get_vcard_data()` (Fase 2).
 * Vive en `packages/lib` porque es la pieza que ARCHITECTURE.md ya reservaba
 * ahí ("VCard builder") -- la usa `apps/public/app/api/vcard/[slug]/route.ts`
 * en Fase 11.
 */
export interface VCardData {
  first_name: string | null
  last_name: string | null
  company: string | null
  job_title: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  address: string | null
}

// Escapa los caracteres que el formato vCard reserva (RFC 6350 sección 3.4).
function escapeVCardValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function buildVCard(data: VCardData): string {
  const first = data.first_name?.trim() ?? ''
  const last = data.last_name?.trim() ?? ''
  const fullName = [first, last].filter(Boolean).join(' ') || data.company?.trim() || 'Contacto'

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVCardValue(last)};${escapeVCardValue(first)};;;`,
    `FN:${escapeVCardValue(fullName)}`,
  ]

  if (data.company) lines.push(`ORG:${escapeVCardValue(data.company)}`)
  if (data.job_title) lines.push(`TITLE:${escapeVCardValue(data.job_title)}`)
  if (data.phone) lines.push(`TEL;TYPE=CELL,VOICE:${escapeVCardValue(data.phone)}`)
  if (data.whatsapp && data.whatsapp !== data.phone) {
    lines.push(`TEL;TYPE=CELL,VOICE,X-WHATSAPP:${escapeVCardValue(data.whatsapp)}`)
  }
  if (data.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardValue(data.email)}`)
  if (data.website) lines.push(`URL:${escapeVCardValue(data.website)}`)
  if (data.address) lines.push(`ADR;TYPE=WORK:;;${escapeVCardValue(data.address)};;;;`)

  lines.push('END:VCARD')

  // vCard exige terminadores de línea CRLF explícitos (RFC 6350).
  return lines.join('\r\n') + '\r\n'
}
