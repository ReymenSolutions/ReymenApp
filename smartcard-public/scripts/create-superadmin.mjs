#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Crea el primer SUPERADMIN (o cualquier admin, si hiciera falta hacerlo
// fuera del panel). Es la única pieza de Fase 4 que corre fuera de la app --
// necesaria porque el primer SUPERADMIN no puede invitarse a sí mismo desde
// un panel al que todavía nadie puede entrar (DATABASE.md, sección 10).
//
// Los siguientes admins se invitan desde el propio panel en una fase futura
// (carpeta app/users/ de ARCHITECTURE.md) reusando el mismo mecanismo:
// auth.admin.inviteUserByEmail() + una fila en admin_profiles.
//
// Uso (desde la raíz del proyecto):
//   node scripts/create-superadmin.mjs --email correo@ejemplo.com --name "Nombre Completo"
//
// Opcional:
//   --role SUPERADMIN|ADMIN|VIEWER   (default: SUPERADMIN)
//   --admin-url http://127.0.0.1:3001  (default: ADMIN_URL del entorno, o
//                                        http://127.0.0.1:3001)
//
// Requiere, en apps/admin/.env.local (o exportadas en la shell):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Ver AUTH.md para el paso manual que falta antes de que el correo de
// invitación funcione (plantilla + redirect URLs en supabase/config.toml).
// -----------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnvLocal(envPath) {
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // apps/admin/.env.local es la fuente de verdad para este script -- si ya
    // existe una variable con el mismo nombre en el entorno (por ejemplo, de
    // una sesión de PowerShell donde se exportó a mano en un intento
    // anterior), la de .env.local la reemplaza, nunca al revés. La versión
    // previa de este script hacía lo contrario (`if (!(key in process.env))`)
    // y eso podía dejar corriendo silenciosamente una llave vieja aunque
    // .env.local ya tuviera la correcta.
    process.env[key] = value
  }
}

loadEnvLocal(path.join(__dirname, '..', 'apps', 'admin', '.env.local'))

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      args[key] = next
      i += 1
    } else {
      args[key] = true
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))

const email = args.email
const fullName = args.name
const role = args.role ?? 'SUPERADMIN'
const adminUrl = args['admin-url'] ?? process.env.ADMIN_URL ?? 'http://127.0.0.1:3001'

if (!email || !fullName) {
  console.error(
    'Uso: node scripts/create-superadmin.mjs --email correo@ejemplo.com --name "Nombre Completo" [--role SUPERADMIN|ADMIN|VIEWER] [--admin-url http://127.0.0.1:3001]'
  )
  process.exit(1)
}

if (!['SUPERADMIN', 'ADMIN', 'VIEWER'].includes(role)) {
  console.error(`Rol inválido: ${role}. Debe ser SUPERADMIN, ADMIN o VIEWER.`)
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Corre este script desde la raíz del proyecto con apps/admin/.env.local ya creado,\n' +
      'o expórtalas en la shell antes de correrlo.'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // Diagnóstico: solo muestra el arranque de la llave (nunca la llave
  // completa) para poder confirmar a simple vista cuál se está usando de
  // verdad, sin tener que adivinar si el archivo se leyó bien.
  console.log(`Usando URL: ${supabaseUrl}`)
  console.log(`Usando service role key: ${serviceRoleKey.slice(0, 12)}... (${serviceRoleKey.startsWith('eyJ') ? 'formato JWT, correcto' : 'NO es un JWT -- este es el problema'})`)
  console.log(`Invitando a ${email} como ${role}...`)

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${adminUrl}/auth/confirm`,
  })

  if (error || !data?.user) {
    console.error('No se pudo invitar al usuario:', error?.message ?? 'respuesta vacía')
    process.exit(1)
  }

  const { error: profileError } = await supabase.from('admin_profiles').insert({
    id: data.user.id,
    full_name: fullName,
    role,
  })

  if (profileError) {
    console.error(
      'El usuario de Auth se creó, pero falló la fila en admin_profiles:',
      profileError.message
    )

    const { error: rollbackError } = await supabase.auth.admin.deleteUser(data.user.id)
    if (rollbackError) {
      console.error(
        `Y no se pudo revertir el usuario de Auth huérfano (id ${data.user.id}). Bórralo a mano desde el dashboard de Supabase.`
      )
    } else {
      console.error('El usuario de Auth huérfano se eliminó automáticamente. Corrige el error e intenta de nuevo.')
    }
    process.exit(1)
  }

  console.log('Listo. Invitación enviada.')
  console.log(
    'En local, revisa Inbucket (el buzón de pruebas de Supabase CLI) para ver el correo -- normalmente en http://127.0.0.1:54324.'
  )
  console.log(
    `Si el correo no llega o el link no funciona, confirma en supabase/config.toml que "${adminUrl}/auth/confirm" está en additional_redirect_urls y que existe la plantilla de invite (ver AUTH.md).`
  )
}

main()
