import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@reymen/database'

// Next.js 16 renombró `middleware.ts` a `proxy.ts` (sigue siendo el mismo
// mecanismo -- corre antes de cada request -- solo cambió el nombre del
// archivo y de la función exportada; ya no corre en Edge por defecto, sino
// en el runtime de Node.js). Ver node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
//
// Únicas rutas alcanzables sin sesión (sección 8 de ARCHITECTURE.md: "exige
// sesión válida en toda ruta salvo /login"). /auth/confirm también debe ser
// pública -- es la que establece la sesión al consumir un link de invitación
// (o de recuperación, Fase 13), así que por definición nadie llega ahí ya
// logueado. /forgot-password también: es justo la pantalla para alguien que
// NO puede iniciar sesión. /set-password NO está en esta lista a propósito
// -- para cuando el navegador llega ahí, `verifyOtp` en /auth/confirm ya
// estableció la sesión, así que pasa como cualquier ruta protegida normal,
// no como excepción.
const PUBLIC_PATHS = ['/login', '/auth/confirm', '/forgot-password']

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createMiddlewareClient(
    () => request.cookies.getAll(),
    (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
      response = NextResponse.next({ request })
      cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
    }
  )

  // getUser() valida el token contra Supabase Auth en cada request.
  // getSession() solo lee la cookie y podría confiar en un JWT ya inválido
  // -- nunca se usa para autorizar acceso, solo getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user) {
    if (isPublicPath(pathname)) return response

    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Sesión válida en Supabase Auth, pero eso no basta: sin registro público
  // (DATABASE.md sección 19), un usuario autenticado sin fila activa en
  // admin_profiles no debe pasar. admin_profiles siempre se crea junto con
  // el auth.users correspondiente, así que llegar aquí sin fila es una señal
  // de que algo se borró a mano o quedó a medias -- se trata como sin acceso.
  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_active) {
    await supabase.auth.signOut()
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'inactive')
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
