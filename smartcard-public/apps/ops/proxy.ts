import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@reymen/database'

// Mismo mecanismo que apps/admin/proxy.ts (Next.js 16 renombró
// middleware.ts a proxy.ts -- ver el comentario allá). La diferencia real:
// en vez de admin_profiles.is_active, aquí se exige una fila 'active' en
// company_users -- 'invited'/'suspended'/'removed' no pasan (sección 89 del
// prompt maestro: RLS y esta puerta usan el mismo criterio de 'active').
const PUBLIC_PATHS = ['/login', '/auth/confirm', '/forgot-password', '/api/sso/smartcard']

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
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (pathname === '/no-access') return response

  // Sesión válida en Supabase Auth, pero eso no basta: sin ninguna fila
  // 'active' en company_users, no hay ninguna empresa que mostrar. A
  // diferencia de apps/admin (donde eso es una señal de algo roto), aquí es
  // un estado normal y esperado -- alguien invitado que todavía no acepta,
  // o alguien cuyo acceso se suspendió -- por eso manda a una pantalla
  // explicativa en vez de cerrar la sesión de inmediato.
  const { data: membership } = await supabase
    .from('company_users')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!membership) {
    return NextResponse.redirect(new URL('/no-access', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
